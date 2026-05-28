use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Timelike, Weekday};
use cron::Schedule as CronSchedule;
use std::str::FromStr;

use crate::commands::kanban::myra_agents_dir;
use crate::models::scheduled_task::{ScheduleKind, ScheduledTask};

/// Path to `~/.myra-agents/schedules.json`.
pub fn schedules_path() -> PathBuf {
    myra_agents_dir().join("schedules.json")
}

pub fn load_schedules() -> Vec<ScheduledTask> {
    let path = schedules_path();
    if !path.exists() {
        return Vec::new();
    }
    let content = fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_default()
}

pub fn save_schedules(schedules: &[ScheduledTask]) {
    let path = schedules_path();
    let content =
        serde_json::to_string_pretty(schedules).expect("Failed to serialize schedules");
    let _ = fs::write(path, content);
}

// ─────────────────────────────────────────────
// Next-run computation
// ─────────────────────────────────────────────

/// Parse `HH:MM[:SS]` into a `NaiveTime`. Returns `None` if invalid.
fn parse_time(s: &str) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(s, "%H:%M:%S")
        .or_else(|_| NaiveTime::parse_from_str(s, "%H:%M"))
        .ok()
}

/// Parse a local ISO datetime (`YYYY-MM-DDTHH:MM[:SS]`).
fn parse_local_dt(s: &str) -> Option<DateTime<Local>> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M"))
        .ok()
        .and_then(|naive| Local.from_local_datetime(&naive).single())
}

fn weekday_from_iso(n: u8) -> Option<Weekday> {
    match n {
        1 => Some(Weekday::Mon),
        2 => Some(Weekday::Tue),
        3 => Some(Weekday::Wed),
        4 => Some(Weekday::Thu),
        5 => Some(Weekday::Fri),
        6 => Some(Weekday::Sat),
        7 => Some(Weekday::Sun),
        _ => None,
    }
}

/// Compute the next run date-time for a schedule given the current time and
/// the last triggered time (if any). Returns `None` if the schedule has no
/// further occurrences (e.g. a `Once` that already fired).
pub fn compute_next_run(
    schedule: &ScheduledTask,
    now: DateTime<Local>,
) -> Option<DateTime<Local>> {
    if !schedule.enabled {
        return None;
    }

    let last = schedule
        .last_triggered_at
        .as_deref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Local));

    match &schedule.schedule {
        ScheduleKind::Once { at } => {
            let dt = parse_local_dt(at)?;
            // If never fired and the time is in the future → that's the run.
            // If we're past `at` and never fired, fire ASAP (return `dt`,
            // the scheduler loop will trigger on the next tick).
            // If already fired (last.is_some()), no more runs.
            if last.is_some() {
                None
            } else {
                Some(dt)
            }
        }

        ScheduleKind::Daily { time } => {
            let t = parse_time(time)?;
            let candidate = now.date_naive().and_time(t);
            let candidate = Local.from_local_datetime(&candidate).single()?;
            if candidate > now && last.map(|l| l < candidate).unwrap_or(true) {
                Some(candidate)
            } else {
                // Tomorrow
                let tomorrow = (now + Duration::days(1)).date_naive().and_time(t);
                Local.from_local_datetime(&tomorrow).single()
            }
        }

        ScheduleKind::Weekly { days, time } => {
            let t = parse_time(time)?;
            if days.is_empty() {
                return None;
            }
            let allowed: Vec<Weekday> =
                days.iter().filter_map(|&d| weekday_from_iso(d)).collect();
            if allowed.is_empty() {
                return None;
            }
            // Search up to 8 days ahead.
            for offset in 0..=7i64 {
                let candidate_date: NaiveDate =
                    (now + Duration::days(offset)).date_naive();
                let candidate = candidate_date.and_time(t);
                let candidate = match Local.from_local_datetime(&candidate).single() {
                    Some(dt) => dt,
                    None => continue,
                };
                if !allowed.contains(&candidate.weekday()) {
                    continue;
                }
                if candidate <= now {
                    continue;
                }
                // Don't re-fire the same slot if last_triggered is past `candidate - 1m`
                if let Some(l) = last {
                    if (candidate - l).num_seconds() < 30 {
                        continue;
                    }
                }
                return Some(candidate);
            }
            None
        }

        ScheduleKind::Interval { start, minutes } => {
            let t = parse_time(start)?;
            if *minutes == 0 {
                return None;
            }
            // First occurrence ever is today at `start`. After that, advance by
            // `minutes` from the last triggered time.
            if let Some(l) = last {
                let next = l + Duration::minutes(*minutes as i64);
                Some(if next < now {
                    // We're behind — fire ASAP (one shot; loop will advance)
                    now + Duration::seconds(1)
                } else {
                    next
                })
            } else {
                let today_start = now.date_naive().and_time(t);
                let today_start = Local.from_local_datetime(&today_start).single()?;
                if today_start > now {
                    Some(today_start)
                } else {
                    // Advance from today_start by k*minutes until > now
                    let elapsed = (now - today_start).num_minutes().max(0) as u32;
                    let k = elapsed / *minutes + 1;
                    Some(today_start + Duration::minutes((k * *minutes) as i64))
                }
            }
        }

        ScheduleKind::Cron { expr } => {
            let schedule = CronSchedule::from_str(expr).ok()?;
            schedule.upcoming(Local).next()
        }
    }
}

/// Format the elapsed/upcoming as a human-readable schedule description.
#[allow(dead_code)]
pub fn describe(kind: &ScheduleKind) -> String {
    match kind {
        ScheduleKind::Once { at } => format!("Une fois — {}", at),
        ScheduleKind::Daily { time } => format!("Tous les jours à {}", time),
        ScheduleKind::Weekly { days, time } => {
            let names: Vec<&str> = days
                .iter()
                .filter_map(|d| match *d {
                    1 => Some("Lun"),
                    2 => Some("Mar"),
                    3 => Some("Mer"),
                    4 => Some("Jeu"),
                    5 => Some("Ven"),
                    6 => Some("Sam"),
                    7 => Some("Dim"),
                    _ => None,
                })
                .collect();
            format!("{} à {}", names.join("/"), time)
        }
        ScheduleKind::Interval { start, minutes } => {
            format!("Toutes les {} min depuis {}", minutes, start)
        }
        ScheduleKind::Cron { expr } => format!("Cron : {}", expr),
    }
}

/// Returns true if `dt` falls on the same local calendar day as `now`.
#[allow(dead_code)]
pub fn is_same_local_day(dt: DateTime<Local>, now: DateTime<Local>) -> bool {
    dt.year() == now.year() && dt.ordinal() == now.ordinal()
}

// Re-export for tests / internal callers.
#[allow(dead_code)]
pub fn now_hms() -> (u32, u32, u32) {
    let n = Local::now();
    (n.hour(), n.minute(), n.second())
}

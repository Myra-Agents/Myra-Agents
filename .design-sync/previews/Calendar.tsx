import { Calendar } from "myra-agents";

export function ScheduleDate() {
  return (
    <Calendar
      mode="single"
      defaultMonth={new Date(2026, 6, 1)}
      selected={new Date(2026, 6, 2)}
      showOutsideDays
      className="rounded-md border"
    />
  );
}

# Vision

> **Where Myra is going in the next 1–2 years.**

[MISSION.md](MISSION.md) holds the *why* — free yourself from repetitive work —
and it outlives every version of the product. This document is narrower and more
concrete: the world we're building toward **in the next 1–2 years**, the two big
bets we're making to get there, the principles that constrain how, and the
things we deliberately refuse to become.

If the mission is the horizon, the vision is the next ridge we're climbing.

---

## The picture, 1–2 years out

Today Myra is a desktop Kanban board that runs one CLI coding agent per card, on
a schedule, for a developer who's comfortable in a terminal. That's the seed —
not the tree.

Two years from now, opening Myra doesn't feel like launching a single agent. It
feels like walking into a room where **a colony is already at work**. Dozens of
agents run in parallel — some on a clock, some triggered by an event, some
waiting on another agent to finish — quietly producing work you'd rather not do
yourself. You don't wire each one up from a blank binary and an args template.
You **pull a proven setup from a shared library**, point it at your data, and
walk away.

The person walking into that room is increasingly **not a developer**. They
never open a terminal. They pick an automation that already works, describe what
they want in their own words, and trust it to run without them — the same way
today's developer trusts a cron job. The day that person outnumbers the
developer is the day this vision has paid off (it's the north-star split in
[MISSION.md](MISSION.md)).

The machine stays **theirs**. It runs local-first, on their hardware, on their
data. The colony grows, the work leaves the human — and none of that requires
handing the keys to someone else's cloud.

---

## The two bets

Everything we build in this window ladders up to one of these. If a feature
serves neither, it waits.

### Bet 1 — The colony, not the agent

One card, one agent, one run was the right place to start and the wrong place to
stay. The unit of value is the **colony**: many agents running in parallel,
coordinated, around the clock, so that the amount of work a single person can
delegate stops being bounded by how many things they can babysit at once.

What this pulls us toward:

- **Orchestration over isolation** — agents that hand off to each other, fan
  out, wait on a dependency, or react to another agent's result.
- **Parallelism as the default feeling** — the product should read as *a team
  working*, not *a task queue draining*. Scale is the point, not an edge case.
- **Set-and-forget survival** — the win condition is an agent that keeps
  producing clean runs weeks later with zero edits. The colony has to be
  trustworthy enough to leave alone.
- **The metaphor** — *Myra* is Swedish for *ant*. One agent is one
  ant; the setup is the colony. We lean into that: many small workers, resilient
  in aggregate, quietly doing the work.

### Bet 2 — A marketplace of automations

The hardest part today isn't running an agent — it's knowing *how* to set one up
well. That knowledge shouldn't have to be re-derived by every user from a blank
form. It should be **shared, packaged, and reused**.

What this pulls us toward:

- **Automations as portable objects** — an agent preset, its prompt, and its
  schedule bundle into something you can share, fork, and install, not something
  trapped in one person's local config.
- **A library of proven setups** — a place to browse automations that already
  work for real tasks, pull one in, point it at your own data, and run — the
  fastest possible path from "I have a repetitive task" to "it's handled."
- **Community as the moat** — the more people share what works, the more the
  next person gets for free. The value compounds with the crowd, not with us.
- **The on-ramp for non-developers** — a marketplace is how the power leaves the
  terminal. Most people will never author an agent from scratch; they'll pick one
  that already works. This bet is what makes Bet 1 usable by everyone.

The two bets reinforce each other: the colony is the *engine*, the marketplace
is the *fuel* — proven setups are what fill the colony with work that actually
runs.

---

## Principles — how we get there

These constrain the *how*. They're commitments, not preferences.

1. **Local-first, always.** The desktop app runs fully on your machine against a
   bundled local sidecar. Cloud is opt-in, never required, never the default.
   Your data and your agents stay yours.

2. **Open-source by default.** The app, the shared contracts, and the plugins
   are public. Trust in software that runs unattended on your machine is earned
   by being inspectable.

3. **Delegation, not conversation.** Myra is not a place you chat with an agent
   turn by turn. It's a place you *hand work off* and walk away. Every feature
   should reduce babysitting, not add a new thing to watch.

4. **The setup should outlive the attention.** Success is measured in tasks that
   still run cleanly a month later, untouched. We optimize for the run nobody
   thinks about, not the demo that dazzles once.

5. **Widen the door, don't lower the ceiling.** Getting non-developers in must
   never mean taking power away from developers. Presets, args templates, and
   custom binaries stay; the marketplace sits *on top* of them.

---

## Non-goals — what Myra will *not* become

Naming these keeps the vision honest. In this window, Myra is deliberately **not**:

- **A cloud-only SaaS.** We will never require you to run your agents on our
  servers to use the product. The managed cloud is an option, not a gate.
- **An IDE or a coding tool.** Myra *runs* coding agents; it is not a place you
  write code. Widening past developers means the product can't assume a repo, a
  terminal, or a build.
- **A general agent framework.** We're not shipping a library for you to build
  arbitrary agents from primitives. Myra is an opinionated *runner and
  scheduler*, not a toolkit.
- **A closed garden.** Presets, plugins, and automations are portable and
  shareable. We don't trap your setup to raise a switching cost.
- **An eval dashboard.** Watching agents work in fine detail is a
  developer indulgence. The goal is to make watching *unnecessary*, not prettier.

---

*This vision serves the mission and will be revised as we learn. The mission
doesn't move; this ridge will.*

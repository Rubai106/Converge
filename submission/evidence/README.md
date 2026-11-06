# CONVERGE — Evidence package

Text evidence only — this folder holds the records a judge can read in the
repo. Screenshots and the demo video are PNG/MP4 binaries and are **not**
on GitHub (the available GitHub integration is text-only); they are
delivered separately and listed in `submission/screenshots/README.md`.

## What is here

| Folder | What it proves | Stack |
|---|---|---|
| `switch-live/` | First-stack live integration: `/health`, `/health/ready`, 53 live ops, rooms and messages with event/post ids. **Historical record only** — the first stack's room timelines were lost to a VM replacement. | First stack (lost) |
| `switch-recovery-20261106/` | **Current stack, verified live 2026-11-06 ~18:36 Dhaka.** `RECOVERY-REPORT.md` — durable-Postgres recovery after two VM replacements (fourth ~16:29, fifth ~18:28), bridge/agent/room identities preserved by direct query, two independent copy-based backups, two-way delivery, live drawer, read-only smoke tests. `two-way-delivery.json` — the delivery log (human post → agent read; agent event → Mattermost post). | Third rebuild + two recoveries (current) |
| `gap2-submit/` | `README.md` — the UI-only wizard-to-approval journey (GAP-2): create → select strategy → **Submit for approval** → modal → human approve → COMPLETED, with the numbers asserted. `STALENESS.md` — the documented limitation: external mutations (another tab / direct API call) do not update an open tab until reload; no instant cross-session sync is claimed. | Current build |

## Current live state (verified 2026-11-06 ~18:36 Dhaka)

- switch-core 0.31.0, Console 0.40.1, Mattermost 11.9.0, Postgres 16 (durable data dir), nginx.
- `/health` ok; `/health/ready` 7/7.
- Bridge `c004c85d-…`, agent `4b6d039c-…` (converge-facilitator); rooms `#haggle-dairyco` `177e6354-…`, `#recipe-ragu` `478f26a8-…`, `#episode-osei` `04da8311-…`.
- Production app reports **REAL-SWITCH**; HAG-014 COMPLETED, approval P2 ($0.19/fl oz for 6 weeks), 5 messages, 7 audit events; live drawer `live: true`, 10 messages.
- Production data hash `f3a08d2e…` (the only change from `fdce2d30…` is the authorised delivery test).

## Screenshots and video (local, not on GitHub)

- `submission/screenshots/` — 7 live screenshots (REAL-SWITCH, LIVE room banner) + 4 premium shots.
- `submission/demo/converge-demo.mp4` — 147.8s walkthrough, section titles burned in; two stale frames disclosed in `submission/demo-script.md`.
- `~/workspace/converge-qa-findings/gap2/screenshots/` — the GAP-2 journey recording (`gap2-journey.webm`) + 9 step screenshots + 4 flow screenshots.
- `~/workspace/converge-qa-findings/switch-recovery-20261106/` — the recovery evidence source (same files as `switch-recovery-20261106/` here).

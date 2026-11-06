# CONVERGE — complete evidence package

Built 2026-11-06 (night hardening pass). **66 images + this README.**
The original archive `converge-qa-screenshots.zip` (48 files, 6.3 MB) is
unchanged and kept alongside this package; its sha256 is recorded below.

## What is in this package

| Folder | Files | What |
|---|---|---|
| `screenshots/` | 48 | Main QA set (numbered 01–42 + 37b + mobile-01–05). Every important screen and interaction, desktop 1440×900 unless a clip, mobile 390×844. |
| `responsive/` | 14 | Dashboard + HAGGLE at 7 viewports: 1920×1080, 1366×768, 1280×800, 1024×768, 768×1024, 430×932, 375×812. |
| `hardening-2026-11-06/` | 4 | Night-hardening verification shots (see below). |

## Where each image came from (production vs QA)

**Production app** (`http://localhost:3100`, REAL-SWITCH, live switch-core
0.31.0 + Mattermost 11.9.0): 43 of the 48 main shots, all 5 mobile shots,
all 14 responsive captures, and `nit-live-label.png` (rebuilt stack).
Production demo data was never mutated during the QA pass (HAG-014 stayed
COMPLETED with its approval + audit events intact).

**Isolated QA instance** (`http://localhost:3200`, SIMULATED-STUB, its own
disposable data file): 5 main shots — `16-approval-modal.png`,
`17-approval-success.png`, `25-court-blind-hidden.png`,
`28-court-canonical.png`, `37b-correction-audit-qa.png` — plus the
hardening shots `blindness-qa-court.png` (CRT-QA, 4 of 9 ratings),
`blindness-empty-state.png` (scratch zero-rating case), and
`nit-mobile-search.png`. These show states that must not mutate
production data (an approval flow re-run, an incomplete blind test).
Every QA-instance shot is labelled SIMULATED-STUB in the app itself.

**Mattermost web UI** (real rooms on the first stack):
`15-mattermost-conversation.png`, `39-mattermost-agent.png`,
`40-agent-message.png`, `41-human-response.png`,
`42-haggle-discussion.png`. Note: the runtime replaced the VM on
2026-11-06 (~01:32 Dhaka) and the first stack's Switch-side room
timelines were lost with it; these shots remain the record of those
rooms. The stack was rebuilt the same night (new agent, bridge and
room ids — see `docs/switch-live-integration.md`); CONVERGE's own
approval + audit record survived intact.

## Hardening shots (2026-11-06 night pass)

| File | Shows |
|---|---|
| `blindness-qa-court.png` | QA CRT-QA (4/9): tally hidden, codes-only S1/S2/S3, heat table with submitted scores — after the server-side blindness fix. |
| `blindness-empty-state.png` | Scratch CRT-ZERO (0 ratings): "No ratings submitted yet", tally hidden 0 of 9, no mapping leak, no console errors. |
| `nit-mobile-search.png` | 390px dashboard after the mobile-search fix: search input spans the full row (was fixed 140px, truncated). |
| `nit-live-label.png` | Production HAG-014 room drawer after the LIVE-label fix: dark-green label #0A5C50 (6.98:1), plus the HAG-014 record note in the fresh room. |

## Inventory

Per-shot descriptions live in `submission/qa/QA-REPORT.md` §13 (main set)
and the QA-REPORT addendum (hardening shots). Filenames + dimensions below
were measured from the files in this package at build time.

### screenshots/

- `screenshots/01-overview-dashboard.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/02-active-cases.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/03-workflows.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/04-evidence.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/05-decisions.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/06-activity.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/07-settings.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/08-haggle-overview.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/09-haggle-analysis.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/10-haggle-cost-viz.png` — 300×568 — Production app (:3100, REAL-SWITCH)
- `screenshots/11-haggle-strategies.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/12-haggle-proposal.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/13-haggle-mandate.png` — 407×61 — Production app (:3100, REAL-SWITCH)
- `screenshots/14-haggle-room.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/15-mattermost-conversation.png` — 1440×900 — Mattermost web UI — real rooms, first stack
- `screenshots/16-approval-modal.png` — 1440×900 — QA instance (:3200, SIMULATED-STUB)
- `screenshots/17-approval-success.png` — 1440×900 — QA instance (:3200, SIMULATED-STUB)
- `screenshots/18-haggle-completed.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/19-haggle-audit.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/20-court-overview.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/21-court-versions.png` — 300×378 — Production app (:3100, REAL-SWITCH)
- `screenshots/22-court-matrix.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/23-court-blind-instructions.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/24-court-rating.png` — 564×739 — Production app (:3100, REAL-SWITCH)
- `screenshots/25-court-blind-hidden.png` — 1440×900 — QA instance (:3200, SIMULATED-STUB)
- `screenshots/26-court-tally.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/27-court-disagreement.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/28-court-canonical.png` — 564×85 — QA instance (:3200, SIMULATED-STUB)
- `screenshots/29-correction-overview.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/30-correction-transcript.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/31-correction-claims.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/32-correction-challenge.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/33-correction-evidence.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/34-correction-status.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/35-correction-approval.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/36-correction-errata.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/37-correction-audit.png` — 1440×900 — Production app (:3100, REAL-SWITCH)
- `screenshots/37b-correction-audit-qa.png` — 1440×900 — QA instance (:3200, SIMULATED-STUB)
- `screenshots/38-switch-status.png` — 1299×820 — Production app (:3100, REAL-SWITCH)
- `screenshots/39-mattermost-agent.png` — 1440×900 — Mattermost web UI — real rooms, first stack
- `screenshots/40-agent-message.png` — 1440×900 — Mattermost web UI — real rooms, first stack
- `screenshots/41-human-response.png` — 1440×900 — Mattermost web UI — real rooms, first stack
- `screenshots/42-haggle-discussion.png` — 1440×900 — Mattermost web UI — real rooms, first stack
- `screenshots/mobile-01-dashboard.png` — 390×844 — Production app (:3100, REAL-SWITCH)
- `screenshots/mobile-02-haggle.png` — 390×844 — Production app (:3100, REAL-SWITCH)
- `screenshots/mobile-03-room.png` — 390×844 — Production app (:3100, REAL-SWITCH)
- `screenshots/mobile-04-court.png` — 390×844 — Production app (:3100, REAL-SWITCH)
- `screenshots/mobile-05-correction.png` — 390×844 — Production app (:3100, REAL-SWITCH)

### responsive/

- `responsive/dashboard-1024x768.png` — 1024×768
- `responsive/dashboard-1280x800.png` — 1280×800
- `responsive/dashboard-1366x768.png` — 1366×768
- `responsive/dashboard-1920x1080.png` — 1920×1080
- `responsive/dashboard-375x812.png` — 375×812
- `responsive/dashboard-430x932.png` — 430×932
- `responsive/dashboard-768x1024.png` — 768×1024
- `responsive/haggle-1024x768.png` — 1024×768
- `responsive/haggle-1280x800.png` — 1280×800
- `responsive/haggle-1366x768.png` — 1366×768
- `responsive/haggle-1920x1080.png` — 1920×1080
- `responsive/haggle-375x812.png` — 375×812
- `responsive/haggle-430x932.png` — 430×932
- `responsive/haggle-768x1024.png` — 768×1024

### hardening-2026-11-06/

- `hardening-2026-11-06/blindness-empty-state.png` — 1440×900
- `hardening-2026-11-06/blindness-qa-court.png` — 1440×900
- `hardening-2026-11-06/nit-live-label.png` — 1440×900
- `hardening-2026-11-06/nit-mobile-search.png` — 390×844

## Verification

- Original archive sha256 (unchanged): `9d88b9d512bf2662492953b8d4a40a314659a43a77bc937966de1d2bc01ede81`
- All 66 PNGs were opened and their dimensions read at build time; none
  failed to parse. No two files in this package share an md5 (no
  duplicated content). The two smallest files (`13-haggle-mandate.png`
  407×61, `28-court-canonical.png` 564×85) are deliberate clips, not
  errors — see QA-REPORT.md §13.
- The demo video is NOT in this package: it lives at
  `submission/demo/converge-demo.mp4` (147.8s, 1440×900).
- Nothing in this package is on GitHub: the available GitHub integration
  is text-only and rejects binary uploads. Do not claim these files exist
  in the repository.

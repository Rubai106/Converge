# Screenshots — what is what, and where it lives

## Submission assets (current premium UI, Direction B)
These four are the screenshots for the final submission. They show the
premium operations-workspace UI as it runs today (verified by reading each
image; no overflow, no invented numbers).

| File | Shows |
| --- | --- |
| `premium-dashboard.png` | Overview: 4 KPIs, cases table, needs-a-decision, agent activity |
| `premium-haggle.png` | HAG-014: bullet graph 28.63% → 31.62% vs 30% target, proposals, mandate, approval |
| `premium-court.png` | CRT-007: conflict matrix, blind-score heat table, tally (Nonna 4.67/5) |
| `premium-correction.png` | COR-003: claims table with statuses and evidence links |

## Live set (REAL-SWITCH, 2026-11-06)
Captured from the live app in REAL-SWITCH mode (Playwright, 1440×900,
`scripts/capture-demo.py`). These supersede the premium set for the
submission because they show the real Switch state — the REAL-SWITCH pill,
the live room drawer, and the approval audit trail.

| File | Shows |
| --- | --- |
| `live-dashboard.png` | Overview in REAL-SWITCH mode: HAG-014 COMPLETED, audit events in Recent agent activity |
| `live-haggle.png` | HAG-014 overview, COMPLETED |
| `live-haggle-analysis.png` | Deterministic analysis: +$0.48/serving, 28.63% → 31.62%, max sustainable $0.20 |
| `live-room-haggle.png` | Real #haggle-dairyco room drawer (LIVE label) with the app's closure message |
| `live-haggle-audit.png` | Audit tab: AWAITING_APPROVAL → APPROVED → COMPLETED |
| `live-court.png` | CRT-007 case view |
| `live-correction.png` | COR-003 case view |

## Archived (superseded)
`archive/temp-ui-2026-11-05/` — `dashboard.png`, `haggle-case.png`,
`court-case.png`. Captured 2026-11-05 22:15 from the temporary dev UI
(raw JSON dump for the HAGGLE analysis). Superseded by the premium shots
above; kept only as build history. Do not submit these.

## GitHub status — READ THIS
**None of these PNGs are in the accordweave repository yet.** The GitHub
integration available here (MCP `push_files` / `create_or_update_file`) is
text-only: it validates UTF-8 and rejects binary content, and the tool
catalogue has no `create_blob` / `create_tree` / `create_commit` /
`update_ref` Git Data API tools. A direct `git push` over HTTPS cannot
authenticate from this VM (no credential helper). So binary upload remains
blocked until a binary-capable route opens (credentialed `git push`, or the
GitHub web upload). Do not claim the screenshots are on GitHub. When that
route opens, upload exactly the four premium files above.

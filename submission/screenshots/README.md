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

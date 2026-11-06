# GAP-2 evidence — UI-only wizard-to-approval journey

Captured 2026-11-06 by `tests/gap2-journey.test.js` (Playwright, Chromium
1440×900) against a scratch server on a temp copy of the demo data — never
the production data file. The journey test drives the UI only (no API
calls to drive the workflow); the API is used only to set up the scratch
server and to read back the recorded state at the end.

## Screen recording

- `gap2-journey.webm` — the full journey, recorded by Playwright
  (`recordVideo`), from the dashboard through wizard creation, strategy
  selection, Submit for approval, the approval modal, human approval,
  and completion.

## Step-by-step screenshots

| File | Step | What it shows |
|---|---|---|
| `gap2-01-wizard-step1.png` | Wizard opened from the dashboard | Step 1 (Supplier & ingredient) |
| `gap2-02-wizard-review.png` | Step 5 | Review & create — deterministic preview loaded, Create enabled |
| `gap2-03-created-discussion.png` | Case created | HAG-015 "GreenFields butter price rise", DISCUSSION |
| `gap2-04-selected-submit.png` | Strategy selected | Negotiation tab, counter-019 row selected (highlighted), impact panel $1.14/serving, 29.75% food cost, exact terms "$0.19/fl oz for 6 weeks, in writing", button "Submit for approval" |
| `gap2-05-submitted-awaiting.png` | Submitted | Approvals rail "Pending: $0.19/fl oz for 6 weeks, in writing"; Approve button "Approve $0.19 / fl oz · 6 weeks" |
| `gap2-06-approval-modal.png` | Approval modal | Terms restated, impact "+$0.18 / serving · +$28.80 / month · food cost 29.75% (target 30%) · within mandate max $0.20", recommendation "Balanced: stays under the 30% food-cost target." |
| `gap2-07-approved-audit.png` | Human approve | Audit tab shows "I approve $0.19/fl oz for 6 weeks, in writing." |
| `gap2-08-approved-impact.png` | Post-approval impact | Hero "+$0.18 / serving · $28.80 / month", note "Approved terms: $0.19/fl oz for 6 weeks, in writing — impact of the approved price, not the supplier's $0.24 proposal", food cost 29.75%, Approvals rail "APPROVED ✓" |
| `gap2-09-completed-audit.png` | Completed | State COMPLETED; audit records DISCUSSION→PROPOSAL→AWAITING_APPROVAL→APPROVED→COMPLETED |
| `gap2-stale-before-reload.png` | Staleness reproduction | Open tab still shows DISCUSSION 3s after an external API move to PROPOSAL |
| `gap2-stale-after-reload.png` | Staleness reproduction | Same tab after reload shows PROPOSAL |

## Numbers asserted across the journey (GreenFields payload)

Wizard inputs: old $0.16, new $0.24, 6 fl oz/serving, other $3.62,
menu $16.00, monthly 160, target 30%, targetPrice $0.16, maxApproved $0.20.
Counter-019: cream $1.14/serving, food cost 29.75%, extra +$28.80/month,
saving vs the $0.24 proposal $48.00/month. Modal impact:
"+$0.18 / serving · +$28.80 / month · food cost 29.75% (target 30%) ·
within mandate max $0.20". Recorded approval: proposalId P2, terms
"$0.19/fl oz for 6 weeks, in writing", approvedBy "Mara (owner)".

## Related

- `../STALENESS.md` — the staleness investigation (UI-mutation path
  fixed; external-mutation staleness reproduced and deferred with a
  proposed narrow fix).
- `~/workspace/converge/tests/gap2-submit.test.js` — 15 server/static
  tests (duplicate, invalid strategy, bare-move, agent-cannot-approve,
  reject/re-propose, P3 volume-021).
- `~/workspace/converge/tests/gap2-journey.test.js` — the two Playwright
  tests that produced these files.

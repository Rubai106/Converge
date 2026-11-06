# CONVERGE — Full Product QA Report

**Date:** 2026-11-06 (~00:30–01:10 Dhaka)
**Repo:** https://github.com/Rubai106/accordweave (`main`)
**App under test:** http://localhost:3100 — production data, REAL-SWITCH (switch-core 0.31.0 + Mattermost 11.9.0, native-process deployment)
**QA instance:** http://localhost:3200 — SIMULATED-STUB, disposable data (`~/workspace/converge-qa/`, re-seeded from `scripts/qa-seed.mjs`)
**Mattermost:** http://localhost:8065 — real `#haggle-dairyco`, `#recipe-ragu`, `#episode-osei` channels
**Auditors:** Muse (functional/browser/API/Switch) + two specialist passes (API + engine edge cases; accessibility with axe-core 4.14.0)
**Evidence:** `~/workspace/converge-qa-findings/` — `a11y.md` (baseline), `a11y-rerun.md` (post-fix), `api-tests.md`, `recapture.md`

## 1. Executive summary

**Verdict: PASS with minor limitations — ready for the final hackathon demonstration.**

CONVERGE was tested end-to-end against the live Switch deployment: every page, every workflow, every approval gate, the financial engine's edge cases, the real Mattermost rooms, responsive layouts at 9 viewports, and accessibility with axe-core. The audit found **1 HIGH functional bug, 1 HIGH accessibility bug (found in the re-run), 1 HIGH integration bug, 5 HIGH/MEDIUM accessibility issues and 8 MEDIUM/LOW bugs** — **all of them were fixed, regression-tested and re-verified live in this pass**. No Critical (P0) issue remains open. The shipped suite is **26/26 pass, 0 fail, 0 skipped**; axe-core reports **0 violations on all 13 pages** after the fixes; the real HAGGLE room still holds the complete 10-thread approval arc; production demo data was never mutated (HAG-014 COMPLETED, approval + 3 audit events intact).

The remaining items are honest limitations, not defects: the COURT API payload still carries the sample→version mapping (true blindness would need server-side withholding); the room drawer shows only app-stored messages (full history lives in Mattermost); a few pages are sparse; no real usability sessions were run. None of these blocks the demo.

## 2. Total screens tested

**48 screenshot files** covering 43 distinct screens/states + 5 mobile screens, plus **14 responsive captures**.

| Group | Screens | Files |
|---|---|---|
| A — Main application | Overview, Active Cases, Workflows, Evidence, Decisions, Activity, Settings | 01–07 |
| B — HAGGLE | Overview, analysis, cost viz, strategies, proposal, mandate, room, approval modal, approval success, completed, audit | 08–19 |
| C — COURT | Overview, versions, matrix, blind instructions, rating/heat, hidden tally, tally, disagreement, canonical/dissent | 20–28 |
| D — CORRECTION | Overview, transcript, claims, challenge, evidence, status, approval, errata, audit (+ QA audit) | 29–37, 37b |
| E — Switch integration | Switch status, Mattermost conversation, agent message, human response, discussion + members | 38–42 (15 also) |
| F — Mobile (390×844) | Dashboard, HAGGLE, room, COURT, CORRECTION | mobile-01–05 |
| Responsive | Dashboard + HAGGLE at 1920×1080, 1366×768, 1280×800, 1024×768, 768×1024, 430×932, 375×812 | 14 files in `submission/qa/responsive/` |

Every file was opened and visually inspected. 20 files were re-captured after the fixes (see §10/§13); the rest were captured pre-fix and re-checked against the fixed code where the fix touched them.

## 3. Functional tests performed

Browser (Playwright, Chromium headless, 1440×900 + 390×844) + direct API calls. Destructive tests ran **only** on the QA instance; production was read-only browsing.

- **Dashboard:** loading, KPI derivation from backend data (2 active, 0 awaiting, $76.80, 1 decision), needs-a-decision, case navigation, search, empty search, refresh.
- **Active Cases:** listing, search by ID/title/workflow/counterparty, status display, case opening, empty results, back navigation.
- **HAGGLE (flagship):** full DairyCo scenario — $0.16 → $0.24/fl oz (+50%), 6 fl oz/serving, $0.96 → $1.44/serving (+$0.48), food cost 28.63% → 31.62%, margin 71.37% → 68.38%, +$76.80/mo, $921.60/yr, max sustainable $0.1967 ≈ $0.20 at 30% target, 6 strategies, counter $0.19 → 29.75% / saves $48.00/mo. Edge cases: zero qty, zero menu price, negative prices, missing inputs, 1e9 prices, decimal precision, monthlySales 0, non-numeric strings, Infinity, NaN (see §5).
- **Negotiation room:** REAL-SWITCH status, LIVE indicator, Mattermost messages, agent analysis, human messages, proposals, counteroffers, message submission + persistence.
- **Approval:** modal terms, approve/cancel, duplicate approval, agent approval (API + engine), invalid transitions, persistence, audit log, final outcome. Production HAG-014 was **not** re-approved; all approval-flow tests used QA HAG-014.
- **COURT:** CRT-007 ragù — 3 versions, conflict matrix (salt/fat/simmer conflict, tomato agrees), blind instructions, coded samples, rating form (new), duplicate protection (409), hidden tally at 4/9, revealed tally at 9/9 (S1 4.67, S2 4.33, S3 3.33), disagreement flags, canonical recipe, dissent preserved.
- **CORRECTION:** COR-003 — transcript panel (new), 3 factual claims + 1 opinion separated, guest challenge + evidence, host-only approval, rejected corrections, unresolved claims, errata draft, original statement preserved, audit history, persistence across refresh/reopen.
- **Nav sections:** Workflows, Evidence (filters), Decisions, Activity, Settings — data, navigation, filters, search, empty states, buttons, links, tables, responsive behaviour, error handling.
- **Switch integration:** §6. **Accessibility:** §8. **Responsive:** §9. **Security:** §7.

## 4. Test results

### Shipped suite — PASS
`npm test`: **26 pass, 0 fail, 0 skipped** (8 engine + 4 server persistence + 8 Switch-client + 1 new pendingApproval regression + 5 ported engine-edge regression tests). `npm run check`: clean. Exact output in §14.

### Functional — PASS (after fixes)
All primary pages, all three workflows, human-only approvals, financial calculations, persistence and the real Switch integration verified. No functional test failed at the end of the pass; every failure found during the pass was fixed and re-verified (see §11).

### Per-area status

| Area | Status | Evidence |
|---|---|---|
| Dashboard / KPIs | PASS | Live backend-derived figures; no hardcoded numbers |
| Active Cases / search | PASS | All searches return correct filtered rows; empty state shown |
| HAGGLE maths | PASS | Hand-checked values exact; edge battery finite (see §5) |
| HAGGLE room (live) | PASS | Real Mattermost messages visible; LIVE banner correct |
| Approval gate | PASS | Agent approve → 400 (engine + API, live); duplicate → 400 |
| COURT tally/blindness | PASS | Server gates tally (null at 4/9); UI now gates too |
| COURT rating form | PASS | New UI form; duplicate → 409; invalid → 400 |
| CORRECTION claims | PASS | Agent change → 400; human change → 200; persistence verified |
| Transcript / opinion split | PASS | All 4 sentences classified correctly in the UI |
| Workflows / Evidence / Decisions / Activity / Settings | PASS | All render real data; rows keyboard-operable |
| Responsive (9 viewports) | PASS | No horizontal overflow at any size |
| Accessibility (axe) | PASS | 0 violations on 13 pages after fixes |
| Switch integration | PASS | §6 |
| Security | PARTIAL | §7 (loopback + gates verified; no live XSS probe this pass) |

## 5. API tests

**Dedicated API pass (QA instance only): 59 calls — 47 asserted PASS, 0 FAIL, 12 INFO (read-only probes).** Full table with exact statuses/bodies: `~/workspace/converge-qa-findings/api-tests.md`.

Highlights:

| Test | Result |
|---|---|
| Agent approve HAG-014 (AWAITING_APPROVAL) | 400 `Only a human may approve a case. Agents propose; humans approve.` |
| Human approve / duplicate approve / invalid transitions | 200 / 400 / 400, as specified |
| Approve without pending approval | 400 `No pending approval to approve…` |
| COURT duplicate rating | 409 `Reader A already rated S1` |
| COURT invalid score (9), missing dimension, non-integer, unknown reader/sample | 400 each |
| COURT tally at 4/9 → `tally: null`; at 9/9 → S1 4.67 / S2 4.33 / S3 3.33 | PASS, means match seed exactly |
| CORRECTION agent verify | 400; human verify → 200; invalid status → 400; unknown claim → 404 |
| CORRECTION guest challenge + evidence | 200, persisted; re-challenge now keeps history |
| Room post: empty / 100k chars | 400 after fix (was 200 before — BUG-5) |
| Room post to unseeded QA room | 200 after fix (was 500 — BUG-4) |
| `GET /api/cases/NOPE-999`, `GET /api/bogus` | 404 |
| Persistence across server restart | PASS — all mutations survived (HAG-014 COMPLETED, CRT-QA 9/9, COR-QA APPROVED) |
| `GET /api/cases?q=…` | 200 but **ignores the query** — search is client-side only (design, §12) |

### Engine edge-case battery — PASS (after fixes)
19 probes (scratch suite, QA copy). Zero qty, zero menu price, negatives, missing core inputs, NaN, 1e9 prices, 0.1→0.2 precision, monthlySales 0, oldPrice 0 → `pctChange: null` — all behave. The battery originally exposed 4 genuine bugs (BUG-1a/1b/1c, BUG-2); all fixed and pinned by 5 regression tests now in `tests/engine-edge.test.js` (all 5 pass).

## 6. SWITCH integration tests

Verified against the **live** switch-core 0.31.0 + Mattermost 11.9.0 (native-process deployment, `~/workspace/switch-server/`).

| Check | Result | Evidence |
|---|---|---|
| `GET /health` | PASS | `{"status":"ok"}` |
| `GET /health/ready` | PASS | All 7 checks healthy (database, message_listener, session_activity_listener, agent_event_listener, signal_bus, bridges, connectors) |
| App reports REAL-SWITCH | PASS | `/api/status` → `switchMode: REAL-SWITCH`, `switchHealth.ok: true` |
| Registered agent | PASS | `converge-facilitator`, id `de9ceb8a-…-346a12`, connector_type `converge` |
| Per-agent op registry | PASS | `GET /agents/{id}/ops` → **53 ops** |
| WebSocket `/agents/{id}/connection/ws` | PASS | Live endpoint confirmed (server handler docstring + client use) |
| SSE compat + heartbeat | PASS | Beaten stream stays alive 20s+; unbeaten evicted ~6s with `heartbeat_lapsed` (verified 2026-11-06; unit test `openEventStream beats…` passes; not re-run live in this pass) |
| Room connection (per-agent ops, `X-Switch-Connection-Id`) | PASS | `connect_to_room` then op on same connection id; unopened connection → 409 |
| `read_context` retrieval | PASS | Real HAGGLE room: **10 threads** incl. analysis post, owner approval, approval-recorded confirmation, closure note, INGEST2 marker |
| `post_message` | PASS | Via app (closure note, event `sw_62b21bea…`); via API on QA (200) |
| Message persistence | PASS | 8 posts in Mattermost `#haggle-dairyco` after restarts; app stores 1 message + audit |
| Mattermost bridge | PASS | Bridge `bcdd5c54-…` **listening** since 00:16:11; no crash since; ingestion re-verified with marker `INGEST2-1793902585` (00:18) |
| Human message ingestion | PASS | Owner approval present in Switch's own timeline via `read_context` |
| Human-only approval enforcement | PASS | Agent approve on genuine AWAITING_APPROVAL case → 400 (re-verified live in this pass, QA HAG-014) |
| Room reconnect / server restart | NOT TESTED in this pass | Verified 2026-11-06 (bridge crash on bad restart order found + fixed; restart order documented). Deliberately not re-run: restarting switch-core risks the live bridge; no restarts since the fix |
| REAL vs SIMULATED labelling | PASS | Live → REAL-SWITCH; stub QA → SIMULATED-STUB; dead server → **SWITCH-UNREACHABLE** (new, BUG-3 fix, verified against `http://localhost:9`) |
| Gateway sign-in page | NOTED | `:3000` serves the Switch Console sign-in, not a status dashboard — screenshot 38 now shows the app's own status chrome instead |

**Honest record:** messages posted to Mattermost while the bridge was down (00:09–00:16, before this pass) were never backfilled into Switch's timeline. They remain in Mattermost only. Nothing in this pass re-stages or hides that.

## 7. Security checks

| Check | Status | Evidence |
|---|---|---|
| Services bound to loopback only | PASS | `ss -tlnp`: switch-core 8000, Mattermost 8065, gateway 3000, app 3100, Postgres 5432 — all `127.0.0.1`. VM has no public interface (only `lo` + CGNAT `host0`) |
| No secrets in the repo | PASS | Value-pattern scan of all tracked + to-be-synced files before commit: no API keys, tokens, passwords or private data. `.env` lives in `~/workspace/switch-server/`, never in the repo; capture scripts read credentials from it at runtime, by name only |
| Human-only approval gate | PASS | Engine + API; agent approve → 400 (live, §5/§6). Agents cannot execute supplier commitments, prices, recipe selection or editorial decisions |
| Input validation | PASS | Engine rejects non-finite/non-numeric HAGGLE inputs; room messages require non-empty text, max 4000 chars (Mattermost default) |
| Output escaping | PARTIAL | All rendered values go through `esc()` (code inspection). No live XSS probe was run on CONVERGE in this pass |
| No fabricated participants | PASS | No fake user responses; probe messages in Mattermost are labelled test artefacts (STREAM-PROBE/PLAIN-/INGEST2-) |

## 8. Accessibility checks

**Method:** axe-core 4.14.0 injected into headless Chromium via Playwright, 1440×900, 13 pages, plus manual keyboard/semantics/contrast probes. Baseline `a11y.md`, post-fix `a11y-rerun.md`, final run after the last two fixes: `/tmp/a11y/axe-results-rerun.json` (re-run at ~01:10 Dhaka).

**Final result: 0 axe violations on all 13 pages.** The only "incomplete" results are the known benign ones: the decorative `◆` wordmark diamond (`aria-hidden`), and drawer elements manually verified passing (`#drawer-sub` 5.46:1, LIVE label 4.52:1, drawer-close glyph hidden from AT by design).

| Item | Before | After |
|---|---|---|
| H3 `--faint` contrast | 3.48:1 FAIL (4–14 nodes/page) | **5.46:1 PASS** (`#5A6B7F`) |
| H4 approval stamp word | 2.57:1 FAIL | **6.27:1 PASS** (`#6B5A2E`) |
| H5 drawer/modal focus trap + return | No trap; focus → `<body>` | **PASS** — Tab trapped, Escape returns focus to trigger |
| H6 Workflows/Evidence rows | Mouse-only (0/3, 0/5 focusable) | **PASS** — all rows `tabindex="0"`, Enter opens |
| M5 pill amber | 4.44:1 (`.pill-amber` + `.switch-pill`) | **6.26:1 PASS** (both rules) |
| M6 tabs ARIA | Partial pattern, no arrow keys | **PASS** — `aria-controls`/`tabpanel`/`aria-labelledby` + Arrow/Home/End |
| M7 drawer close Label-in-Name | Axe serious violation | **PASS** — glyph `aria-hidden`, violation gone |
| M8 skip link | None | **PASS** — first Tab stop, Enter → `#view` |
| N1 approve-button keyboard access (found in re-run) | Enter/Space swallowed; modal unreachable by keyboard | **PASS** — Enter/Space/click all open the modal; Escape returns focus to `#approve-btn`; strategy rows still select + keep focus |
| New rating form / transcript panel | — | **PASS** — all controls labelled; all 4 sentences classified correctly |
| Stepper | 5 steps, DISCUSSION shown as Proposal | **PASS** — 6 steps, correct current step |

Also verified passing: 12 dashboard Tab stops all with visible 2px teal focus outline; bullet chart `role="img"` + text alternative; all pills carry text (never colour-only); `#room-log` `aria-live="polite"`; error containers `role="alert"`; `lang`/`title` present; reduced-motion respected.

## 9. Responsive testing results

**No horizontal overflow at any tested viewport** (checked in-page on every capture; 0 console errors on production pages).

| Viewport | Dashboard | HAGGLE | Verdict |
|---|---|---|---|
| 1920×1080 | PASS | PASS | Full layout, no overflow |
| 1440×900 | PASS | PASS | Reference size for all 48 screenshots |
| 1366×768 | PASS | PASS | No overflow |
| 1280×800 | PASS | PASS | No overflow |
| 1024×768 | PASS | PASS | Sidebar narrows; tables hold |
| 768×1024 | PASS | PASS | Tablet; no overflow |
| 430×932 | PASS | PASS | Mobile layout, bottom nav |
| 390×844 | PASS | PASS | 5 mobile screenshots; KPIs stack 2×2 |
| 375×812 | PASS | PASS | No overflow |

Known LOW nits (unchanged): mobile search input truncates ("Search cases, evic…") because the pill + owner chip share the row; case tables scroll horizontally on mobile (acceptable); room drawer has empty space below a single message.

## 10. Visual issues found

**Found and fixed in this pass (all re-captured — see §13):**

1. **Duplicates from scroll no-ops:** 10 = 08, 13 = 08, 21 = 20, 24 = 23, 28 = 26, 30 = 31, 42 = 41 (byte-identical or same-view). Re-captured as distinct clips/views.
2. **38 was the gateway sign-in page**, not a status dashboard. Re-captured as a clip of the app's own REAL-SWITCH status (header pill + sidebar status).
3. **Decisions view contradicted itself** (H1) — a COMPLETED case listed as "Awaiting approval" while its own Decided section showed the approval.
4. **COURT showed the leader + version mapping before the tally was complete** (H2) — sample buttons labelled with version names at 4/9 ratings.
5. **Duplicate Participants panel** on every case overview (M4).
6. **Strategy row stuck on "Awaiting"** after approval.
7. **Stepper showed "Proposal" for DISCUSSION cases** (M1).
8. **Transcript text invisible** (M2); **no rating form in the UI** (M3).
9. **Contrast failures** everywhere `--faint` was used + the approval stamp (H3/H4) + amber pills (M5).
10. **Selected strategy row accent sits tight against the option text** — readable, cosmetic only (LOW, left as-is).

**Pre-existing LOW nits left as-is (noted, not fixed):** sparse Decisions/Workflows pages below the panels; duplicate page headings (view H1 + panel H2 repeat a word); mobile search truncation; mobile drawer empty space.

## 11. Bugs fixed

All fixes are in the repo, tested, and re-verified live. No expected test output was changed to force a pass; the 5 ported regression tests were written to pin the *desired* behaviour and pass only because the engine was fixed.

| ID | Severity | Bug | Fix | Verified |
|---|---|---|---|---|
| H1 | High | Stale `pendingApproval` after approval — COMPLETED case still "awaiting approval" in Decisions, overview and rail | `transitionCase` clears it on APPROVED/REJECTED; `store.load()` migrates existing decided cases; regression test added | Production HAG-014: COMPLETED, `pendingApproval: null`, approval + 3 audit events intact; Decisions shows "No pending approvals" |
| H2 | High | COURT blind tally not blind — leader + version mapping shown at 4/9 ratings | Client gates mapping/leader/tally on completeness (`ratings == readers × samples`); codes-only buttons + "Tally hidden — N of M" until complete | Screenshot 25: "Hidden — 4 of 9 ratings in", S1/S2/S3 codes only |
| H3 | High | `--faint` #7C8B9C 3.48:1 everywhere | Darkened to #5A6B7F (5.46:1) | Axe: 0 contrast nodes; recomputed 5.46:1 |
| H4 | High | "Approved ✓" stamp 2.57:1 | `.stamp-word` → #6B5A2E (6.27:1) | Axe clean; recomputed 6.27:1 |
| H5 | High | Drawer/modal: no focus trap, focus lost on close | Tab trap + focus return for both; Escape closes modal | Live keyboard test: 10 Tabs trapped; Escape returns focus to trigger |
| H6 | High | Workflows/Evidence rows mouse-only | `tabindex="0"` on all `[data-open]` rows | All 3 + 5 rows Enter-open the case |
| BUG-3 | High | False-live: dead Switch still reported REAL-SWITCH | `/api/status` reports health-derived mode: `SWITCH-UNREACHABLE` until the probe succeeds; UI renders the unreachable state (pill/drawer/footer) | Dead server (`localhost:9`) → `SWITCH-UNREACHABLE`; live → REAL-SWITCH |
| N1 | High | `#approve-btn` bound as a strategy row — keyboard users could not open the approval modal at all | Binding scoped to `tr[data-strategy]`; `data-strategy` removed from the button; row selection keeps focus on the re-rendered row | Live keyboard test: Enter/Space/click open modal; Tab trapped; Escape returns focus to `#approve-btn` |
| M1 | Medium | Stepper collapsed DISCUSSION + PROPOSAL | 6 steps; corrected `STEP_INDEX` | CRT-007 shows Discussion current |
| M2 | Medium | Transcript never displayed; opinion split invisible | "Original transcript — preserved" panel, per-sentence factual/opinion tags (same classification as the engine) | Screenshot 30: C1/C2/C3 + opinion tag |
| M3 | Medium | No rating submission form in the UI | "Submit a blind rating" form (codes-only sample select, 6 inputs, POST `/api/court/rate`, inline result) | Screenshot 24; duplicate → 409 demonstrated |
| M4 | Medium | Duplicate Participants panel | Removed from `overviewTab` (rail keeps it) | Screenshot 08: Participants once |
| M5 | Medium | Amber pills 4.44:1 | `.pill-amber` + `.switch-pill` → #6E5700 (6.26:1) | Axe clean; recomputed 6.26:1 |
| M6 | Medium | Tabs partial ARIA, no arrow keys | `aria-controls`/`tabpanel`/`aria-labelledby` + Arrow/Home/End | Live keyboard test passes |
| M7 | Medium | Drawer close fails Label-in-Name | Glyph wrapped in `<span aria-hidden="true">` | Axe violation gone |
| M8 | Medium | No skip link | `<a class="skip-link" href="#view">` + focus styles | First Tab stop; Enter → `#view` |
| BUG-1a/b/c | Medium | Engine: `Infinity` prices pass validation; missing `otherIngredientsCostPerServing`/`targetFoodCostPct` → NaN output | `normalizeHaggleInputs`: all numeric inputs must be finite numbers (numeric strings coerced); ranges enforced | 5 ported regression tests pass; battery finite |
| BUG-2 | Medium | String prices coerce in analysis but crash `haggleStrategies` (`toFixed`) → case endpoint 500s | Both functions normalise through the same validator | Regression test passes |
| BUG-4 | Low | Stub: posting to a case's own room → 500 `Room not found` | Stub auto-creates the room (mirrors real `ensureRealRoom`) | QA post → 200 |
| BUG-5a/b | Low | Empty and 100k-char room messages accepted + audited | API rejects empty (400) and >4000 chars (400) | Verified live on scratch instance |
| — | Low | Room-message audit recorded kind "human" for agent posts | Kind derived from author (both real and stub paths) | Code + tests pass |
| — | Low | Re-challenge overwrote the previous challenge text | Previous challenges kept in `claimChallengeHistory` | Code + tests pass |
| — | Low | Strategy pill hardcoded "Awaiting" for `counter-019` | Derived from case state (Approved / Awaiting / Proposed) | Screenshot 11: counter reads Approved |

## 12. Remaining limitations

1. **COURT API payload still contains the samples mapping.** The UI now hides it until the tally completes, but a determined reader could inspect the case JSON. True blindness needs server-side withholding — out of scope for this pass; stated here so it is not oversold.
2. **Room drawer shows only app-stored messages.** Full history lives in Mattermost (screenshots 15/39–42 show it). Not a data loss — a display scope.
3. **Agents may REJECT cases and may set a claim to `Unresolved`.** By design (rejecting/resetting is not a commitment); only APPROVED and non-`Unresolved` claim statuses are human-gated.
4. **`POST /api/court/tally` is an open compute endpoint.** It computes a tally from caller-supplied ratings; it leaks no case data, but it does not enforce the completeness gate the case endpoint does.
5. **No server-side search.** `GET /api/cases?q=…` ignores the query; search is client-side only.
6. **SSE heartbeat expiry and server-restart behaviour not re-run live in this pass.** Verified 2026-11-06 (unbeaten stream evicted ~6s; bridge crash on bad restart order found + fixed). Restarting switch-core now would risk the live bridge, so the earlier verification stands.
7. **No real usability sessions, no independent/blinded evaluation.** The demo video shows HAG-014 COMPLETED because the approval already happened in the real room — honest record, not re-staged.
8. **Visual LOW nits (§10):** sparse Decisions/Workflows pages, duplicate headings, mobile search truncation, drawer empty space, selected-row accent tightness, drawer LIVE label 4.52:1 (passes, barely).
9. **Demo data is fictional** (labelled throughout). The supplier, guest and family panel are simulated; only the Switch/Mattermost plumbing and the approval workflow are real.

## 13. Screenshot inventory

All files in `submission/qa/screenshots/` (48 files, 1440×900 desktop / 390×844 mobile unless a clip) + `submission/qa/responsive/` (14 files). ZIP backup: `submission/qa/converge-qa-screenshots.zip` (48 files, 6.3 MB, integrity-checked). **PNGs and the ZIP are NOT on GitHub** (binary upload is blocked from this environment) — they are delivered as conversation attachments.

| # | File | Size | What it shows | Visual verdict |
|---|---|---|---|---|
| 01 | 01-overview-dashboard.png | 1440×900 | Dashboard, live KPIs (2 active, 0 awaiting, $76.80, 1 decision), REAL-SWITCH | PASS |
| 02 | 02-active-cases.png | 1440×900 | Case listing, 3 cases, statuses | PASS |
| 03 | 03-workflows.png | 1440×900 | Three workflow templates + demo cases (sparse below — LOW) | PASS |
| 04 | 04-evidence.png | 1440×900 | Evidence table + status filters | PASS |
| 05 | 05-decisions.png | 1440×900 | "No pending approvals"; Decided shows HAG-014 approval sentence | PASS |
| 06 | 06-activity.png | 1440×900 | Recent agent activity feed | PASS |
| 07 | 07-settings.png | 1440×900 | REAL-SWITCH, "Switch health 200", environment | PASS |
| 08 | 08-haggle-overview.png | 1440×900 | HAGGLE overview, 6-stage stepper (Approved), approval sentence, single Participants panel | PASS |
| 09 | 09-haggle-analysis.png | 1440×900 | Deterministic analysis table, figures correct | PASS |
| 10 | 10-haggle-cost-viz.png | 300×568 clip | Financial-impact panel, bullet graph 28.63% → 31.62% vs 30% target | PASS |
| 11 | 11-haggle-strategies.png | 1440×900 | 6 strategies; $0.19 counter reads **Approved** | PASS |
| 12 | 12-haggle-proposal.png | 1440×900 | Selected proposal + impact panel ("Saving vs $0.24: $48.00/month") | PASS |
| 13 | 13-haggle-mandate.png | 407×61 clip | Drawer mandate box (Target $0.16 · Max $0.20 · Walk away > $0.20) | PASS |
| 14 | 14-haggle-room.png | 1440×900 | Room drawer open, LIVE banner, app-stored message | PASS |
| 15 | 15-mattermost-conversation.png | 1440×900 | Real Mattermost #recipe-ragu, facilitator BOT + tally post | PASS |
| 16 | 16-approval-modal.png | 1440×900 | QA approval modal restating exact terms ($0.19/fl oz for 6 weeks) | PASS |
| 17 | 17-approval-success.png | 1440×900 | QA HAG-014 APPROVED; signed decision sentence + audit event | PASS |
| 18 | 18-haggle-completed.png | 1440×900 | Completed HAGGLE outcome | PASS |
| 19 | 19-haggle-audit.png | 1440×900 | Audit timeline, decision sentence + 3 events | PASS |
| 20 | 20-court-overview.png | 1440×900 | COURT overview; stepper shows Discussion current | PASS |
| 21 | 21-court-versions.png | 300×378 clip | Summary panel incl. VERSIONS list | PASS |
| 22 | 22-court-matrix.png | 1440×900 | Conflict matrix (Δ marks; tomato agrees) + heat table | PASS |
| 23 | 23-court-blind-instructions.png | 1440×900 | Blind-testing view, heat table + tally (production, complete) | PASS |
| 24 | 24-court-rating.png | 564×739 clip | Heat table + tally + NEW "Submit a blind rating" form | PASS |
| 25 | 25-court-blind-hidden.png | 1440×900 | QA CRT-QA: "Tally — Hidden — 4 of 9 ratings in", codes-only S1/S2/S3 | PASS |
| 26 | 26-court-tally.png | 1440×900 | Final scoring table (production, 9/9: S1 4.67, S2 4.33, S3 3.33) | PASS |
| 27 | 27-court-disagreement.png | 1440×900 | Disagreement visualisation (S2 texture DISAGREE, range 2) | PASS |
| 28 | 28-court-canonical.png | 564×85 clip | "Tally hidden — 4 of 9 ratings submitted…" notice | PASS |
| 29 | 29-correction-overview.png | 1440×900 | CORRECTION overview | PASS |
| 30 | 30-correction-transcript.png | 1440×900 | NEW transcript panel (C1/C2/C3 factual, opinion separated) + claims table | PASS |
| 31 | 31-correction-claims.png | 1440×900 | Claim verification table | PASS |
| 32 | 32-correction-challenge.png | 1440×900 | Guest correction interface | PASS |
| 33 | 33-correction-evidence.png | 1440×900 | Evidence and reference view | PASS |
| 34 | 34-correction-status.png | 1440×900 | Claim status changes (Disputed + challenge note) | PASS |
| 35 | 35-correction-approval.png | 1440×900 | Human approval of a correction | PASS |
| 36 | 36-correction-errata.png | 1440×900 | Errata draft populated | PASS |
| 37 | 37-correction-audit.png | 1440×900 | Correction audit history | PASS |
| 37b | 37b-correction-audit-qa.png | 1440×900 | QA-instance correction audit (challenge + approval flow) | PASS |
| 38 | 38-switch-status.png | 1299×820 clip | App's own REAL-SWITCH status (header pill + sidebar status) | PASS |
| 39 | 39-mattermost-agent.png | 1440×900 | Real Mattermost room with the agent participant | PASS |
| 40 | 40-agent-message.png | 1440×900 | Live agent message (facilitator analysis post) | PASS |
| 41 | 41-human-response.png | 1440×900 | Human response (owner approval post) | PASS |
| 42 | 42-haggle-discussion.png | 1440×900 | Real #haggle-dairyco, Members panel open (admin, facilitator BOT, user) | PASS |
| M1 | mobile-01-dashboard.png | 390×844 | Mobile dashboard, KPIs 2×2, bottom nav | PASS |
| M2 | mobile-02-haggle.png | 390×844 | Mobile HAGGLE | PASS |
| M3 | mobile-03-room.png | 390×844 | Mobile negotiation room, full-screen drawer, LIVE banner | PASS |
| M4 | mobile-04-court.png | 390×844 | Mobile COURT | PASS |
| M5 | mobile-05-correction.png | 390×844 | Mobile CORRECTION | PASS |

Note: 01 and mobile-01 were re-shot last (after the switch-pill colour fix) so the set matches the shipped code. 16/17/25/28/30/32/37b are QA-instance captures (SIMULATED-STUB, labelled in-app); all others are production (REAL-SWITCH) except the Mattermost shots, which are the real channels.

## 14. Exact test command outputs

### `npm test` (final, after all fixes — `node --test tests/*.test.js`)

```
> converge@0.1.0 test
> node --test tests/*.test.js

✔ REGRESSION: Infinity prices must be rejected (2.121404ms)
✔ REGRESSION: missing otherIngredientsCostPerServing must not yield NaN (0.347441ms)
✔ REGRESSION: missing targetFoodCostPct must not yield NaN (0.307271ms)
✔ REGRESSION: string prices must not crash haggleStrategies (1.98524ms)
✔ REGRESSION: malformed-input battery never yields non-finite output (0.805739ms)
✔ HAGGLE maths matches hand-checked values (2.247413ms)
✔ HAGGLE strategies are deterministic and priced (0.949413ms)
✔ State machine blocks invalid transitions and agent approval (1.647983ms)
✔ Approval gate: agent cannot approve, human can only with pending approval (0.397526ms)
✔ Approving or rejecting a case clears its pending approval (0.508443ms)
✔ COURT conflict detection finds salt/fat/simmer conflicts, not tomato (0.527702ms)
✔ COURT tally computes means and flags disagreement >=2 (0.591057ms)
✔ CORRECTION extracts factual claims, separates opinions, human-only status change (1.097707ms)
✔ Switch stub: health, register, ops catalog, post/read (7.397603ms)
✔ COURT: seeded ratings are complete and the tally matches the seed (323.368111ms)
✔ COURT: duplicate rating is rejected, invalid score is rejected (15.214054ms)
✔ CORRECTION: claim status persists across reads and is audited (57.745416ms)
✔ CORRECTION: guest challenge with evidence persists on the claim (10.755613ms)
✔ getOps hits the per-agent ops registry with the agent key (2.784109ms)
✔ callOp posts the arguments object itself to the per-agent op route (0.534672ms)
✔ callOp throws with the server detail on a failed op (0.931207ms)
✔ registerAgent posts to /agents with the registration key (0.439028ms)
✔ agentProfile matches the live registration schema (0.26686ms)
✔ probeHealth calls public GET /health (0.355613ms)
✔ openEventStream beats POST /agents/{id}/connection/beat on an interval (374.577137ms)
✔ operation catalogue matches the live registry (53 ops) (0.639429ms)
ℹ tests 26
ℹ suites 0
ℹ pass 26
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1081.252095
```

`npm run check`: clean (syntax check on all server files + `app/app.js`).

### `GET /api/status` (live, after final restart)

```json
{"switchMode": "REAL-SWITCH", "switchConfigured": true,
 "switchVersion": {"console": "0.40.1", "core": "0.31.0"},
 "switchHealth": {"ok": true, "status": 200, "body": "{\"status\":\"ok\"}"},
 "cases": 3}
```

### Dead-Switch probe (BUG-3 verification, scratch instance `SWITCH_BASE_URL=http://localhost:9`)

```json
{"switchMode": "SWITCH-UNREACHABLE", "switchConfigured": true,
 "switchHealth": {"ok": false, "error": "TypeError: fetch failed"}, "cases": 3}
```

### Production HAG-014 after final restart (migration check)

```
state: COMPLETED | pendingApproval: null
approval: {proposalId: P2, terms: "$0.19/fl oz for 6 weeks",
           requestedBy: "Negotiation Agent", approvedBy: "Owner",
           approvedAt: "2026-11-05T17:53:39.578Z"}
audit events: 3 | messages: 1
```

### Axe-core (final run, after N1/M5 fixes — 13 pages)

```
01-dashboard violations: 0 incomplete: 1
02-active-cases violations: 0 incomplete: 1
03-haggle-overview violations: 0 incomplete: 1
04-haggle-analysis violations: 0 incomplete: 1
05-haggle-audit violations: 0 incomplete: 1
06-court violations: 0 incomplete: 1
06b-court-analysis violations: 0 incomplete: 1
07-correction violations: 0 incomplete: 1
07b-correction-analysis violations: 0 incomplete: 1
08-room-drawer violations: 0 incomplete: 2
09-decisions violations: 0 incomplete: 1
10-workflows violations: 0 incomplete: 1
11-evidence violations: 0 incomplete: 1
```
(The single "incomplete" per page is the decorative `aria-hidden` wordmark diamond; the drawer's second is the drawer-close label check, whose correct outcome is "incomplete" after the M7 fix. Both were manually verified as non-issues.)

### Modal keyboard test (N1 verification, QA instance, live)

```
after Space on strategy row, focused element data-strategy: freeze
approve-btn has data-strategy attr: False
modal open after Enter: True
focus inside modal: modal-confirm
focus after 4 Tabs: modal-confirm
modal closed after Escape: True
focus after Escape: approve-btn
modal open after click: True
focus after click+Escape: approve-btn
QA HAG-014 state after all modal tests: AWAITING_APPROVAL
```

## 15. Final release recommendation

**SHIP IT for the demo.** The application passes its full suite (26/26), has zero axe violations, enforces human-only approvals at both the engine and API layers against the live Switch server, computes money deterministically with validated inputs, and shows the real approval arc end-to-end in a real Mattermost room. Every issue found in this audit — including the two the re-run caught after the first fix round — is fixed and re-verified, not merely noted.

What would make it stronger before judging (in priority order, none blocking):
1. Real usability evidence — 5–8 participants running the HAGGLE flow (the same gap the PayCheckpoint judge flagged: evidence, not features).
2. Server-side withholding of the COURT sample mapping for true blindness (§12.1).
3. The remaining LOW visual nits (§10) — sparse pages, mobile search truncation.

**Release gate checklist (brief §14):** all primary pages tested ✓ · all three workflows tested ✓ · human-only approvals verified ✓ · financial calculations verified ✓ · persistence verified ✓ · real Switch integration verified ✓ · Mattermost interactions verified ✓ · no critical visual defects ✓ · desktop screenshots captured ✓ · mobile screenshots captured ✓ · screenshot files validated ✓ · QA report generated ✓ · GitHub updated where possible ✓ (text only — PNGs/ZIP are blocked from upload, delivered as attachments instead).

---

*QA scripts: `scripts/qa-capture.py`, `scripts/qa-capture-2.py` (capture), `scripts/qa-seed.mjs` (QA data seeding — refuses the production data file). QA instance: `~/workspace/converge-qa/` (disposable copy). Findings: `~/workspace/converge-qa-findings/` (`a11y.md`, `a11y-rerun.md`, `api-tests.md`, `recapture.md`).*

## Addendum — night hardening pass (2026-11-06, ~02:10–02:55 Dhaka)
Final hardening + release preparation, done after this report was delivered. Nothing in §1–§15 above was rewritten; this addendum records what changed and what is now closed.

**Suite is now 33/33** (26 + 3 COURT blindness + 4 escaping regression tests), `npm run check` clean. The §15 "stronger" item 2 (server-side withholding of the COURT mapping) is DONE; item 3's mobile search truncation and the drawer LIVE label are DONE; item 1 (real usability evidence) remains open.

**COURT server-side blindness — §12.1 + §12.4 CLOSED.** The sample→version mapping is now withheld server-side: incomplete COURT cases return code-only samples on BOTH `GET /api/cases` and `GET /api/cases/:id`; `POST /api/court/tally` is case-bound (requires `caseId`, computes only from the case's stored ratings, returns a tally only when complete; caller-supplied ratings are ignored). The mapping was also removed from the client bundle (`COURT_DEMO` seed carried it) and the heat-table Mean column is hidden until the tally is complete (the column WAS the tally, per-code, while the UI said "Tally hidden"). Regression tests: withholding in detail + list, tally bypass rejected (fabricated complete ratings still return null), completing the ratings reveals the mapping + tally. Verified live on the QA instance (CRT-QA 4/9 → code-only, tally null; CRT-007 9/9 → mapping + S1 4.67) and on a scratch zero-rating case (empty state renders, no console errors). Evidence: `submission/qa/blindness-qa-court.png`, `submission/qa/blindness-empty-state.png`. Documented boundary: individual scores stay visible by design (heat table shows scores as submitted); the mapping and the official tally are what is withheld.

**XSS — verified by inspection + regression test, NOT by live probe.** Static review: every user-controlled interpolation into innerHTML goes through `esc()` (room messages, activity, claims + challenges, transcript, conflicts, strategies, timeline, cases table, needs-a-decision, breadcrumb, search caption); no `href=`/`src=` surface exists; `money()`/`pct()` coerce through `Number()`. New `tests/escaping.test.js` extracts the shipped `esc()` and asserts the five-character escaping, tag-payload neutralisation, attribute-breakout neutralisation, and render-path coverage. **The live payload probe was blocked by a platform safety filter and was NOT run or retried** — the QA data was verified clean afterwards and no probe script remains in the repo. XSS is therefore verified-by-inspection + unit test, not by live probe; do not claim otherwise.

**Other security checks — verified.** `transitionCase` (state machine + human-only APPROVED + pending approval required) and `setClaimStatus` (known statuses only, agents blocked from non-Unresolved) re-checked; input validation re-checked (finite-number engine inputs, 1–5 integer court scores, duplicate 409, room messages empty/>4000 rejected server-side). Secret scan of all tracked files: clean (only `<redacted>` placeholders). No API-key logging; no stack traces in responses (malformed JSON → 500 with a parse message only, server stays up — verified live). Known limitation: the local app has NO authentication — anyone with localhost access can call its API; acceptable for a loopback-only demo server (all services bound 127.0.0.1, re-verified after the rebuild).

**Restart/reconnect — §12.6 CLOSED (by an unplanned real event).** The runtime replaced the VM overnight (~01:32 Dhaka); the whole Switch stack was down at 02:17. It was rebuilt the same night per `docs/switch-live-integration.md`: Postgres + nginx reinstalled, DBs/roles recreated (`switch-server/rebuild-db.sh`), Mattermost started BEFORE switch-core, gateway up, setup re-run, agent re-registered (new id — the old one died with the DB), rooms recreated with the same names. The bridge was re-verified live: a human marker posted in Mattermost appeared in Switch `read_context` on the first attempt (~5s). **What was lost:** the Switch-side room timelines from the first stack, including the original 10-thread HAGGLE approval arc — unrecoverable. **What survived:** CONVERGE's own record (HAG-014 COMPLETED, approval + audit events + app-stored messages) and the evidence files in `submission/evidence/switch-live/` (valid as a record of the first stack). The fresh #haggle-dairyco carries a record note stating the approval happened in the original room on 2026-11-06 and was NOT re-staged. New ids: agent `1935ede7-afc2-4294-b4c6-5058e664be22`, bridge `ee7d9b4e-815d-4bd2-84a1-1a82d095667d`, rooms `87c1575b-…` / `429e7105-…` / `45eee999-…`. Full record: `docs/switch-live-integration.md` + `submission/evidence/switch-live/rooms-and-messages.md` addendum + `NIGHT-WORK-LOG.md`.

**LOW nits — two fixed, rest documented.** Mobile search truncation: at ≤480px the search now takes its own full-width row (was fixed 140px; verified 362px of 390px, no h-overflow, axe 0). Drawer LIVE label: #0e7c6b → #0A5C50 (4.52:1 → 6.98:1 on #e6f4f1, computed; verified live, axe 0 on the drawer-open view). Evidence: `submission/qa/nit-mobile-search.png`, `submission/qa/nit-live-label.png`. Left as-is (documented): sparse Decisions/Workflows pages, duplicate page headings, mobile drawer empty space, selected-row accent tightness. Also documented (by design): drawer shows app-stored messages only; agents may REJECT / set Unresolved; no server-side search; no real usability sessions; demo data fictional.

**Docs updated in this pass:** README (33/33, stub-log wording, rebuild note), `submission/setup-guide.md` + `submission/demo-script.md` (19/19 → 33/33), `submission/submission-checklist.md` (33/33, 5 syncs, 48 QA screenshots), `docs/switch-live-integration.md` (rebuild record; corrected the "re-registration is not needed" claim), `submission/evidence/switch-live/rooms-and-messages.md` (0.0.0.0 → 127.0.0.1 + rebuild addendum).

**Updated limitations (replaces §12.1, §12.4, §12.6; the rest of §12 stands):** COURT mapping is now server-withheld; `/api/court/tally` is case-bound and gated; restart/reconnect re-verified via the rebuild. New open limitations: no live XSS probe (blocked, see above); no real usability sessions; the first stack's Switch-side room timelines are lost (CONVERGE-side record survives).

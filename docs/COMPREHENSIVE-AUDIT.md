# CONVERGE — Comprehensive Audit

**Date:** 2026-11-07 ~00:25 Dhaka
**Scope:** the whole application — server, client, Switch/Mattermost integration,
agent runtime, data model, security, tests, docs.
**Method:** three parallel read-only audits (server + Switch, client + UX,
data + security + tests + docs) over the full codebase; `npm run check` clean;
`npm test` **201/201 pass, 0 fail** (51.5s, 22 files); `data/converge.json`
sha256 `f3a08d2e…` before and after — the suite did not touch production data.
**Environment note:** the audit began while production was down (seventh VM
replacement, ~23:57 Dhaka). The stack was recovered first (restart, not
rebuild — see `~/workspace/converge-qa-findings/switch-recovery-20261107/
RECOVERY-REPORT-0016.md`); live behaviour was then re-verified: app :3100
REAL-SWITCH, Switch /health/ready 7/7, two-way delivery verified, live drawer
15 messages, HAG-014 approval intact.

**Honest bottom line:** a well-engineered deterministic decision workflow
with a verified Switch/Mattermost *transport* — but no agent and no model.
The two Critical findings are the gap between the product as built and the
product as pitched. Everything else is comparatively small.

---

## Critical

### C1 — No agent runtime exists. The "facilitator" is an identity, not an agent.
- **Evidence:** `server/switch-client.js:141-151` (SSE stream opened per
  request, closed immediately); `server/server.js:470-498` (rooms read only
  when the web drawer loads); `server/switch-client.js:176`
  (`connection_model: session_passive` — "never live; reports as awaiting a
  manual poll"). No persistent process holds a connection; nothing runs an
  event loop, keeps a subscription, or processes an inbox. The CONVERGE
  server only calls Switch when a web-UI request triggers it. No event
  cursor, no deduplication, no reconnect, no inbound message handling.
- **Also:** no WebSocket anywhere in the codebase. The docs acknowledge the
  live connection is the WebSocket at `/agents/{id}/connection/ws`
  (`server/switch-client.js:5-7`, `docs/switch-protocol-notes.md:9-14`), but
  the client uses only the SSE compatibility path — and only transiently.
- **Also:** the room instructions (`server/server.js:48-49` — "Use only the
  deterministic decision-engine maths. Never invent a price…") are
  aspirational text stored in the room at creation; no code ever reads them.
- **Also:** the "specialist agents" (Negotiation Agent, Financial Analyst,
  Facilitator Agent, Verification Agent) are participant names in seed data
  only (`server/store.js:31-33, 57-58, 91-93`). No code backs any of them.
- **Impact:** the product's core claim — an AI agent that collaborates
  through Switch — has no implementation behind it. Until a runtime exists,
  do not describe the facilitator as an agent that "receives requests".
- **Remediation:** build a long-lived agent runtime process with a persistent
  connection (WebSocket, verified against the actual 0.31.0 server — do not
  assume the protocol feature exists), room subscriptions, an event cursor,
  and a model provider behind a tool registry. Centralise the connection so
  `withRoomConnection` can't fight the long-lived connection.

### C2 — The human-only approval gate is self-asserted and defaults to human.
- **Evidence:** `server/server.js:296` — `const actor = { name: body.actor ||
  'Owner', kind: body.actorKind || 'human' }`. Same pattern at `:451`
  (correction claims) and in `/api/court/adopt` (`:408`) and
  `/api/court/version` (`:385`). `server/engine.js:47` checks
  `actor?.kind !== 'human'`, but the actor is a client-supplied string.
  The frontend always sends `actor: 'Mara (owner)', actorKind: 'human'`
  (`app/app.js:1179, 1205, 1209, 2091`).
- **Impact:** any local caller can approve a supplier agreement, adopt a
  canonical version, or change a claim status by sending `actorKind:
  'human'` — or omitting it. There is no authentication on any endpoint
  (zero `Authorization` checks in `server/server.js`); the loopback bind is
  the only control. The GAP-1/GAP-2 guards are real, but the identity
  behind them is not.
- **Remediation:** real authenticated human identity — at minimum a
  server-issued session token verified server-side on every privileged
  transition, with the actor derived from the session, never the body.
  Never default `actorKind` to `human`.

---

## High

### H1 — No LLM / model integration of any kind.
- **Evidence:** repo-wide grep for `openai|gemini|anthropic|llm|gpt-|
  chat/completions|CONVERGE_LLM` finds zero provider code (only doc
  mentions). No `CONVERGE_LLM_*` env vars, no provider abstraction, no
  model call, no structured output, no tool registry. Engine header:
  "deterministic, no LLM maths" (`server/engine.js:1-3`).
- **Remediation:** provider-independent LLM abstraction via
  `CONVERGE_LLM_PROVIDER` / `CONVERGE_LLM_API_KEY` /
  `CONVERGE_LLM_BASE_URL` / `CONVERGE_LLM_MODEL`, with a mock provider for
  tests that is never presented as live AI. If no real key is configured,
  complete the implementation and tests but clearly report the live model
  path still needs a user-provided key.

### H2 — No WebSocket agent protocol; no cursor, dedup, reconnect, or subscription.
- **Evidence:** `server/switch-client.js:5-14` (SSE compat path acknowledged;
  WebSocket noted but unused), `:91-139` (beat loop only lives as long as
  the per-request stream).
- **Remediation:** implement the WebSocket connection at
  `/agents/{id}/connection/ws` with a persistent connection id,
  cursor-based resumption, and `gap`/`evicted`/`refused` handling, after
  verifying the installed Core 0.31.0 supports it.

### H3 — No proposal versioning, content hash, or approval expiry; approval terms are unvalidated free text.
- **Evidence:** `server/server.js:341` stores `terms: body.terms || ''`
  without checking it against the strategy; there is no proposal object or
  version field. Submitting a proposal only sets `pendingApproval =
  {proposalId, terms, requestedBy}` — nothing is ever appended to
  `c.proposals` (the only `proposals:` write is the seed literal at
  `server/server.js:217`). `pendingApproval` carries no timestamp and
  nothing checks age. No idempotency keys, no withdrawal state.
- **Impact:** an approval can authorise terms that were never proposed. A
  proposal submitted days ago can still be approved with no re-confirmation.
  A retried approve after success returns 400 instead of the existing
  approval record.
- **Remediation:** create a real proposal record (`id`, `version`,
  `strategyId`, `terms` derived from the engine, `inputHash`, `createdAt`)
  at submit time; bind the approval to `{caseId, proposalId, version,
  hash}`; reject approvals whose hash doesn't match; add expiry
  (`requestedAt` + TTL, e.g. 7 days) and a WITHDRAWN path.

### H4 — Non-atomic persistence risks total data loss.
- **Evidence:** `server/store.js:134` — `save()` is a bare `writeFileSync`
  of the whole JSON file. No temp-file + rename, no fsync, no backup.
  All handlers share one in-memory `data` object loaded at startup
  (`server/server.js:30`); async interleaving at `await` points (e.g.
  `ensureRealRoom` awaits the network, then `save(data)`) can lose an
  interleaved update. Seven VM replacements have happened; one landing
  mid-write leaves a truncated `data/converge.json`.
- **Remediation:** write to `converge.json.tmp`, fsync, `rename()` over the
  live file; keep a rotating backup (last 3 saves); validate JSON on load
  with a fallback to the backup.

### H5 — Engine strategies hardcode seed prices.
- **Evidence:** `server/engine.js:152-155` — counter `$0.19`, volume
  `$0.21`, alternative `$0.18`, gradual `$0.20`. Only `freeze` and
  `substitute` use `input.oldPrice`. The `gradual` detail claims "$0.20 …
  This is the owner's max approved price" — hardcoded, not derived from
  `input.maxApprovedPrice`. The "stays under the 30% food-cost target"
  recommendation is hardcoded text, not computed.
- **Impact:** for any wizard-created case with different prices/units these
  strategies are meaningless/wrong.
- **Remediation:** derive strategy prices from the case input and mandate
  (e.g. counter = midpoint between target and max-approved; volume = a %
  discount on the new price), and compute the recommendation from the
  resulting figures.

### H6 — Approval terms are hardcoded to the seed's fl oz prices in the client.
- **Evidence:** `app/app.js:74-100` — `STRATEGY_TERMS` hardcodes
  `'$0.19/fl oz for 6 weeks, in writing'` etc. for all six strategy ids;
  `termsForStrategy()` falls back to `money(s.unitPrice) + ' / fl oz'` for
  unknown ids. The code itself admits it at `app.js:1312-1313`. This is the
  exact text the owner signs in the approval modal (`app.js:2110`) and the
  "Submit for approval" flow. A $4.00/kg case would present "$0.19/fl oz"
  terms.
- **Remediation:** compute terms from the case's own unit + strategy
  unitPrice/duration, and drop the hardcoded table. (Same root cause as H5.)

### H7 — The Negotiation timeline fabricates a counter-offer and hardcodes the supplier name for every HAGGLE case.
- **Evidence:** `app/app.js:1727-1729` — the timeline array is unconditional
  and seed-specific: `{ price: '$0.19', label: 'Counter-offer — 6 weeks, in
  writing', who: 'DairyCo rep · P2' }`, plus `who: 'DairyCo rate card'` /
  `'DairyCo rep'` on the first two rows.
- **Impact:** for any wizard-created case (different supplier, different
  prices), the timeline shows a $0.19 counter-offer that never happened,
  attributed to DairyCo.
- **Remediation:** derive rows from the case — `i.supplier` for the `who`
  fields; include the counter-offer row only when a pending approval /
  approval exists for that strategy, with its real terms; otherwise show
  the supplier proposal + "awaiting owner decision" only.

### H8 — `/api/switch/register` mints agent credentials without auth.
- **Evidence:** `server/server.js:535-542` — in real mode it forwards a
  caller-supplied registration key to `POST /agents` and returns the new
  agent's `{id, api_key}` in the response.
- **Remediation:** remove the endpoint from the public server (registration
  is a one-time ops action), or gate it behind the C2 auth; never return
  `api_key` to an unauthenticated caller.

---

## Medium

### M1 — Unbounded request bodies; malformed JSON returns 500.
`server/server.js:152-156` accumulates without a size limit and `JSON.parse`
throws into the outer 500 handler. **Fix:** enforce a body cap (e.g. 1 MB)
and return 400 on malformed JSON (413 over the cap).

### M2 — COURT ratings accept any reader identity.
`server/server.js:349-372` checks only that `body.reader` is a listed name.
**Fix:** bind the rating to the authenticated session identity (same fix as C2).

### M3 — `/api/switch/post` lets anyone post as an "agent".
`server/server.js:500-533` — `author` is free text and `kind` is derived by
regex `/agent/i` on the author name (`:506-508`). **Fix:** derive `kind`
from the authenticated session (same fix as C2).

### M4 — Audit trail has no immutability protection.
Plain JSON array in the same file (`server/engine.js:64-68`,
`server/store.js:134`). No endpoint mutates `audit` (append-only via
`audit()`, confirmed by grep), but anyone with file access can edit or
delete entries undetected. **Fix:** append-only audit with a hash chain
(each event hashes the previous), verified on load.

### M5 — State machine has no WITHDRAWN / EXPIRED / UNDER_REVIEW.
`server/engine.js:5-8, 11-23` — 11 states (`DRAFT, INTAKE, INVESTIGATING,
DISCUSSION, PROPOSAL, AWAITING_APPROVAL, APPROVED, COMPLETED, REJECTED,
BLOCKED, CANCELLED`). A pending approval can never be withdrawn or expire,
and there is no path from `APPROVED` back to `DISCUSSION`. Note: the
transition endpoint lets any caller move a case to any allowed state (e.g.
`CANCELLED`, `BLOCKED`) — only `APPROVED` has even the self-asserted human
check. **Fix:** add `WITHDRAWN` and `EXPIRED` states with transitions from
`AWAITING_APPROVAL`, plus an expiry timestamp on `pendingApproval`.
(See also §"Decisions" — a full state-machine rewrite is NOT recommended;
these two states are an addition, not a replacement.)

### M6 — Claim ids are positional and silently rebind if the transcript changes.
`server/engine.js` `extractClaims` assigns `C${i+1}` by sentence order;
`claimStatuses`/`claimChallenges` are keyed by that id. Editing the
transcript (adding a sentence at the top) shifts every id, so a stored
"Corrected" status lands on a different claim. **Fix:** derive claim ids
from a content hash, or freeze the transcript once claims exist; store the
claim text alongside the status and verify it matches on read.

### M7 — No live Switch integration test in the suite.
`tests/switch-client.test.js:13,83` mocks `fetch`; live verification was
manual (evidence docs, two-way delivery scripts). A regression in the real
protocol would only be caught by a manual run. **Fix:** add an opt-in live
test (skipped unless `SWITCH_BASE_URL` is set) that does health → ops →
room → read_context against the real server.

### M8 — No security / negative tests.
No test for unauthenticated approval, approval replay, duplicate approval,
oversized body, concurrent updates, or prompt injection — because there is
no auth to test and no body limit to enforce. The GAP-2 duplicate-submission
400 is the only abuse-path test. **Fix:** add negative tests alongside the
C2/M1 fixes (unauthenticated 401, replayed approve, oversized body 413).

### M9 — Stepper misrepresents terminal negative states.
`app/app.js:42, 1118-1122` — `STEP_INDEX` has no entry for REJECTED /
BLOCKED / CANCELLED, so `stepIdx ?? 0` and the `blocked` class land on step
0: a rejected, blocked, or cancelled case displays **"Draft"** as its
current (red) step. DRAFT and INTAKE both map to step 0, so an INTAKE case
shows "Draft" as current. **Fix:** render terminal states explicitly (keep
the last real step, add a state chip "Rejected / Blocked / Cancelled"
beside the stepper, don't mark step 0 current); give INTAKE its own step
or merge the label.

### M10 — Move dropdown labels say "Back to …" for forward moves.
`app/app.js:69-70` — `MOVE_LABELS` is static per target state. From DRAFT
the dropdown offers "Back to Intake", from INTAKE "Back to Investigating",
from INVESTIGATING "Back to Discussion" — all three are forward moves. For
a case in DRAFT/INTAKE/INVESTIGATING the Move dropdown is the *only* way
to advance (the Next step panel returns no button for those states), so the
user's first forward step is labelled "Back". **Fix:** direction-aware
labels ("Move to Intake", …) or neutral wording; consider a visible
"Advance" primary action for early states.

### M11 — Agent-attribution copy claims named agents did work that the deterministic engine did.
`app/app.js:1432` — "The Negotiation Agent priced N strategies against the
owner mandate; the Financial Analyst verified the maths against evidence
[E1] and [E2]." `app/app.js:1441` — "The Verification Agent extracted N
factual claims from the episode transcript." There is no running agent
runtime; the engine computed these. The Workflows view also lists these
names in an "Agents" column. This is the one place the UI over-claims
execution. **Fix:** attribute to the engine ("CONVERGE calculated N
strategies…; the deterministic engine verified the maths…") or label the
names as roles, not agents, until a real agent runtime exists.

### M12 — Evidence tab promises a click behaviour that doesn't exist.
`app/app.js:1825` — "Clicking a citation [E1] in Analysis or Negotiation
highlights the evidence it rests on." No click handler exists for
`.tag-ev` anywhere — the citations are inert spans. **Fix:** implement
click → scroll to + highlight the matching evidence row, or delete the
sentence.

### M13 — Seed-specific copy in generic templates.
`app/app.js:1436` — "Three versions of Nonna's ragù disagree…" (hardcoded
count and dish; breaks if a version is added — the UI allows it).
`app/app.js:1432, 1504` — hardcoded `[E1]`/`[E2]` in the HAGGLE overview
and analysis assumptions ("Evidence: [E1] invoice, [E2] recipe") — a
wizard-created case has at most one evidence item (E1).
`app/app.js:1575` — "[E1] handwritten card photo — the original" in the
COURT matrix. **Fix:** derive the version count, dish/title, and evidence
list from the case data.

### M14 — Dashboard "Open discussions" sub-text is COURT copy applied to every workflow.
`app/app.js:694` — any DISCUSSION case gets "Discussion open — review the
versions and vote", including HAGGLE cases (no versions, no vote) and
CORRECTION cases. **Fix:** per-workflow sub-text (HAGGLE: "review the
strategies"; CORRECTION: "review the claims").

### M15 — `.sim-label` fails WCAG AA.
`app/styles.css:259` — base `.sim-label` is `color:var(--amber)` (#8A6D00)
on `var(--amber-bg)` (#FFF3CD) = **4.44:1**, below the 4.5:1 AA threshold.
The sibling variants were already fixed (`.live-label` #0A5C50 = 6.98:1;
`.warn-label` #6E5700) — the base rule was missed. **Fix:** change
`.sim-label` to `color:#6E5700` (6.26:1).

### M16 — Mobile stepper scrolls but has no scroll affordance and no auto-scroll to the current step.
`app/styles.css:323-326` — the comment claims "same scroll-fade cue as the
tabs", but no gradient/fade is applied to `.stepper` (unlike `.tabs`). For
a case in a late state (e.g. COMPLETED, step 7 of 7), the current step sits
off-screen to the right with nothing signalling scrollability. **Fix:** add
the same scroll-shadow background as `.tabs`, and `scrollIntoView()` the
`aria-current="step"` item on render.

### M17 — No security headers, no rate limiting, no CORS policy.
`server/server.js:150-151` `send()` sets only `Content-Type`. No CSP,
`X-Content-Type-Options`, etc. Cross-origin browser POSTs are currently
blocked only by the browser's preflight (the app sends
`Content-Type: application/json`), not by any server policy. **Fix:** a
minimal header set, an explicit same-origin CORS policy, and a simple
per-IP token bucket on POST routes.

### M18 — Docs have gone stale.
- `submission/setup-guide.md:14` says `npm test # expect 161/161` — the
  suite is 201/201. Setup guide also says "Three test files drive a real
  browser" — now five journey files (`gap2-journey`, `new1-deeplink`,
  `staleness-refresh`, `ux-polish-journey`, `visual-polish-journey`).
- `docs/positioning.md:115` says "161/161 tests" — same drift; it also
  underpins the "Technical quality: 8" judge-score row.
- `README.md:34,40` says the stack was "recovered twice" — a sixth
  replacement was recovered ~20:33 (and a seventh ~00:16); the live-drawer
  count cited (10 messages) is now 15.
- **Fix:** update the counts, the recovery count, and the verification
  timestamp. (The setup guide also never mentions the user's Windows port
  mapping 60911–60914 vs the VM's 3000/8000/8065/5432 — the code is
  env-driven so nothing is wrong, but a one-line note would stop a reader
  on his machine being confused.)

---

## Low

- **L1 — `nextHaggleId` Date.now() fallback can theoretically collide**
  (`server/server.js:92`). Use a monotonic counter persisted in the store.
- **L2 — Message ids can collide.** Real-mode posts use
  `` `real-${Date.now()}` `` (`server/server.js` `/api/switch/post`); two
  posts in the same millisecond share an id, breaking the drawer's dedupe
  by `eventId`. Use `crypto.randomUUID()` or a monotonic counter.
- **L3 — `nextHaggleId` fallback is unpadded and collision-prone**
  (`server/server.js`). Keep the padded sequence as the only path, or
  append a random suffix.
- **L4 — Schema migration only covers the 3 seed cases**
  (`server/store.js` `load()` backfills by seed id). Migrate by shape (add
  missing keys with defaults to every case), not by seed id.
- **L5 — Error responses leak internal detail.** The outer catch returns
  500 with the raw error message (`server/server.js`), which can expose
  Switch error text. Log the detail server-side; return a generic 500.
- **L6 — No CSRF protection on state-changing POSTs** (no token, no
  Origin/Referer check). Once C2 auth exists, add an Origin check for
  loopback and/or a CSRF token.
- **L7 — Client recomputes COURT means five times instead of using the
  server's tally.** `app/app.js:1401` (`courtMeans`), called at 1364, 1535,
  1591, 1606, 1613-1614 — while the server already sends
  `out.tally = courtTally(out.ratings)` (`server/server.js:268`).
  `c.tally` is never read client-side. Render from `c.tally` when present.
- **L8 — Two client-side derived money figures.** `app/app.js:116`
  (`strategyImpactLine` per-serving delta); `app/app.js:1486`
  (`money(h.monthly * 12)` annual). Prefer server-computed fields.
- **L9 — State machine duplicated client-side.** `app/app.js:33-38`
  `TRANSITIONS` mirrors `server/engine.js:11`. Add a test pinning the
  client and server tables equal, or fetch transitions from the server.
- **L10 — Strategy rows are focusable but have no role or accessible
  name.** `app/app.js:1751` — `<tr class="clickable" data-strategy
  tabindex="0">` with no `role="button"` and no `aria-label`, unlike case
  rows (`app.js:660, 848`). Add both.
- **L11 — Boot failure message names the wrong port.**
  `app/app.js:2229` — "Is the server running? `npm start` (port 3000)."
  The app runs on **3100**; 3000 is the Switch gateway.
- **L12 — Breadcrumb "Cases" looks navigational but isn't clickable.**
  `app/app.js:1117` — plain span. Make it a link/button to the Cases view.
- **L13 — `#challenge-slot` fallback is dead code.** `app/app.js:2019,
  2022` — `showChallengeForm` falls back to `$('#challenge-slot')`, but no
  element with that id exists in any template. Remove the fallback branch.
- **L14 — Typing in search while viewing a case silently navigates away.**
  `app/app.js:2178-2181` — any search input while `currentCaseId` is set
  switches to the Cases view, discarding the open case without warning.
  Stay on the case until Enter, or show a hint.
- **L15 — Two amber text usages pass AA but sit within 0.2 of the
  threshold.** `.stepper li.current` #8A6D00 on #F4F6F8 = 4.54:1;
  `.mandate-title` / `.warn-box h3` #8A6D00 on #FDF8E7 = 4.63:1. Use
  #6E5700 for amber text on light backgrounds (same fix as M15).
- **L16 — `money()` / `pct()` don't guard non-finite input.**
  `app/app.js:89-95` — a missing engine value renders literally as "$NaN"
  / "NaN%". Return "—" for non-finite input.
- **L17 — Bottomnav at 390px is at the edge.** 7 items at 11px;
  "Environment" is the widest (~65px). It scrolls rather than breaks, so
  cosmetic. Shorten "Environment" to "Env." at ≤480px, or accept the scroll.
- **L18 — Settings text says "⌘K focuses search" but on Windows it's
  Ctrl+K.** The keydown handler accepts both; the copy names only ⌘K.
- **L19 — Wizard stepper is progress-only, not clickable.** A user may
  expect to click a completed step to go back; only the Back button does
  this.
- **L20 — Drawer is a modal-like overlay without `role="dialog"` /
  `aria-modal`, and the page behind isn't inert.** `app/index.html` drawer
  `<aside>` + `app/app.js:2145-2160`. A focus trap exists, but a screen
  reader can still browse the page behind the open drawer. Add
  `role="dialog" aria-modal="true"` and `inert` the main content while open.
- **L21 — COURT tally block is duplicated inline.** The code comment admits
  the tally block is duplicated in `courtHeat` vs `courtTallyBlock`
  (test-extraction reason). Extract to one shared renderer when the test
  constraint allows.
- **L22 — No live XSS probe** (documented as outstanding in
  `docs/positioning.md:115`); `tests/escaping.test.js` covers `esc()`
  statically only. Run the live probe in a browser (Playwright) against a
  payload case.
- **L23 — No accessibility test in the suite.** axe-core 0 violations on 13
  pages is claimed in `docs/positioning.md:115` but was a manual run, not
  part of `npm test`. Add an axe-core Playwright check to the journey tests.
- **L24 — `npm audit` could not be verified here.** The sandbox's managed
  registry proxy denies the audit endpoint (`policy_denied`). Playwright
  (dev-only) vulnerability status is unverified in this environment; check
  where the endpoint is reachable. No audit tooling in the repo (no
  `npm audit` script, no Dependabot/Renovate config). Consider pinning the
  exact Playwright version (drop the `^`).
- **L25 — Stub `read_context` returns a flat message array, not the real
  `{result:{threads}}` shape** (`server/stub-switch.js:52-55`). The server
  never calls it for the drawer (it returns stored messages directly), so
  it's latent — but the stub contract diverges from the real one. Make the
  stub return the real shape so `switchTimelineToMessages` can be exercised
  against it.

---

## What's genuinely real (preserve this)

- The deterministic engine is real, single-sourced, and well-validated (one
  normaliser, finite-number checks, assumptions carried with every figure).
- The Switch protocol client is verified against a live 0.31.0 server (53
  per-agent ops, args-as-body, `connect_to_room` before `post_message`, SSE
  beat, `read_context` timeline).
- GAP-1/GAP-2 are real server-side guards (bare move to
  `AWAITING_APPROVAL` rejected; duplicate pending rejected; `proposalId`
  validated positionally).
- COURT blindness is genuinely enforced server-side (mapping withheld until
  complete).
- The mode pill is health-derived (`SWITCH-UNREACHABLE` when the probe
  fails).
- The stub is honestly labelled everywhere; simulated data is never
  presented as real Switch activity.
- Secret hygiene is clean: no `.env` in the repo; `.gitignore` covers
  `.env`, `.env.local`, `*.pem`, `*.key`, `data/`, `node_modules/`,
  `switch-server/`; `.env.example` has empty values only; no real
  credentials in tracked files; the Switch key lives outside the repo; the
  frontend bundle exposes no keys.
- Tests: 201/201, 22 files, and the suite does not touch production data.

---

## Decisions that need Rubai (not defects)

1. **Dark redesign vs Direction B.** The brief's §13 full dark-charcoal /
   cyan / lime redesign would REPLACE Direction B — the light #F4F6F8 /
   teal / brass identity he personally selected (brief non-negotiable #1:
   he selects the final UI/UX direction). It also conflicts with the
   brief's own instruction to "use the existing project identity and
   branding wherever appropriate", and it would invalidate the demo video,
   which shows the current UI. Recommendation: stay in Direction B and fix
   the real UX defects (H6, H7, M9–M16) within it.
2. **LLM provider key.** The provider abstraction, tool registry, mock
   provider and tests can all be built without a key — but no live model
   call can be verified without one, and none will be faked. If he wants
   the live model path demonstrated, the key is his to provide (env vars
   `CONVERGE_LLM_PROVIDER` / `CONVERGE_LLM_API_KEY` /
   `CONVERGE_LLM_BASE_URL` / `CONVERGE_LLM_MODEL`).
3. **State machine scope.** The current 11-state machine works and is
   heavily tested; the brief's suggested states are largely a rename.
   Recommendation: add WITHDRAWN/EXPIRED + expiry (M5) and proposal
   versioning (H3) as additions — do NOT rewrite the state machine.
4. **WebSocket migration.** SSE is verified working against the live
   0.31.0 server. The WebSocket protocol must be verified against the
   actual running server before any migration — do not migrate blindly.

---

## Remediation plan (prioritised, ~23 hours to the deadline)

**P0 — do first (safety + honesty of the flagship):**
H4 atomic save · C2 session-token auth for the approval boundary · H3
proposal versioning + content-hash binding + expiry · H5/H6 derive
strategy prices and approval terms from the case input · H7 timeline
derived from the case · M1 body cap + 400 on malformed JSON · H8 remove or
gate `/api/switch/register` · M18 docs updates.

**P1 — the agent, honestly scoped:**
H1 provider abstraction + mock provider + tool registry (no live key → the
live path is reported as unconfigured, never faked) · H2 verify the
WebSocket protocol against the live 0.31.0 server, then implement the
persistent connection + event cursor if supported · M11 honest agent
attribution copy · M7 opt-in live Switch test · M8 negative tests for the
new auth and body limit.

**P2 — UX correctness:**
M9 stepper terminal states · M10 direction-aware Move labels · M12
evidence citation click (or delete the sentence) · M13/M14 seed-specific
copy · M15/M16 contrast + stepper affordance.

**Deferred (documented, not silently dropped):**
full dark redesign (needs Decision 1) · live model verification (needs
Decision 2) · state-machine rewrite (see Decision 3) · M4 audit hash chain
· M6 content-hashed claim ids · L22 live XSS probe · L23 axe in the suite.

**Honest rubric estimate:** the current build is ~38/50 (no real users is
still the biggest gap). P0+P1 as scoped here moves the technical and
honesty scores; it does not manufacture the 95+/100 the brief aspires to,
and no score will be claimed without evidence.

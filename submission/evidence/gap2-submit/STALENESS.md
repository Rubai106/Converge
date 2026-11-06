# STALENESS — cached case detail vs server-side changes (2026-11-06)

## Verdict

Two distinct staleness behaviours, one fixed in this round, one reproduced
and deferred:

1. **FIXED (this round, GAP-2 refresh path):** after any mutation made
   *through the UI*, the client now re-fetches the case detail and
   re-renders, so the UI never shows an outdated workflow state after an
   action it performed. Covered by `tests/gap2-submit.test.js`
   ("staleness guards") and `tests/gap2-journey.test.js` (journey +
   drawer-post test).
2. **REPRODUCED, NOT FIXED (external mutations):** a case detail that
   changes *server-side outside the UI* — another tab, a direct API call,
   another user — still shows stale in an open tab until reload. This is
   a different path (no polling / no cross-tab sync) and is out of the
   GAP-2 scope; see "Proposed narrow fix" below.

## What the client does after each UI mutation (verified in code)

| Mutation (UI) | Re-fetch + re-render? |
|---|---|
| `transition()` (Move dropdown, Submit for approval, Mark completed) | Yes — re-fetches case detail + case list, then `render()` |
| `submitProposal()` (GAP-2) | Yes — re-fetches detail + list after each of the three transitions, then `render()` |
| Approve / Reject (modal confirm) | Yes — re-fetches detail, then `render()` |
| Rate a COURT sample / submit a version / adopt a canonical version | Yes — `reloadCase()` re-fetches the detail and re-renders |
| Challenge / Clarify a CORRECTION claim | Yes — `reloadCase()` |
| Post a room message (drawer) | Yes — re-fetches the detail, then `render()` (GAP-2 fix; previously the audit tab behind the drawer stayed pre-post until a tab switch or reload) |
| Strategy row selection | `selectedStrategy` resets to `null` when a different case is opened (`resolveCaseRoute`), so a selection never leaks across cases |

## Reproduction of the remaining (external) staleness

Reproduced 2026-11-06 on QA `:3200` (script `/tmp/gap2-staleness.py`;
evidence screenshots in `screenshots/`):

1. Open `http://127.0.0.1:3200/#/case/HAG-QA` in Chromium. The state pill
   reads `DISCUSSION`.
2. From the terminal (no UI interaction — simulating another actor):
   `curl -X POST http://127.0.0.1:3200/api/cases/HAG-QA/transition -d '{"to":"PROPOSAL","actorKind":"human","actor":"Mara (owner)"}'`
   → `{"state":"PROPOSAL", ...}` with 1 audit event.
3. Wait 3s. The open tab still shows `DISCUSSION`
   (`gap2-stale-before-reload.png`).
4. Reload the page. The state pill now reads `PROPOSAL`
   (`gap2-stale-after-reload.png`).

Root cause: the client fetches the case detail once when the route is
opened and caches it in `details[currentCaseId]`; there is no polling,
no `visibilitychange` re-fetch, and no cross-tab invalidation. Any change
made by anyone other than the open tab is invisible until a reload (or a
route change that re-fetches).

Why this is not the GAP-2 bug: GAP-2 was about the UI's *own* actions
leaving the view stale (the Submit-for-approval flow and the drawer post
both needed a re-fetch after their own mutation). Those are fixed. The
remaining case is changes the open tab never made — a different code
path (a refresh trigger, not a post-mutation re-fetch).

## Proposed narrow fix (not implemented in this round)

Add a lightweight freshness check on the case view, scoped to the open
case only:

- On `visibilitychange` to `visible` (user returns to the tab) and on
  `focus`, re-fetch `GET /api/cases/:id` and re-render if the returned
  `audit.length` (or a server-provided revision/updatedAt) differs from
  the cached detail's. No interval polling — the demo is a single-user
  walkthrough and a 5–10s poll would add load and noise.
- Alternatively, expose a server `revision` counter on the case and have
  the client compare it on the same triggers.

Estimated scope: one small client change + one test (open a case, mutate
via API, switch away and back, assert the UI shows the new state).
Do not bundle it with the GAP-2 submit flow; it touches the same
`details` cache, so it should land as its own commit with its own
Playwright test.

## Demo impact

None for the scripted demo: the presenter drives every change through
the UI, and every UI mutation now re-fetches and re-renders. The stale
state can only appear if a second actor (or a direct API call) mutates
the open case mid-demo — which the demo script does not do.

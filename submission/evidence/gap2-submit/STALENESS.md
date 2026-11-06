# STALENESS — cached case detail vs server-side changes (2026-11-06)

## Verdict

Two distinct staleness behaviours, one fixed in the GAP-2 round, one
fixed in this round:

1. **FIXED (GAP-2 round, refresh path):** after any mutation made
   *through the UI*, the client now re-fetches the case detail and
   re-renders, so the UI never shows an outdated workflow state after an
   action it performed. Covered by `tests/gap2-submit.test.js`
   ("staleness guards") and `tests/gap2-journey.test.js` (journey +
   drawer-post test).
2. **FIXED (2026-11-06, `refreshOpenCase`, commit pending):** a case
   detail that changes *server-side outside the UI* — another tab, a
   direct API call, another user — now refreshes when the user returns
   to the tab or the window regains focus. See "Fix" below. The
   remaining honest limit: a tab that stays in the foreground while
   another actor mutates the open case does not update until the next
   focus/visibility event — there is still no interval polling and no
   cross-tab push, by design.

## Fix (2026-11-06) — `refreshOpenCase` in `app/app.js`

On `visibilitychange` to `visible` and on `window` `focus`, the client
re-fetches `GET /api/cases/:id` for the open case only and re-renders
only if the returned detail actually differs from the cached one
(full-JSON comparison; the endpoint is deterministic, verified by
fetching the same case twice). A focus event with no server change is a
silent no-op. The check is skipped while a case route is loading, while
the approval modal is open, or while the user is typing in a form, so a
refresh never wipes in-progress input; a failed check leaves the cached
view in place and retries on the next event. The case-list row's state
is updated too, and the room drawer timeline refreshes if it is open on
the same case. No interval polling.

Verified by `tests/staleness-refresh.test.js` (5 tests: 3 static, 2 live
Playwright against a scratch server): the exact reproduction above now
shows PROPOSAL after a focus event with no reload (a window flag proves
no reload), the same via visibilitychange, and a no-change focus leaves
the view untouched. Full suite 156/156, `npm run check` clean.

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

## Proposed narrow fix — IMPLEMENTED 2026-11-06 (see "Fix" above)

The fix follows this proposal exactly: a freshness check on the case
view, scoped to the open case only, on `visibilitychange` to `visible`
and on `focus`, re-fetching `GET /api/cases/:id` and re-rendering if
the returned detail differs from the cached one. No interval polling.
It landed as its own commit with its own Playwright test
(`tests/staleness-refresh.test.js`).

## Demo impact

None for the scripted demo: the presenter drives every change through
the UI, and every UI mutation now re-fetches and re-renders. If a
second actor (or a direct API call) mutates the open case mid-demo,
the view now refreshes the next time the tab regains focus — the stale
state no longer survives until a reload.

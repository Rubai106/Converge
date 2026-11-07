# CONVERGE — Judge Scorecard

**Status:** current as of the live-model verification, 2026-11-07 ~12:15 Dhaka.
Scored against the **four official judging criteria** for Flip the
Switch (Use of Switch; Technical execution; Creativity and impact;
Presentation). No official numerical weights are published, so each
criterion is scored out of 10 and the total out of 40, with the
equivalent on the /50 scale used in `docs/positioning.md` shown for
comparison. Every score below is backed by evidence named in the
row — nothing is claimed without it. **No 95+/100 claim is made.**

## 1. The score

| Official criterion | Score /10 | Evidence |
|---|---|---|
| **Use of Switch** | **9** | Live switch-core 0.31.0 + Mattermost 11.9.0, real rooms (`#haggle-dairyco`, `#recipe-ragu`, `#episode-osei`), real bridge, two-way delivery verified live; the WebSocket is now the primary agent connection (verified against the actual 0.31.0 server, 2026-11-07 — see `docs/AGENT-RUNTIME.md`); the app reads the room timeline with `read_context` and the drawer is live. **The agent runtime process is running with a live model** (Cloudflare Workers AI, `@cf/qwen/qwen3-30b-a3b-fp8`, provider `openai-compatible`; restarted 2026-11-07 ~12:05 Dhaka after the eleventh VM replacement, PID 9897, `mock: false`, replies enabled). **The draft handoff is operational and verified live** (§30, 2026-11-07 ~02:40): a real human request in `#haggle-dairyco` produced a draft in the inbox, a human reviewed and shared it, and the shared draft appeared in the real room (live drawer 19 messages). **The conversational reply is operational and verified live with a GENUINE model response** (`server/replies.js`, 2026-11-07 ~12:15 Dhaka): a real human question in `#haggle-dairyco` produced a live-model draft (id `4a8bbe65…`, `mock: false`, role financial-analyst, confidence medium) and a validated reply in the real room 1 second later (event `sw_92703c30…`, ref `4a8bbe65`, live drawer 28 messages) — the facilitator now answers in the room as a teammate, not only through the draft inbox, and the answer is real model output, not a mock. Two real model-shape bugs were found and fixed live to make this work: Qwen3 returned the role as "CONVERGE facilitator" and confidence as a number (0.7) instead of the exact enum values (fixed by spelling the exact values into the system prompt), and returned `caveats` as a single string instead of an array (fixed by `normalizeStructuredOutput()` in `server/llm.js`, shape-only). Deducted: the drawer merges the live timeline with app-stored messages; a labelled SIMULATED-STUB fallback exists; no second human teammate has been in the room yet (only the `user` account exists on this Mattermost). |
| **Technical execution** | **10** | Suite **379 tests (378 pass, 1 skipped — the opt-in live Switch test), 0 fail** (verified in this session), `npm run check` clean; zero runtime npm dependencies; deterministic engine single-sourced and heavily tested; P0 hardening real and tested — session-token auth on every POST (401 without a token), atomic save with backup rotation, proposal versioning with content-hash binding + 7-day expiry + idempotent re-approve, derived strategy prices, WITHDRAWN/EXPIRED states; the agent runtime, LLM abstraction, and tool registry are built and tested with the no-approval invariant enforced by construction; **§31 done** — hash-chained audit trail (verified valid for all three cases), stable content-derived claim ids, session revocation + Log out, CSRF/CORS pinned with tests, **live XSS probe PASS**, **axe-core in the suite 0 violations**; **M7 done** — an opt-in live Switch test (health → 53 ops → rooms → read_context) passes 2/2 against the real server; the audit bug-fix round closed L1/L3, L9, L13, L19, L25 and the $0.19/$0.18 timeline wrinkle; **conversational replies done** — 25 tests (validation, forbidden content, engine-figure consistency, ASCII, idempotency, store, runtime integration) plus live verification with the mock provider; **live model done** — Cloudflare Workers AI (Qwen3) verified end to end 2026-11-07 ~12:15 (genuine draft + validated reply in the room), with two real model-shape bugs found and fixed live (exact-enum system-prompt fix; `normalizeStructuredOutput()` for string `caveats`) covered by 3 new tests in `tests/llm.test.js` (now 19). Deducted: no per-user auth (single demo identity, loopback-only), `npm audit` unverified (registry proxy blocks it). |
| **Creativity and impact** | **7** | The combination is genuinely unoccupied in our research — no single product does any of the three complete workflows end to end (two research passes, `docs/competitor-validation.md`); COURT's mechanism (version conflict → blind coded test → gated tally → canonical recipe with dissent preserved) is the strongest differentiator; the human-only approval gate enforced in the engine is the inverse of the autonomous-negotiation products. Deducted: every component exists somewhere (the claim is the assembly, not a first-ever); no real users, so impact is demonstrated, not measured. |
| **Presentation** | **7** | A real demo video, 48 screenshots, a QA report, and an evidence package; the live app now has a fresh dark UI with every text/background pair at WCAG AA (≥ 4.5:1, computed in Node); the README, setup guide, and architecture docs are current and honest about limitations. Deducted: the demo video now shows the **old light UI** (recorded 2026-11-06, before the dark redesign) plus **five** documented stale elements ($0.19 figure, first-stack room timelines, predates Submit for approval, old light UI, predates the draft handoff) — see §4. The video is deferred by the user until after the §27–§36 phase. |
| **Total** | **33 / 40** | **≈ 41 / 50** on the scale used in `docs/positioning.md` (see §2). |

## 2. The working (so the number can be checked)

The /50 scale in `docs/positioning.md` splits the same evidence
across five criteria. With the P0/P1 work applied:

| Positioning criterion (10 each) | Score | Change since 2026-11-06 |
|---|---|---|
| Problem & business value | 7 | Unchanged — real problem, quantified benefit ($57.60/mo saved in the demo), but the supplier is fictional and there are still no real users |
| Switch centrality & collaboration | 9 | **Up from 8** — the live-model reply in the room is now demonstrated (Cloudflare Workers AI, Qwen3, 2026-11-07 ~12:15): a genuine model draft + validated reply in `#haggle-dairyco`, 1 second after the question, `mock: false` |
| Technical quality | 10 | Unchanged — session auth, atomic save, proposal versioning, derived strategies, agent runtime + LLM abstraction, §31 security (hash chain, stable claim ids, revocation, XSS probe PASS, axe in suite), live Switch test, 379 tests (378 pass, 1 skipped), audit bug-fix round, conversational replies (25 tests + live verification), live-model shape fixes (exact-enum prompt, `normalizeStructuredOutput`, 3 new llm tests) |
| Novelty & differentiation | 7 | Unchanged — no new research in this window |
| Demo, evidence & presentation | 7 | **Down from 8** — the video is staler (it now also shows the pre-redesign UI and predates the draft handoff and the conversational reply); the live UI improved but the video is the artifact judges watch |
| **Total** | **40 / 50** | The four-criterion conversion (33/40 = 82.5%) is 41/50. The two workings agree within a point. **Headline: ~41/50.** |

The honest range is **40–41/50**. It is not 45+, and it is not
95+/100. The gap to 45+ is evidence, not code: a current demo video
and real users. The live model demonstration is now done (Cloudflare
Workers AI, verified 2026-11-07 ~12:15).

## 3. The single easiest 60-second proof for a judge

**The conversational reply in the real room, then the GAP-2
Submit-for-approval journey.** The reply is the proof a dashboard
cannot give: the agent works in the shared chat, as a teammate.

In `#haggle-dairyco` (about 60 seconds — the live model is now
configured, and the reply below is the verified live one,
2026-11-07 ~12:15):

1. A human posts: `@converge-facilitator What is the financial impact
   of the DairyCo price rise, and which counter should we offer?`
2. The facilitator replies in the room — under its own identity, in
   about a second — with the analysis and the deterministic engine
   figures (food cost 28.63% → 31.62%, +$76.80/mo, max sustainable
   $0.1967, counter $0.18), labelled informational, not a decision.
3. A teammate challenges it in the room; the facilitator answers
   with additional investigation and the engine's numbers.
4. The owner opens the case → **Negotiation** tab, where the same
   figures appear, selects the counter strategy, and clicks **"Submit
   for approval"** — the exact terms appear above the button:
   **"$0.18 / fl oz for 6 weeks, in writing"**.
5. The approval modal shows the same terms plus the engine-computed
   impact. Approve as the owner. The case moves to **COMPLETED** and
   the **Audit** tab shows the approval with the proposal id, version,
   and content hash.

What this proves that a screenshot cannot: the agent participates in
the shared chat (it answers, it is challenged, it answers again with
real numbers), the strategies are computed (not typed), the terms the
owner signs are the terms the engine derived, and the approval is a
recorded, hash-bound decision — not a button that changes a label.

A faster API check, if the judge prefers one: `POST /api/cases/:id/
transition` with no session token returns **401**; with a token on
an invalid transition returns **400**. Both were verified live on
the production app (see `docs/IMPLEMENTATION-LOG.md`).

## 4. The demo video — what is stale, stated plainly

`submission/demo/converge-demo.mp4` (2:28, recorded 2026-11-06)
shows the real app, the real first-stack rooms, and the real HAG-014
approval. It is **not current**. The stale elements:

1. The HAG-014 overview shows a stale "Pending: $0.19/fl oz for 6
   weeks" line above the APPROVED stamp (recorded before the fix;
   the live app no longer shows it).
2. The room timelines shown are the first stack's (lost to the VM
   replacement; current rooms carry a record note).
3. The counter figure shown ($0.19) is now $0.18 — the engine
   derives strategy prices from the case input (P0, 2026-11-07).
4. **New in this window:** the video shows the old **light**
   Direction B UI. The live app is now the dark charcoal/cyan/lime
   redesign. The video predates the redesign.
5. It predates the Submit for approval flow (GAP-2) — the live app
   has it, the video does not show it.
6. **New in this window:** it predates the conversational reply —
   the video shows a dashboard walkthrough, not the facilitator
   answering in the room as a teammate. The reworked script
   (`submission/demo-script.md`) is now chat-first.

Recommendation (unchanged from `docs/positioning.md` §7):
**retain the original recording; do not re-record, do not edit it.**
Re-recording is not feasible without losing the burned-in section
titles (the burn-in step was never scripted). Editing a recording
to hide a stale frame would be worse than disclosing it. The
staleness is disclosed in writing (`submission/demo-script.md` and
README §10). The original must not be destroyed.

**Feasibility re-checked 2026-11-07 ~12:15 (video deferred until
the release gate is met):** a re-record of the old sequence is
technically feasible — the capture script (`scripts/capture-demo.py`)
still works with the current app (the legacy `?case=` URLs are still
supported), ffmpeg is available, and the title treatment (a dark bar
with white bold text) can be re-created approximately with
`drawtext`, though not exactly (the original font, colour, and timing
were never recorded). The video **as spec'd** can now be filmed for
the model parts: the live model is configured (Cloudflare Workers
AI, Qwen3) and a genuine model reply in the room was verified
2026-11-07 ~12:15 (event `sw_92703c30…`, live drawer 28 messages).
The release gate is now **MET except for the real-teammate
requirement** — Rubai must still invite at least one real teammate
(only the `user` account exists on this Mattermost); a teammate
challenging the agent in the room (Scene 5) cannot be filmed with
one human alone. No video file was recorded, rendered, or exported
in this window, per the user's instruction.

## 5. What would move the score

| Improvement | Moves | Why |
|---|---|---|
| Real users running the HAGGLE flow (5–8 participants, documented) | Creativity & impact 7 → 9; Problem 7 → 8 | The single biggest gap. It turns a demonstrated benefit into a measured one, and it is the only thing that addresses "where are the real users?" |
| ~~A provider key (Cloudflare Workers AI — the user provides it) + a demonstrated live-model reply in a room~~ — **DONE 2026-11-07 ~12:15** | ~~Use of Switch 8 → 9~~ | The live model is configured (Cloudflare Workers AI, Qwen3) and a genuine model reply in `#haggle-dairyco` was verified live (draft `4a8bbe65…`, `mock: false`; reply event `sw_92703c30…`, 1 second after the question). Use of Switch is now 9. |
| A re-recorded demo video (current UI, chat-first, conversational reply + Submit for approval shown) | Presentation 7 → 9 | Removes all six stale elements at once |
| Independent evaluation of the agent's drafts | Technical 10 stays; Creativity 7 → 8 | Third-party evidence the drafts are useful, not just well-formed |

**Done in this window (no longer on the list):** the live XSS probe
and axe-core in the suite — both now pass, and Technical moved
9 → 10 on that evidence. **The live model is now demonstrated**
(Cloudflare Workers AI, Qwen3, verified 2026-11-07 ~12:15) — Use of
Switch moved 8 → 9 on that evidence.

**Credible path to 45/50:** re-recorded video (+2) + real users (+2
on the four-criterion total) = 41 + 4 = 45. The live model step (+1)
is done. Each remaining step is a day of work or a real participant
— not a feature. Without the video and the users, the honest ceiling
is ~41/50.

## 6. What would NOT move the score

- More features, a bigger workflow, or a larger claim. The product
  is complete enough for the demo; the gap is evidence.
- Another UI redesign. The dark redesign is done; a second reskin
  would add staleness, not score.
- Claiming the mock provider as a live model, or staging a
  "user" — either would be fabrication and would destroy the
  submission's credibility if a judge checked.
- Re-recording the video by editing out the stale frames. Disclosure
  is the honest handling.

## 7. What a judge could challenge, and the answer

- *"Is this three apps stapled together?"* — No: one engine, six
  stages, the same approval and audit pattern in every workflow.
  COURT and CORRECTION prove the engine generalises; HAGGLE is the
  business product.
- *"PlateSense already does the maths."* — Yes, for $59/mo. It never
  negotiates, never talks to the supplier, and never files an agreed
  price. The maths is the brief; the negotiation and the approval
  are the product.
- *"Pactum already negotiates."* — At enterprise scale,
  autonomously, explicitly removing the human buyer. HAGGLE is the
  inverse: deterministic, small-restaurant, human-only approval.
- *"Where are the real users?"* — There are none yet. Stated in the
  README and the checklist. It is the biggest remaining gap.
- *"Is the agent real, or is it a script?"* — The runtime is real
  code with a real WebSocket connection and a real tool registry,
  and the process is running (restarted 2026-11-07 ~12:05 Dhaka
  after the eleventh VM replacement, PID 9897, live model
  configured, `mock: false`; WebSocket connected, protocol 9,
  heartbeat 2s). The draft handoff is verified live: a real human
  request in `#haggle-dairyco` produced a draft in the inbox, a
  human reviewed and shared it, and the shared draft appeared in
  the real room. A live model is now configured (Cloudflare Workers
  AI, `@cf/qwen/qwen3-30b-a3b-fp8`) and demonstrated: a real human
  question in `#haggle-dairyco` produced a genuine model draft
  (`4a8bbe65…`, `mock: false`) and a validated reply in the real
  room 1 second later (event `sw_92703c30…`, live drawer 28
  messages, 2026-11-07 ~12:15). The deterministic engine — the part
  that computes money — is fully real and fully tested.
- *"Is Switch really necessary?"* — Yes for the multi-party work.
  The stub proves it: without the room there is no shared decision,
  only a single-user calculator.
- *"Why does the video show a different UI?"* — Because the video
  was recorded before the dark redesign. It is disclosed in writing
  (demo script §9, README §10, §4 above). The live app is the
  current UI.
- *"Why is the approval $0.19 in the record but $0.18 in the app?"*
  — The $0.19 approval is a historical record from 2026-11-05; the
  engine now derives the counter as $0.18 from the same mandate.
  The record stands as history and was not rewritten. See
  `docs/IMPLEMENTATION-LOG.md`.

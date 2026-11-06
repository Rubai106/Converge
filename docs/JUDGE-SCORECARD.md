# CONVERGE — Judge Scorecard

**Status:** current as of the master-prompt window, 2026-11-07.
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
| **Use of Switch** | **8** | Live switch-core 0.31.0 + Mattermost 11.9.0, real rooms (`#haggle-dairyco`, `#recipe-ragu`, `#episode-osei`), real bridge, two-way delivery verified live; the WebSocket is now the primary agent connection (verified against the actual 0.31.0 server, 2026-11-07 — see `docs/AGENT-RUNTIME.md`); the app reads the room timeline with `read_context` and the drawer is live. Deducted: the agent runtime process is not currently running (the code is complete and tested, the process must be started); the drawer merges the live timeline with app-stored messages; a labelled SIMULATED-STUB fallback exists. |
| **Technical execution** | **9** | Suite **294/294, 0 fail** (verified in this session), `npm run check` clean; zero runtime npm dependencies; deterministic engine single-sourced and heavily tested; P0 hardening real and tested — session-token auth on every POST (401 without a token), atomic save with backup rotation, proposal versioning with content-hash binding + 7-day expiry + idempotent re-approve, derived strategy prices, WITHDRAWN/EXPIRED states; the agent runtime, LLM abstraction, and tool registry are built and tested (58 tests) with the no-approval invariant enforced by construction. Deducted: no live model call (no provider key configured), no live XSS probe, axe-core not in the suite, no per-user auth (single demo identity, loopback-only). |
| **Creativity and impact** | **7** | The combination is genuinely unoccupied in our research — no single product does any of the three complete workflows end to end (two research passes, `docs/competitor-validation.md`); COURT's mechanism (version conflict → blind coded test → gated tally → canonical recipe with dissent preserved) is the strongest differentiator; the human-only approval gate enforced in the engine is the inverse of the autonomous-negotiation products. Deducted: every component exists somewhere (the claim is the assembly, not a first-ever); no real users, so impact is demonstrated, not measured. |
| **Presentation** | **7** | A real demo video, 48 screenshots, a QA report, and an evidence package; the live app now has a fresh dark UI with every text/background pair at WCAG AA (≥ 4.5:1, computed in Node); the README, setup guide, and architecture docs are current and honest about limitations. Deducted: the demo video now shows the **old light UI** (recorded 2026-11-06, before the dark redesign) plus three documented stale elements ($0.19 figure, first-stack room timelines, predates Submit for approval) — see §4. |
| **Total** | **31 / 40** | **≈ 39 / 50** on the scale used in `docs/positioning.md` (see §2). |

## 2. The working (so the number can be checked)

The /50 scale in `docs/positioning.md` splits the same evidence
across five criteria. With the P0/P1 work applied:

| Positioning criterion (10 each) | Score | Change since 2026-11-06 |
|---|---|---|
| Problem & business value | 7 | Unchanged — real problem, quantified benefit ($57.60/mo saved in the demo), but the supplier is fictional and there are still no real users |
| Switch centrality & collaboration | 8 | Unchanged — the WebSocket is now the primary path and the runtime exists, but the runtime process is not running |
| Technical quality | 9 | **Up from 8** — session auth, atomic save, proposal versioning, derived strategies, agent runtime + LLM abstraction, 294 tests |
| Novelty & differentiation | 7 | Unchanged — no new research in this window |
| Demo, evidence & presentation | 7 | **Down from 8** — the video is staler (it now also shows the pre-redesign UI); the live UI improved but the video is the artifact judges watch |
| **Total** | **38 / 50** | The four-criterion conversion (31/40 = 77.5%) is 38.75/50. The two workings agree within a point. **Headline: ~39/50.** |

The honest range is **38–39/50**. It is not 45+, and it is not
95+/100. The gap to 45+ is evidence, not code: real users, a live
model demonstration, and a current demo video.

## 3. The single easiest 60-second proof for a judge

**The GAP-2 Submit-for-approval journey on a fresh HAGGLE case.**
It proves the engine, the approval gate, and the audit trail in one
flow — and it is the flow a judge can do with no setup beyond the
running app.

Starting from an open fresh HAGGLE case (about 60 seconds; creating
the case through the 5-step wizard adds ~2 minutes):

1. Open the case → **Negotiation** tab. Six strategies are priced
   from the case's own numbers — the counter is derived from the
   mandate, not hardcoded.
2. Select the counter strategy → the exact terms appear above the
   button: e.g. **"$0.18 / fl oz for 6 weeks, in writing"** for the
   seed numbers. Click **"Submit for approval"**.
3. The approval modal shows the same terms plus the engine-computed
   impact. Approve as the owner.
4. The case moves to **COMPLETED** and the **Audit** tab shows the
   approval with the proposal id, version, and content hash — the
   record of what was agreed, bound to what was proposed.

What this proves that a screenshot cannot: the strategies are
computed (not typed), the terms the owner signs are the terms the
engine derived, and the approval is a recorded, hash-bound decision
— not a button that changes a label.

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

Recommendation (unchanged from `docs/positioning.md` §7):
**retain the original recording; do not re-record, do not edit it.**
Re-recording is not feasible without losing the burned-in section
titles (the burn-in step was never scripted). Editing a recording
to hide a stale frame would be worse than disclosing it. The
staleness is disclosed in writing (`submission/demo-script.md` and
README §10). The original must not be destroyed.

## 5. What would move the score

| Improvement | Moves | Why |
|---|---|---|
| Real users running the HAGGLE flow (5–8 participants, documented) | Creativity & impact 7 → 9; Problem 7 → 8 | The single biggest gap. It turns a demonstrated benefit into a measured one, and it is the only thing that addresses "where are the real users?" |
| A provider key + the runtime process running, with a demonstrated draft in a room | Use of Switch 8 → 9; Technical 9 → 10 | The agent would be live, not just built. The draft must be a real model output, never a mock |
| A re-recorded demo video (current UI, Submit for approval shown) | Presentation 7 → 9 | Removes all five stale elements at once |
| A live XSS probe + axe-core in the suite | Technical 9 → 10 (at the margin) | Closes the two named test gaps |
| Independent evaluation of the agent's drafts | Technical 9 → 10; Creativity 7 → 8 | Third-party evidence the drafts are useful, not just well-formed |

**Credible path to 45/50:** real users (+3) + live agent
demonstrated (+2) + re-recorded video (+2) = 38 + 7 = 45. Each
step is a day of work or a real participant, not a feature.

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
  code with a real WebSocket connection and a real tool registry
  (58 tests), but it needs a provider key to draft with a live
  model, and the process is not currently running. The drafts it
  would produce are labelled; the mock provider is never presented
  as live AI. The deterministic engine — the part that computes
  money — is fully real and fully tested.
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

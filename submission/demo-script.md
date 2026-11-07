# CONVERGE — Demo video script (chat-first, < 3 minutes)

**Status:** reworked 2026-11-07 for the Flip the Switch brief change.
The demo must show the AI agent working in a REAL team chat with human
teammates. A dashboard walkthrough, or a human sharing an AI-generated
draft from an inbox, is NOT sufficient as the primary demonstration.
This script is chat-first: Mattermost dominates the video. The
CONVERGE dashboard appears only for calculations, evidence, proposals,
and approvals.

**Format:** target **2 minutes 48 seconds**, absolute maximum
**2 minutes 59 seconds** (verify runtime < 180 seconds);
**1920 × 1080, 16:9, 30 FPS**; professional natural AI narration in
English (neutral international English, warm/confident, clear
pronunciation, natural conversational pacing, no exaggerated
commercial voice, no dramatic artificial pauses); narration as a
separate audio track; **synchronized English subtitles**; subtle
instrumental royalty-free/appropriately-licensed background music;
narration clearly audible.

**What is filmed:** the Track 01 rehearsal
(`submission/demo-track01-haggle.md`) is the main story; the Track 02
rehearsal (`submission/demo-track02-court.md`) is the closing
sequence. All footage is real: the real Mattermost rooms through the
real Switch bridge, real human messages, genuine live-model agent
replies under the facilitator's identity, and the real app. Nothing
is staged beyond the rehearsed human lines — and the agent's replies
are never scripted: the video uses the replies the live model
actually produced in the rehearsal.

**Deliverables:** `submission/demo/converge-demo-final.mp4`, plus
`submission/demo-script.md` (this file), `submission/demo-subtitles.srt`,
and `submission/demo-voiceover.wav` or `.mp3`. Keep the original
historical demo video untouched (`submission/demo/converge-demo.mp4`).

## Release gate — DO NOT RECORD until all of these hold

- [ ] Real model provider configured (Cloudflare Workers AI token +
      Account ID; runtime restarted with the four `CONVERGE_LLM_*`
      variables; startup log shows the live provider, not the mock).
- [ ] A genuine agent response verified in the actual Mattermost room
      (live-model reply, labelled, with the engine-figures line,
      under the facilitator's identity).
- [ ] Agent responses appear in the actual room (not the draft inbox,
      not a screenshot).
- [ ] Two-way human-agent conversation works (challenge → second
      reply, one reply per source message, no duplicates).
- [ ] HAGGLE workflow verified (fresh case → strategies → Submit for
      approval → human approval → COMPLETED, audit record).
- [ ] COURT workflow verified (tally complete → canonical version
      adopted by a human → dissent preserved).
- [ ] Human approval remains protected (no session token in the
      runtime, no approve tool, approval still 401s without a human
      session).
- [ ] Mandatory tests pass (suite 376: 375 pass, 1 skipped;
      `npm run check` clean).
- [ ] At least one real teammate invited and posting in the room.

**Never present the mock-labelled reply as live AI.** The reply
mechanism was verified live with the labelled mock provider (event
`sw_e4e5c560`, ref `89be10b7`) — that proves the mechanism, not a live
model. Any footage of a MOCK-labelled reply must never appear in this
video as a live-model response.

## Scene 1 — The problem (0:00–0:15)

**Visual:** the Mattermost room, already open. A human message
appears: a teammate reporting the DairyCo cream rise. The facilitator
is visible in the room member list. No dashboard yet.
**VO:** "Independent restaurants face supplier price increases that
can quietly erode their margins. But spreadsheets cannot negotiate,
and group chats rarely turn disagreements into accountable decisions.
Meet CONVERGE: a collaborative AI decision-resolution platform."
**What it proves:** the demo lives in the team chat from the first
frame.

## Scene 2 — HAGGLE: the business problem (0:15–0:35)

**Visual:** a brief cut to the CONVERGE dashboard — the fresh HAGGLE
case (created live via the wizard before recording, DairyCo seed
numbers), the deterministic analysis. Show the figures, then cut back
to the room.
**VO:** "With HAGGLE, restaurant owners can investigate supplier
price changes, understand their financial consequences, and compare
negotiation strategies before making a commitment. Every calculation
comes from CONVERGE's deterministic financial engine, not invented
AI-generated numbers."
**Numbers on screen (engine-computed, verify against the app before
recording):** cream $0.16 → $0.24/fl oz (+50%); +$0.48/serving; food
cost 28.63% → 31.62%; +$76.80/month (+$921.60/year); max sustainable
$0.1967 at a 30% target.

## Scene 3 — Real human and AI collaboration (0:35–1:15)

**Visual:** the Mattermost room, full screen, for the whole scene.
The actual exchange, as rehearsed (Track 01, Steps 1–5):
1. Human A: the DairyCo rise, $0.16 → $0.24, "our Alfredo margin is
   going to take a hit."
2. Human B tags the facilitator: "@converge-facilitator Can you work
   out what this does to our Alfredo and what we should say back to
   DairyCo? Don't agree anything with them."
3. The facilitator replies in the room, under its own identity —
   **[real footage: the genuine live-model reply as recorded]**.
   The label, the engine-figures line, and the footer must be
   legible on screen: `[CONVERGE facilitator - informational
   analysis, not a decision]` … `Engine figures (deterministic, not
   model-computed): food cost 28.63% -> 31.62%; +$76.80/mo
   (+$921.60/yr); max sustainable $0.1967/unit.` … `Ref <refId> -
   Final decisions stay with a human; this analysis does not approve
   or commit anything.`
4. Human B challenges it: "You recommend the $0.18 counter — but
   what if DairyCo refuses? And is $0.18 actually inside our 30%
   food-cost target?"
5. The facilitator replies again — **[real footage: the second
   genuine reply as recorded]** — with the $0.18 food cost (29.38%,
   inside target) and the priced alternatives if DairyCo refuses.
**VO:** "Here, the team starts an investigation directly inside
Mattermost. Switch delivers that real human request to the running
CONVERGE facilitator. The model retrieves the relevant case context,
uses controlled application tools, examines the financial results and
prepares an evidence-aware recommendation — and posts it in the room,
under its own identity. The numbers it quotes are checked against the
deterministic engine before anything is posted. This is an actual
human–AI collaboration, not a prerecorded chatbot response. And when
a teammate pushes back, the facilitator answers again — with more
investigation, not more assertion."
**What it proves:** the brief's central requirement. Two humans, one
agent, one room, two genuine replies.

## Scene 4 — Financial intelligence (1:15–1:40)

**Visual:** back to CONVERGE, Negotiation tab only. The cost
comparison, food-cost % and gross margin, monthly and annual impact,
all six strategies, the recommended counteroffer highlighted.
**VO:** "The owner can now understand the real impact: ingredient
costs, food-cost percentage, gross margin and the additional monthly
and annual expense. CONVERGE compares different negotiation
strategies against the owner's mandate, identifying financial
trade-offs and operational risks. For this demonstration scenario,
the engine derives a counteroffer of eighteen cents per fluid ounce
for six weeks, in writing." — **the last sentence may be used ONLY
if the fresh demonstration case displays those exact verified terms.**
**Numbers on screen (verify against the app):** counter $0.18/fl oz
for 6 weeks; food cost at $0.18 is 29.38% (inside the 30% target);
saves $57.60/month versus $0.24. The historical HAG-014 approval
($0.19) is a different record and must not be shown as this case's
counter.

## Scene 5 — Human review and proposal approval (1:40–2:10)

**Visual:** the room briefly (the facilitator's reply, already seen),
then the app: the owner opens the fresh case, selects the counter
strategy, the exact terms appear above the button labelled **Submit
for approval**; the approval modal shows the same terms plus the
proposal id, version, and content hash; the owner approves under his
own human session. Show the case moving to COMPLETED.
**VO:** "The facilitator does not make the final decision. The owner
reviews the recommendation, challenges it where necessary, and
chooses whether to share it with the team. When ready, the owner
submits the exact proposal for approval. The final approval belongs
exclusively to an authorized human. The AI cannot approve its own
recommendation — it holds no session token and no approval tool."
**What it proves:** sharing a reply is not approval; the approval is
a separate, human-only, hash-bound step.

## Scene 6 — Accountable resolution (2:10–2:30)

**Visual:** the Audit tab. The approval record: proposal id, version,
content hash, approver, timestamp. The completed case status. The
agreed price filed for re-check next month.
**VO:** "Every consequential decision is recorded. The proposal
version, approved terms, human authorization and decision history
remain traceable. The result is more than a conversation. It is an
accountable resolution."

## Scene 7 — The broader platform and closing (2:30–2:48)

**Visual:** the `#recipe-ragu` room — the facilitator's genuine reply
in the COURT rehearsal (Track 02): the blind-test summary, the tally
(S1 4.67, S2 4.33, S3 3.33), the disagreement analysis, under the
facilitator's identity. Then the CONVERGE logo and the end card.
**VO:** "The same decision engine extends to collaborative recipe
decisions and evidence-based editorial corrections. CONVERGE doesn't
replace human judgment. It makes better-supported decisions possible,
together."
**End card:** CONVERGE — *From disagreement to accountable
decisions.* — "Switch-powered collaboration. Human-controlled
outcomes."

## Editing requirements

- Real application and chat footage only; avoid unnecessary zooms;
  highlight important metrics without obscuring the interface; subtle
  transitions; deliberate cursor movement; avoid lengthy loading
  screens.
- **Do not cut away from failed operations to imply success; do not
  insert fabricated agent responses; do not use synthetic
  testimonials; do not use unverified charts or statistics.**
- The Mattermost room must stay legible: the facilitator's identity,
  the human teammates' names, and the reply text (label,
  engine-figures line, footer) must be readable at 1080p. If a reply
  is too long to read on screen, show it in two shots — never
  retype it, never paraphrase it as a caption.
- Never show a MOCK-labelled reply as a live-model response. If
  rehearsal footage contains a mock reply, it is cut, not relabelled.
- Never show a teammate's personal information (real names beyond
  what the teammate consented to show, phone numbers, personal
  accounts). The teammates consented to appear in the demo; record
  that consent.
- If a take fails (no reply, wrong reply, rejected reply), re-run it
  live and use the good take. Do not edit around a failure to imply
  it worked.

## Final export verification (all 8, before delivering)

1. Watch the complete exported video.
2. Verify the voice matches the footage.
3. Verify subtitle synchronization.
4. Check every number shown against the application — including the
   figures in the room replies (food cost %, monthly/annual extra,
   max sustainable price, the $0.18 counter, the COURT tally means).
5. Check that the approval is genuinely successful (the case is
   COMPLETED in the app with the approval record in the Audit tab).
6. Verify runtime < 180 seconds.
7. Check that no credentials or personal information are visible —
   including in the Mattermost room (no tokens, no passwords, no
   unconsented personal details).
8. Verify the opening and ending are professional.
9. Also verify: the facilitator's identity is legible in every room
   shot; no MOCK-labelled footage appears as a live-model response;
   the two human teammates are real people who consented to appear.

## Reproduce it

`npm test` (351: 350 pass, 1 skipped) → `npm start` (with the real
Switch env — see `.env.example`) → runtime with the four
`CONVERGE_LLM_*` variables → http://localhost:3100 → follow
`submission/demo-track01-haggle.md` (Track 01) and
`submission/demo-track02-court.md` (Track 02).

---

## Appendix — Original script (historical, preserved)

The script below is the original demo script (live run, ~2:30, HAGGLE
flagship), written for the video recorded 2026-11-05/06
(`submission/demo/converge-demo.mp4`, 147.8s, 1440×900, silent
scripted walkthrough). It is preserved here because it is the record
of what the old video shows — including its stale elements (the
$0.19 figure, the first-stack room timelines, the "Pending" line, the
old light UI, predating Submit for approval and the draft handoff).
The old video must not be destroyed and must not be presented as the
current app. The new chat-first script above supersedes this one for
any new recording.

---

# CONVERGE — Demo script (live run, ~2:30, HAGGLE flagship)

Recorded against the **real Switch server** (switch-core 0.31.0 + Mattermost
11.9.0 on this machine, REAL-SWITCH mode) — say so on camera. All demo data
is fictional. The supplier in the demo is simulated and labelled as such;
the owner approval in the demo is a real approval posted in the real
Mattermost room and recorded by CONVERGE.

## 0:00–0:20 — The problem
Open with the positioning line, on camera: "Most collaboration tools help people communicate. CONVERGE helps them reach an accountable decision." Then the problem: "Your supplier just raised cream by 50%. What does that do to your menu — and what do you say back?" Show the dashboard: 3 cases, HAG-014 completed. Name the engine once: Intake → Evidence → Conflict → Proposal → Human approval → Audited resolution — the same six stages in every workflow.

## 0:20–1:05 — HAGGLE (HAG-014)
1. Open HAG-014 — DairyCo cream $0.16 → $0.24/fl oz.
2. Show the deterministic analysis: +$0.48/serving, food cost 28.6% →
   31.6%, +$76.80/month, max sustainable price $0.20 at a 30% target.
   Point out the assumptions line — gross margin shown separately from
   net profit.
3. Show the six priced strategies. The $0.19 counter-offer: saves
   $48/month vs $0.24, stays under the 30% target.

## 1:05–1:35 — The real room + the approval
4. Open the Switch room `#haggle-dairyco` — this is a real Mattermost
   channel through the Switch bridge (not a stub). Show the agent's
   analysis, the owner's approval ("Approved: accept the DairyCo counter
   — $0.19/fl oz for 6 weeks"), and the agent's confirmation.
5. Show the Audit tab: who approved, when, on what terms —
   AWAITING_APPROVAL → APPROVED → COMPLETED. The agreed price is filed
   and will be re-checked next month.

## 1:35–2:10 — COURT + CORRECTION (20s each)
Say the framing line first: "Same engine, a completely different kind of disagreement — that is the point. HAGGLE is the business product; these two prove the engine generalises."
6. COURT (CRT-007): ragù conflict table — salt/fat/simmer conflict,
   tomato agrees. Blind test-cook, independent ratings, disagreement
   flagged, canonical recipe with the dissent preserved.
7. CORRECTION (COR-003): 3 factual claims from the transcript, opinion
   separated. Guest corrects "led" → "co-led" and "Professor" →
   "Senior Lecturer" in the room; host approves the errata.

## 2:10–2:30 — Why Switch, why CONVERGE
8. "Without Switch there is no shared room — no multi-party work, no
   approval in chat, no audit trail. The engine is shared; the maths is
   deterministic; the human decides." Add the return line: "And the record
   accrues — the agreed price is filed and re-checked next month." Show the
   README limitations slide (simulated supplier, family panel is deliberation
   not statistics). If asked about novelty, use the careful phrasing: "Our
   research did not identify a single product combining the complete
   workflow" — never "no such product exists anywhere".

## Recording notes
- The video is `submission/demo/converge-demo.mp4` (147.8s, 1440×900,
  H.264, 3.2 MB; source webm alongside it) — a scripted walkthrough of
  the live app (Playwright), silent, with section titles burned in.
  It shows the real app, the real rooms, and the real approval record —
  nothing staged beyond the navigation itself.
- HAG-014 is COMPLETED in the recorded run because the approval already
  happened in the real room. That is the honest record; do not re-stage
  the approval live.
- **Staleness note (2026-11-06 night hardening):** the video was recorded
  on the first Switch stack, before two changes. (1) It was recorded
  before the stale-`pendingApproval` fix, so the HAG-014 overview shows a
  "Pending: $0.19/fl oz for 6 weeks" line above the APPROVED stamp on the
  completed case; the live app no longer shows that line
  (`pendingApproval` is cleared on approval). (2) The room timelines it
  shows are the first stack's — the VM was replaced later that night and
  the rooms were recreated; the current rooms carry a record note instead
  of the original approval post. Since the recording there have been
  further changes the video does not show: the remediation pass (53/54
  audit findings fixed), NEW-1 deep links, the GAP-2 **Submit for
  approval** flow, the third rebuild with durable Postgres, and two
  recoveries from it (fourth VM replacement ~16:29, fifth ~18:28–18:31
  Dhaka) that preserved the current rooms. The video was NOT re-recorded:
  the section-title burn-in step is not scripted, and re-recording
  without the titles would be a worse artefact than the two stale
  frames. The recommendation (retain the original, disclose in writing)
  is recorded in `docs/positioning.md` §7; the original must not be
  destroyed.
- Step 4 above describes the first stack's room. In the current room the
  owner's original approval post is replaced by a record note stating the
  approval happened in the original room on 2026-11-06 and was preserved
  in CONVERGE's audit trail (see `docs/switch-live-integration.md`). The
  current rooms are the third-rebuild rooms (`#haggle-dairyco`
  `177e6354-…`, `#recipe-ragu` `478f26a8-…`, `#episode-osei`
  `04da8311-…`); they survived the fourth and fifth VM replacements
  intact and were verified live 2026-11-06 ~18:36 Dhaka (two-way
  delivery, live drawer, HAG-014 COMPLETED/P2).

## Reproduce it
`npm test` (161/161) → `npm start` (with the real Switch env — see
`.env.example`) → http://localhost:3100 → open HAG-014 → open the room →
see the approval in the Audit tab.

## Live-run note (2026-11-06, current build)
HAG-014 is already COMPLETED, so the Submit for approval flow (GAP-2) is
shown on a fresh HAGGLE case, not on HAG-014: create a case with the
wizard (dashboard → New case), open it in DISCUSSION, select a strategy
on the Negotiation tab — its exact terms appear above a button labelled
**Submit for approval** — submit, and the case moves to PROPOSAL then
AWAITING_APPROVAL with the canonical proposal id and terms; the approval
modal shows the same terms, and a human approves. The video predates this
flow and does not show it.

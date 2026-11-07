# Track 02 — Best Personal or Creative Workflow: COURT demo plan

**Track:** Flip the Switch, Track 02 — Best Personal or Creative
Workflow ($2,000).
**Demonstration:** COURT — blind recipe adjudication (collaborative
recipe disagreement resolution).
**Status:** the mechanism is proven; the live-model footage is BLOCKED
on Rubai's Cloudflare Workers AI token + Account ID. Do not record the
live-model parts until the token is configured and a genuine agent
response has been verified in the room.

## What this demo must prove

The same brief requirement as Track 01, applied to a creative
disagreement: the agent works in a REAL team chat with human
teammates. A dashboard walkthrough is not sufficient. This plan shows,
in one real Mattermost room:

1. A human teammate surfacing a recipe disagreement.
2. Another human tagging the CONVERGE facilitator.
3. The real agent receiving and investigating the request.
4. A genuine model-generated response appearing under the agent
   identity, in the room — the blind-test summary, the tally, and the
   disagreement analysis.
5. A teammate challenging the result.
6. The agent responding with the dissent preserved and the evidence
   re-stated.
7. The owner adopting the canonical version — a human approval,
   separate and secure.

COURT is the proof the decision engine generalises beyond money: the
same stages (intake → evidence → conflict → proposal → human approval
→ audited resolution), the same approval boundary, a completely
different kind of disagreement.

## The case and the room

- **Case CRT-007, room `#recipe-ragu`
  (`478f26a8-a843-480e-9707-78c142000341`).** Nonna's ragù, three
  versions in conflict. No fresh case is needed: the blind test is
  already complete and the tally is recorded.
- **The three versions:**
  - **S1 — Nonna (Card):** salt "a pinch", fat lard, simmer 3 hours.
  - **S2 — Auntie:** salt 1 tablespoon, fat butter, simmer 3 hours.
  - **S3 — Cousin:** salt none, fat butter, simmer 90 minutes.
  - The versions conflict on salt, fat, and simmer time. Tomato
    agrees across all three.
- **The blind test (already run, server-held):** 9 blind ratings,
  sample codes withheld from raters until the tally. Means: **S1
  4.67, S2 4.33, S3 3.33. Nonna (S1) leads.** The tally and the
  disagreement analysis come from the server-held ratings through the
  `draft_court_summary` tool — the model summarises recorded
  evidence; it does not invent ratings.
- **The canonical version is NOT yet adopted.** Adopting it is the
  human approval at the end of this demo. The dissent is preserved
  with the canonical recipe — the point of COURT is
  canonical-with-dissent, not unanimity.

## How COURT replies differ from HAGGLE replies

There are no money figures in COURT, so the reply validation works
differently in one respect and identically in all others:

- **Identical:** the label (`[CONVERGE facilitator - informational
  analysis, not a decision]`), the footer (`Ref <refId> - Final
  decisions stay with a human; this analysis does not approve or
  commit anything.`), the forbidden-content rules (no approval /
  commitment / decision language, no credential requests, no claiming
  to be human, no external contact), the ASCII-only rule, the 1500
  character cap, and one reply per source message (idempotency via
  `data/replies.json`).
- **Different:** there is no engine-figures money line — the reply
  builder only appends that line when a HAGGLE analysis exists. The
  numbers in a COURT reply are the tally means (4.67 / 4.33 / 3.33)
  and the rating count (9), which come from the server-held tally,
  not from the model. A reply claiming a rating that is not in the
  tally would be an invented claim; the draft is built from the
  tool output, so the numbers it can quote are the recorded ones.
- **What the agent must never do here:** adopt a canonical version,
  declare a winner as a decision, or discard the dissent. It
  summarises the evidence and recommends; the owner adopts.

## Roles — real people only

| Role | Who | Notes |
|---|---|---|
| Human A — the stuck cook | A real teammate Rubai invites to Mattermost | Surfaces the disagreement in the room. |
| Human B — the challenger | A second real teammate (or Rubai, if only one teammate can be invited — see Teammates below) | Tags the facilitator, then challenges the result. |
| Owner | Rubai | Adopts the canonical version in the app, under his own human session. |
| Facilitator | The CONVERGE agent (`converge-facilitator`) | Replies in the room under its own identity. Never adopts, never decides. |

**Teammates — read this first.** The only human Mattermost account on
this deployment is `user` (Rubai). There are NO other human teammates
yet. **Rubai must invite at least one real teammate** to the
Mattermost rooms before this demo can be rehearsed as written.
Do NOT create fake accounts, do NOT stage a second person, do NOT
fabricate conversation screenshots. If only one teammate can be
invited, Human A and Human B are that teammate and Rubai (owner).
If NO teammate can be invited in time, the demo shows Rubai + the
facilitator only, and that does NOT fully meet the brief — say so in
the submission rather than faking a teammate. (The same teammate
invited for Track 01 can play these roles; the two plans share one
invite.)

## Setup (do this before any rehearsal)

1. **Production up.** The Switch stack, the app on :3100, and the
   runtime must all be running. Verify the app loads and the
   `#recipe-ragu` room drawer shows the case.
2. **Confirm the case state.** Open CRT-007 in the app: the tally
   must be complete (9 ratings, means S1 4.67 / S2 4.33 / S3 3.33)
   and no canonical version adopted yet. If a canonical version is
   already adopted, this demo cannot re-adopt it — use a fresh COURT
   case instead (wizard, three conflicting versions, blind ratings
   first) and record its room id.
3. **Invite the teammate(s).** In Mattermost: invite the teammate
   account and add them to `#recipe-ragu`. Confirm they can post.
4. **Routing check (no provider — posts nothing).** With the runtime
   running and NO provider configured, have Human A post a test
   @-mention in `#recipe-ragu`. Check the runtime log: the message
   must route to CRT-007 and decline with "LIVE MODEL NOT
   CONFIGURED — no draft produced". This proves the facilitator hears
   the room without posting anything into it.
5. **Configure the live model.** Restart the runtime with the four
   `CONVERGE_LLM_*` variables (Cloudflare Workers AI). Confirm the
   startup log shows the live provider, not "LIVE MODEL NOT
   CONFIGURED" and not the mock.
6. **Rehearse once, end to end, before recording.** The rehearsal is
   the real run — the recording uses the rehearsed footage, not a
   second staged take. If anything fails in rehearsal, fix it and
   re-rehearse; do not edit around a failure.

## Rehearsal sequence

The humans read the lines below verbatim. The agent's replies are
NOT scripted — they come from the live model at rehearsal time. What
is specified for each agent turn is what it must do and what it must
contain, not its wording.

### Step 1 — Human A surfaces the disagreement
**Who:** Human A, in `#recipe-ragu`.
**Line (read verbatim):**
> "We're still stuck on the ragù. Nonna's, Auntie's, Cousin's —
> three versions, and the family can't agree which one is the house
> recipe."
**What this proves:** a real human, in a real team chat, surfacing a
creative disagreement. The three versions are the case's own evidence,
not invented.
**Timing:** the room is quiet before this; this message starts the
demo.

### Step 2 — Human B tags the facilitator
**Who:** Human B, in the same room, replying to Human A.
**Line (read verbatim):**
> "@converge-facilitator Can you settle this? Summarise the blind
> test results and tell us which version the ratings actually support
> — and where people disagreed."
**What this proves:** a human teammate deliberately invoking the
agent, asking for evidence rather than an opinion. The @-mention is
what makes Switch route the message to the facilitator.
**Note:** the @-mention is required. A message without it is observed
but not routed.

### Step 3 — The agent investigates and replies in the room
**Who:** the facilitator, under its own identity.
**What it must do:** read the case and the room timeline through its
tools, run the COURT summary (`draft_court_summary` — tally,
conflicts, disagreement analysis from the server-held ratings), and
post a validated informational reply in the room. The reply carries:
- the label `[CONVERGE facilitator - informational analysis, not a
  decision]`;
- the blind-test summary in its own words (three versions, what
  conflicts, what agrees);
- the tally from the recorded ratings: S1 4.67, S2 4.33, S3 3.33
  (9 ratings), Nonna leading;
- where raters disagreed (the disagreement analysis — which versions
  split opinion and on what);
- the footer `Ref <refId> - Final decisions stay with a human; this
  analysis does not approve or commit anything.`
**What this proves:** the central brief requirement, in a creative
workflow — a genuine model-generated response, under the agent's
identity, in the real team chat. The numbers are the recorded tally,
not the model's invention; the reply is validated before posting.
**Timing:** the reply should appear within seconds of the tag. The
video shows it arriving live.

### Step 4 — Human B challenges the result
**Who:** Human B, in the room.
**Line (read verbatim):**
> "Cousin's simmers for 90 minutes instead of three hours — why
> doesn't the time saving count? And what did the people who liked
> it say?"
**What this proves:** the teammate is not a passive audience. The
challenge is a genuine question (not a staged fact): whether a
practical advantage should outweigh the ratings, and what the
dissent actually was. The agent must answer from the recorded
evidence, not assert.
**Note:** do not claim a specific rater preferred Cousin's. The
question asks what the dissent was; the agent's answer states it
from the disagreement analysis.

### Step 5 — The agent responds with the dissent preserved
**Who:** the facilitator, in the room.
**What it must do:** investigate again (re-read the case and the
tally), and post a second validated reply: what the disagreement
analysis actually shows (who diverged and on what), why the time
saving does not change the tally (the ratings are the evidence; time
is a practical factor the owner may weigh), and that the dissent is
preserved with the canonical recipe rather than discarded. Same
label, same footer, new ref id. One reply per source message: the
challenge gets exactly one reply, never a duplicate.
**What this proves:** a two-way human-agent conversation, not a
single Q&A — and the COURT principle itself: canonical-with-dissent.
The agent recommends; it does not adopt.

### Step 6 — The owner adopts the canonical version
**Who:** Rubai, in the CONVERGE app (not in the chat).
**What he does:** opens CRT-007 → Negotiation tab → reviews the
tally and the dissent, then adopts the canonical version (Nonna, S1)
as the house recipe, under his own human session. The case records
the adoption with the dissent preserved.
**What this proves:** the adoption is a human decision. The agent
summarised and recommended; the owner adopts. The dashboard appears
here only to show the tally, the conflicts, and the adoption — the
chat did the collaboration, the app does the decision record.
**Line (Rubai, on camera or voiceover, optional):**
> "The agent laid out the evidence. I chose the recipe."

## What is proven vs what is blocked

| Part | Status | Evidence |
|---|---|---|
| Reply mechanism (validate → post → idempotency → label + footer) | **Proven** — verified live with the labelled mock provider | Real human message in #haggle-dairyco produced a mock reply in the real room (event `sw_e4e5c560`, ref `89be10b7`, 1 second later; no double-post on re-route). Same code path serves COURT. |
| Runtime routing (addressed human message → correct case) | **Proven** — verified live | Real human messages routed to HAG-014 after the addressing-policy fix; the same routing resolves `#recipe-ragu` → CRT-007. |
| COURT tally (S1 4.67 / S2 4.33 / S3 3.33, 9 ratings) | **Proven** — recorded, server-held | Blind ratings in the case store; duplicate rating → 409. |
| Human approval boundary (session token, no approve tool) | **Proven** — tested | 401 without a token; the agent has no session token and no adopt/approve tool. |
| **Live-model replies in the room (the actual demo footage)** | **BLOCKED — needs Rubai's Cloudflare token + Account ID** | No provider key is configured. The mock reply must NEVER be presented as a live model response. |
| **Two real human teammates in the room** | **BLOCKED — needs Rubai to invite at least one real teammate** | Only the `user` account exists on this Mattermost. No fake accounts, no fabricated screenshots. |
| COURT reply in `#recipe-ragu` specifically | **To verify in Setup step 4 + rehearsal** | The mechanism was verified in `#haggle-dairyco`; the COURT room path is the same code but has not had a reply posted in it yet. |

## If the agent does not reply

1. Wait 30 seconds. The model call and validation take a few
   seconds; a missing reply is not instant failure.
2. Check the runtime log. If it says the message was not addressed,
   the @-mention was missing or malformed — Human B re-tags.
3. If the log shows a validation rejection, the draft is in the
   Drafts tab for human review — the reply was correctly refused,
   not lost. Read the rejection reason from the log, have Human B
   re-phrase the request, and tag again once.
4. If the runtime is not running or the provider is not configured,
   stop the rehearsal and fix that first. Do not fake a reply, do
   not paste a draft into the room as if the agent posted it, and do
   not edit around a missing reply in the video.

## Release gate (Track 02)

Do not record until ALL of these hold:

- [ ] Real model provider configured (Cloudflare Workers AI token +
      Account ID, runtime restarted with the four `CONVERGE_LLM_*`
      variables).
- [ ] A genuine agent response verified in `#recipe-ragu`
      (live-model reply, labelled, with the tally and the disagreement
      analysis, under the facilitator's identity).
- [ ] Agent responses appear in the actual Mattermost room (not the
      draft inbox, not a screenshot).
- [ ] Two-way human-agent conversation works (challenge → second
      reply, one reply per source message).
- [ ] COURT workflow verified (tally complete → canonical version
      adopted by a human → dissent preserved in the record).
- [ ] Human approval remains protected (no token in the runtime, no
      adopt/approve tool, adoption still requires a human session).
- [ ] Mandatory tests pass (suite 351: 350 pass, 1 skipped; `npm run
      check` clean).
- [ ] At least one real teammate invited and posting in the room.

## Rehearsal timing

About 10 minutes of human time: setup (5 min), Steps 1–5 in the
room (4 min, mostly waiting on the two agent replies), Step 6 in the
app (1 min). The Track 02 recording uses roughly 60–90 seconds of
it; in the main <3 min video it appears as the closing sequence
(see `submission/demo-script.md`, Scene 7). A standalone Track 02
submission would record this plan in full.

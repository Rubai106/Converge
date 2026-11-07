# Track 01 — Best Business Workflow: HAGGLE demo plan

**Track:** Flip the Switch, Track 01 — Best Business Workflow ($2,000).
**Flagship:** HAGGLE — margin-aware supplier negotiation.
**Status:** the mechanism is proven; the live-model footage is BLOCKED on
Rubai's Cloudflare Workers AI token + Account ID. Do not record the
live-model parts until the token is configured and a genuine agent
response has been verified in the room.

## What this demo must prove

The official brief requires the demo to show the AI agent working in a
REAL team chat with human teammates. A dashboard walkthrough, or a human
sharing an AI-generated draft from an inbox, is not sufficient as the
primary demonstration. This plan shows, in one real Mattermost room:

1. A human teammate identifying a supplier problem.
2. Another human tagging the CONVERGE facilitator.
3. The real agent receiving and investigating the request.
4. A genuine model-generated response appearing under the agent
   identity, in the room.
5. A teammate challenging the recommendation.
6. The agent responding with additional investigation and deterministic
   calculations.
7. The owner reviewing the resulting proposal.
8. The human approval flow, separate and secure — the agent never
   approves anything.

## The case and the room

- **Fresh HAGGLE case**, created live via the wizard with the seed
  demo numbers (see Setup). The demo does NOT re-approve HAG-014.
  HAG-014 is COMPLETED with the historical approval P2, "$0.19/fl oz
  for 6 weeks" (2026-11-05) — that record stands and is never
  rewritten. The fresh case is where the live negotiation and approval
  happen.
- **Seed numbers (so every figure in the demo is known in advance):**
  DairyCo heavy cream $0.16 → $0.24/fl oz (+50%); Alfredo 6 fl oz per
  serving; other ingredients $3.62/serving; menu $16.00; 160 servings
  per month. Engine output: cream/serving $0.96 → $1.44 (+$0.48);
  food cost 28.63% → 31.62%; monthly extra $76.80; annual extra
  $921.60; max sustainable cream price $0.1967 (≈ $0.20) at a 30%
  target; owner mandate target $0.16, max approved $0.20. The engine
  derives the counter as **$0.18/fl oz for 6 weeks, in writing**
  (food cost 29.38% — inside the 30% target; saves $57.60/month
  versus $0.24).
- **Room:** the fresh case's own Mattermost room, created by the
  wizard. Record its room id at setup (see Setup step 3). The
  historical room `#haggle-dairyco`
  (`177e6354-e07f-44eb-b385-8055faf021e6`, HAG-014) is where the reply
  mechanism was verified live with the labelled mock; it is NOT the
  demo room for this plan.

## Roles — real people only

| Role | Who | Notes |
|---|---|---|
| Human A — the spotter | A real teammate Rubai invites to Mattermost | Identifies the supplier problem in the room. |
| Human B — the challenger | A second real teammate (or Rubai, if only one teammate can be invited — see Teammates below) | Tags the facilitator, then challenges the recommendation. |
| Owner | Rubai | Reviews the proposal and approves it in the app, under his own human session. |
| Facilitator | The CONVERGE agent (`converge-facilitator`) | Replies in the room under its own identity. Never approves, never commits, never contacts the supplier. |

**Teammates — read this first.** The only human Mattermost account on
this deployment is `user` (Rubai). There are NO other human teammates
yet. **Rubai must invite at least one real teammate** to the
Mattermost rooms before this demo can be rehearsed as written — a
colleague, a friend, anyone real who can type the rehearsed lines.
Do NOT create fake accounts, do NOT stage a second person, do NOT
fabricate conversation screenshots. If only one teammate can be
invited, Human A and Human B are that teammate and Rubai (owner) —
the demo still has two humans plus the agent. If NO teammate can be
invited in time, the demo shows Rubai + the facilitator only, and
that does NOT fully meet the brief — say so in the submission rather
than faking a teammate.

## Setup (do this before any rehearsal)

1. **Production up.** The Switch stack, the app on :3100, and the
   runtime must all be running (see `docs/SETUP.md`). Verify the app
   loads and the room drawer is live.
2. **Create the fresh case.** In the app: New case → HAGGLE wizard,
   enter the seed numbers above (DairyCo, $0.16 → $0.24, 6 fl oz,
   other $3.62, menu $16.00, 160/month, mandate target $0.16, max
   approved $0.20). Note the new case id (HAG-0xx) and its room id
   (from the room drawer). The case must reach DISCUSSION before the
   chat demo starts.
3. **Invite the teammate(s).** In Mattermost: invite the teammate
   account and add them to the fresh case's room. Confirm they can
   post in the room.
4. **Routing check (no provider — posts nothing).** With the runtime
   running and NO provider configured, have Human A post a test
   @-mention in the fresh room. Check the runtime log: the message
   must route to the fresh case and decline with "LIVE MODEL NOT
   CONFIGURED — no draft produced". This proves the facilitator hears
   the fresh room without posting anything into it. If the message
   does NOT route, stop: fall back to running the chat investigation
   in `#haggle-dairyco` (HAG-014's numbers, same figures) and doing
   the approval on the fresh case in the app — and note the fallback
   in the submission.
5. **Configure the live model.** Restart the runtime with the four
   `CONVERGE_LLM_*` variables (Cloudflare Workers AI: provider,
   token, base URL
   `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1`,
   model `@cf/qwen/qwen3-30b-a3b-fp8`). Confirm the startup log shows
   the live provider, not "LIVE MODEL NOT CONFIGURED" and not the
   mock.
6. **Rehearse once, end to end, before recording.** The rehearsal is
   the real run — the recording uses the rehearsed footage, not a
   second staged take. If anything fails in rehearsal, fix it and
   re-rehearse; do not edit around a failure.

## Rehearsal sequence

The humans read the lines below verbatim. The agent's replies are
NOT scripted — they come from the live model at rehearsal time. What
is specified for each agent turn is what it must do and what it must
contain, not its wording. If an agent reply is rejected by validation
(see "If the agent does not reply"), it is not posted; the draft goes
to the inbox for human review and the humans re-tag once.

### Step 1 — Human A identifies the supplier problem
**Who:** Human A, in the fresh case's room.
**Line (read verbatim):**
> "DairyCo just raised heavy cream again — $0.16 to $0.24 a fluid
> ounce. That's 50%. Our Alfredo margin is going to take a hit."
**What this proves:** a real human, in a real team chat, surfacing a
real business problem. The numbers are the case's own input, not
invented.
**Timing:** the room is quiet before this; this message starts the
demo.

### Step 2 — Human B tags the facilitator
**Who:** Human B, in the same room, replying to Human A.
**Line (read verbatim):**
> "@converge-facilitator Can you work out what this does to our
> Alfredo and what we should say back to DairyCo? Don't agree
> anything with them."
**What this proves:** a human teammate deliberately invoking the
agent, with an explicit boundary ("don't agree anything"). The
@-mention is what makes Switch route the message to the facilitator
(the addressing rule).
**Note:** the @-mention is required. A message without it is observed
but not routed.

### Step 3 — The agent investigates and replies in the room
**Who:** the facilitator, under its own identity.
**What it must do:** read the case and the room timeline through its
tools, run the deterministic engine (`compute_haggle`), and post a
validated informational reply in the room. The reply carries:
- the label `[CONVERGE facilitator - informational analysis, not a
  decision]`;
- the analysis in its own words (what the rise costs, which
  strategies fit the mandate, the recommended counter);
- the engine-figures line (deterministic, not model-computed):
  food cost 28.63% → 31.62%, +$76.80/mo (+$921.60/yr), max
  sustainable $0.1967/unit;
- the footer `Ref <refId> - Final decisions stay with a human; this
  analysis does not approve or commit anything.`
**What this proves:** the central brief requirement — a genuine
model-generated response, under the agent's identity, in the real
team chat. The numbers are the engine's, not the model's; the reply
is validated before posting (no approval/commitment language, no
credential requests, no supplier contact, no figure the engine did
not compute).
**Timing:** the reply should appear within seconds of the tag. The
video shows it arriving live.

### Step 4 — Human B challenges the recommendation
**Who:** Human B, in the room.
**Line (read verbatim):**
> "You recommend the $0.18 counter — but what if DairyCo refuses?
> And is $0.18 actually inside our 30% food-cost target?"
**What this proves:** the teammate is not a passive audience. The
challenge is a genuine question (not a staged fact): whether the
counter survives a refusal, and whether the figure is really inside
the target. The agent must answer from evidence, not assert.
**Note:** do not invent a DairyCo refusal. The question is "what
if" — the agent answers with the alternatives the engine already
priced (freeze, volume, gradual).

### Step 5 — The agent responds with additional investigation
**Who:** the facilitator, in the room.
**What it must do:** investigate again (re-read the case, re-run the
engine), and post a second validated reply: food cost at $0.18 is
29.38% — inside the 30% target; what the alternatives cost if DairyCo
refuses (the freeze holds the old price; the volume option; the
gradual step); and the explicit limit that it cannot agree anything
with DairyCo — that is the owner's decision. Same label, same footer,
new ref id. One reply per source message (idempotency): the challenge
gets exactly one reply, never a duplicate.
**What this proves:** a two-way human-agent conversation, not a
single Q&A. The agent's second answer uses deterministic calculations
again — the numbers are checked against the engine before posting,
so a wrong figure is rejected, not published.

### Step 6 — The owner reviews the proposal
**Who:** Rubai, in the CONVERGE app (not in the chat).
**What he does:** opens the fresh case → Negotiation tab → selects
the counter strategy ($0.18/fl oz for 6 weeks, in writing). The exact
terms appear above the button labelled **Submit for approval**. He
reads them, checks the impact shown, and submits.
**What this proves:** the proposal is a human-reviewed artefact. The
agent proposed; the owner decides whether it goes forward. The
dashboard appears here only to show the calculation, the strategies,
and the proposal — the chat did the collaboration, the app does the
decision record.
**Note:** the owner reviews the proposal the agent's analysis
supports. He may also open the Drafts tab to see the same analysis
as a draft record — but the draft inbox is not the demo; the room
reply is.

### Step 7 — Human approval, separate and secure
**Who:** Rubai, in the app.
**What he does:** the approval modal shows the same terms plus the
engine-computed impact, with the proposal id, version, and content
hash. He approves as the owner, under his own human session token.
The case moves to COMPLETED and the Audit tab records the approval.
**What this proves:** the approval boundary is real. The agent has
no session token, no approve tool, and no code path to approve — the
engine refuses an agent approval. Sharing a reply or a draft is not
approval; only this human step commits the decision.
**Line (Rubai, on camera or voiceover, optional):**
> "The agent proposed. I decided."

## What is proven vs what is blocked

| Part | Status | Evidence |
|---|---|---|
| Reply mechanism (validate → post → idempotency → label + engine figures + footer) | **Proven** — verified live with the labelled mock provider | Real human message in #haggle-dairyco produced a mock reply in the real room (event `sw_e4e5c560`, ref `89be10b7`, 1 second later; no double-post on re-route). The mock reply was clearly labelled MOCK. |
| Runtime routing (addressed human message → correct case) | **Proven** — verified live | Two real human messages routed to HAG-014 after the addressing-policy fix. |
| Two-way delivery (human post → agent read; agent post → Mattermost) | **Proven** — verified live after every recovery | Latest: human marker → read_context; agent event → Mattermost post. |
| HAGGLE engine figures ($0.18 counter, 29.38%, $57.60/mo saved) | **Proven** — deterministic, tested | Suite 351 (350 pass, 1 skipped); engine is the single source of truth. |
| Human approval boundary (session token, versioning, hash binding) | **Proven** — tested | 401 without a token; approve rejects on hash mismatch; no approve tool in the registry. |
| **Live-model replies in the room (the actual demo footage)** | **BLOCKED — needs Rubai's Cloudflare token + Account ID** | No provider key is configured. The mock reply must NEVER be presented as a live model response. |
| **Two real human teammates in the room** | **BLOCKED — needs Rubai to invite at least one real teammate** | Only the `user` account exists on this Mattermost. No fake accounts, no fabricated screenshots. |
| Fresh-case room routing (wizard room → facilitator) | **To verify in Setup step 4** | Routing check with no provider posts nothing and proves the route. Fallback to #haggle-dairyco is documented. |

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

## Release gate (Track 01)

Do not record until ALL of these hold:

- [ ] Real model provider configured (Cloudflare Workers AI token +
      Account ID, runtime restarted with the four `CONVERGE_LLM_*`
      variables).
- [ ] A genuine agent response verified in the room (live-model
      reply, labelled, with the engine-figures line, under the
      facilitator's identity).
- [ ] Agent responses appear in the actual Mattermost room (not the
      draft inbox, not a screenshot).
- [ ] Two-way human-agent conversation works (challenge → second
      reply, one reply per source message).
- [ ] HAGGLE workflow verified (fresh case → strategies → Submit for
      approval → human approval → COMPLETED, audit record).
- [ ] Human approval remains protected (no token in the runtime, no
      approve tool, approve still 401s without a session).
- [ ] Mandatory tests pass (suite 351: 350 pass, 1 skipped; `npm run
      check` clean).
- [ ] At least one real teammate invited and posting in the room.

## Rehearsal timing

About 10–15 minutes of human time: setup (5 min), Steps 1–5 in the
room (5 min, mostly waiting on the two agent replies), Steps 6–7 in
the app (3 min). The video uses roughly 80 seconds of it (see
`submission/demo-script.md`, Scenes 3–5).

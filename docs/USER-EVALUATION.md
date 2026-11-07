# CONVERGE — User Evaluation Protocol

## Status: PENDING — no evaluation has been conducted

**No participants have been recruited. No sessions have been run. No
results exist. No quotes, scores, or findings are recorded in this
document, because there are none to record.**

This document is the protocol only. When an evaluation is run, the
results go in §7 using the template in §6 — and only results from
real sessions with real participants may be entered there. Do not
backfill this document with invented participants, fabricated
interviews, or assumed outcomes.

The lack of real users is the single biggest evidence gap in the
submission (see `docs/JUDGE-SCORECARD.md` §5 and
`docs/positioning.md` §5). This protocol exists so the gap can be
closed honestly, not so it can be papered over.

---

## 1. Purpose

Test whether actual people — independent restaurant and café owners,
the HAGGLE target user — find CONVERGE useful, understandable, and
trustworthy for a supplier price increase, and whether they understand
the human approval boundary. The evaluation is a usability study, not
a sales demo: the facilitator must not steer the participant toward a
"correct" answer, and confusion is a finding, not a failure of the
participant.

## 2. Participant criteria

- **Target: 5–8 real participants.** Fewer than 5 is a pilot, not an
  evaluation; more than 8 adds little for this scope.
- **Priority recruitment:** independent restaurant and café owners
  (one to three locations) who buy from one to three suppliers and do
  their own ordering. They are the HAGGLE buyer.
- **Acceptable substitutes if owners cannot be recruited:** a café
  manager who orders supplies, or a small food-business operator with
  the same ordering responsibility. Record the actual role; do not
  relabel a substitute as an "owner".
- **Excluded:** fictional participants; team members; developers of
  CONVERGE; anyone who has seen the codebase or the demo script.
  Team members and developers must never be counted as product users.
- **No payment is offered and no service is promised.** Participation
  is voluntary and the participant may stop at any time.
- **Do not collect unnecessary personal or business-sensitive
  information.** Do not ask for the participant's supplier names,
  prices, margins, revenue, or any other commercially sensitive
  figure. The evaluation uses the fictional DairyCo demo data only.
  Record only what §6 asks for.

## 3. Consent

Before the session, the facilitator reads the following (or a
translation of it) and records the participant's agreement:

> "This is a usability test of CONVERGE, a tool for handling supplier
> price increases. I will ask you to try seven tasks on a demo with
> fictional data — no real supplier, no real money. I am testing the
> tool, not you: if something is confusing, that is useful information
> for us. You can stop at any time. I will take notes on what you do
> and say about the tool. I will not record your name, your business
> name, your suppliers, or any real prices. May I proceed?"

- Record consent as: **date, participant ID (P1, P2, …), "consent
  given" or "declined"**. Do not record the participant's name.
- If consent is declined, end the session and record only that a
  session was declined.
- The participant's real business data must never be entered into the
  app. Use the DairyCo demo case (HAG-014) and a fresh wizard case
  with the demo numbers only.

## 4. The seven tasks (session script)

Run on the live app (REAL-SWITCH mode, dark UI) or, if the Switch
stack is unavailable, on the SIMULATED-STUB fallback — and record
which mode was used, because the room is part of the product. Start
each task by reading the prompt aloud. Do not explain the interface
first; the participant's first encounter is part of the evidence.
Help only if the participant is stuck for more than 2 minutes, and
record any help given as a critical error for that task.

### Task 1 — Identify a supplier price increase
> "Your supplier has raised the price of heavy cream. Open the case
> for it and tell me what changed."

Expected: the participant finds HAG-014 and states the old price
($0.16/fl oz), the new price ($0.24/fl oz), and the +50% change.

### Task 2 — Understand its financial impact
> "What does that price rise actually cost you — per dish, per month,
> and as a share of your menu price?"

Expected: the participant reads the deterministic analysis
(+$0.48/serving, +$76.80/month, food cost 28.63% → 31.62%, max
sustainable price $0.20 at a 30% target) and can state at least the
per-serving and monthly figures in their own words.

### Task 3 — Compare negotiation strategies
> "The tool suggests six ways to respond. Which ones would you
> consider, and why? Which would you rule out?"

Expected: the participant compares at least two strategies (e.g. the
$0.18 counter vs the price freeze) using the priced impact (food-cost
%, monthly impact), not just the names.

### Task 4 — Review the facilitator's recommendation
> "The facilitator recommends one option. What is it, and do you
> trust it? What would make you trust it more — or less?"

Expected: the participant identifies the recommended counter ($0.18 /
fl oz for 6 weeks), states the reason given (food cost 29.38% vs the
30% target — within target), and gives a reasoned trust judgement
(including what evidence they would want to see).

### Task 5 — Identify missing evidence
> "What information is the tool missing that you would want before
> you negotiated?"

Expected: the participant names at least one gap (e.g. whether the
supplier's price is negotiable, whether an alternative supplier is
real, whether the volume commitment is feasible). There is no single
right answer; the point is whether they can spot that the tool does
not know everything.

### Task 6 — Review a proposed negotiation
> "Here is the proposal the tool prepared for the supplier. Read it
> and tell me: would you send this? What would you change?"

Expected: the participant reads the counter terms ($0.18 / fl oz for
6 weeks, in writing) and the impact, and gives a send / edit /
reject judgement with a reason.

### Task 7 — Understand the human approval boundary
> "Who actually agrees the price with the supplier — you, or the
> tool? Show me how you would approve it, and what happens if the
> tool tried to approve it on its own."

Expected: the participant states that only a human can approve, finds
the Submit for approval → approval flow, and understands that an
agent approval is refused by the engine. If they believe the agent
can approve, that is a critical finding — record it verbatim.

## 5. Metrics to record (for each task, for each participant)

| Metric | How to record |
|---|---|
| Task completion | Completed / completed with help / not completed. "Completed with help" counts as a failure for the task's pass rate. |
| Time to complete | Minutes and seconds from the prompt being read to the participant stating their answer. Cap at 5 minutes per task; record "timed out" if exceeded. |
| Critical errors | Any wrong action that would have a real consequence (e.g. approving the wrong terms, sending a proposal they did not intend, misreading a price by more than $0.01). Record the exact action. |
| Points of confusion | Any moment the participant hesitates, asks for help, misreads a label, or says "I don't understand". Record the exact words and the screen element involved. |
| Perceived usefulness | After the task, ask: "Was this useful? 1 = not at all, 5 = very useful." Record the number and one sentence of reason. |
| Trust in the recommendation | After Task 4 only: "How much do you trust this recommendation? 1 = not at all, 5 = completely." Record the number and one sentence of reason. |
| Clarity of financial calculations | After Task 2 only: "Were the numbers clear? 1 = confusing, 5 = completely clear." Record the number and what, if anything, was unclear. |
| Understanding of human approval | After Task 7 only: "Who decides? 1 = the tool decides, 5 = I decide and the tool cannot decide for me." Record the number and the participant's own explanation. |
| Willingness to use the system again | At the end of the session: "Would you use this again for a real price rise? Yes / No / Maybe — and why?" Record the answer verbatim. |

Also record, once per session: the app mode used (REAL-SWITCH or
SIMULATED-STUB), the participant's role (owner / manager / other —
as stated by them), the date, and the facilitator's name.

## 6. Results template (empty — fill only with real session data)

For each participant, copy this block and fill it in. Do not fill in
any row without a real session behind it.

```
### Participant P__ — role: ______ — date: ______ — mode: REAL-SWITCH / SIMULATED-STUB
Consent: given / declined
| Task | Completed | Time | Critical errors | Points of confusion |
| 1 — Identify the price increase | | | | |
| 2 — Understand the financial impact | | | | |
| 3 — Compare negotiation strategies | | | | |
| 4 — Review the facilitator's recommendation | | | | |
| 5 — Identify missing evidence | | | | |
| 6 — Review a proposed negotiation | | | | |
| 7 — Understand the human approval boundary | | | | |
Perceived usefulness (1–5, per task): 1:__ 2:__ 3:__ 4:__ 5:__ 6:__ 7:__
Trust in the recommendation (Task 4, 1–5): __ — reason: ______
Clarity of financial calculations (Task 2, 1–5): __ — what was unclear: ______
Understanding of human approval (Task 7, 1–5): __ — participant's explanation: ______
Willing to use again: Yes / No / Maybe — why (verbatim): ______
Facilitator notes: ______
```

### Summary (fill only after at least 5 sessions)

- Participants: __ (of target 5–8)
- Task completion rate (completed without help): __ / __ tasks
- Median time per task: __
- Critical errors observed: __ (list them)
- Most common point of confusion: __
- Mean perceived usefulness: __ / 5
- Mean trust in the recommendation: __ / 5
- Mean clarity of financial calculations: __ / 5
- Mean understanding of human approval: __ / 5
- Willing to use again: __ Yes / __ No / __ Maybe
- Changes made as a result (with the commit or issue reference for
  each): __

## 7. Results

**None. The evaluation is pending. No participants have been
recruited and no sessions have been run.** This section must stay
empty until real sessions are conducted under the protocol above.

## 8. What this protocol does not do

- It does not evaluate the COURT or CORRECTION workflows. They are
  supporting evidence for the engine, not the business product; a
  separate protocol would be needed for them.
- It does not evaluate the agent's drafts, because no live model is
  configured (see `docs/AGENT-RUNTIME.md`). A draft-evaluation
  protocol is a separate piece of work and requires a provider key.
- It does not measure business outcomes (actual money saved). It
  measures whether real users can use the tool and understand it.
  Money saved would need a longitudinal study, not a single session.

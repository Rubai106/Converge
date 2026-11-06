# CONVERGE — Positioning, Differentiation & Judge-Readiness

**Date:** 2026-11-06 · **Status:** final, for the Flip the Switch submission (closes Nov 7, 11:59 PM IST = Nov 8, 12:29 AM Dhaka). This document is the honest record behind the README and the demo script. It does not add features, users, or market data. Where a claim cannot be evidenced, it says so.

## 1. The product, in one sentence

**Most collaboration tools help people communicate. CONVERGE helps them reach an accountable decision.**

One shared decision engine, three applications:

| Stage | What happens | HAGGLE | COURT | CORRECTION |
|---|---|---|---|---|
| Intake | A case is opened with the facts that matter | A supplier price rise (DairyCo cream +50%) | Three conflicting versions of one recipe | A transcript with factual claims |
| Evidence | The facts are checked against something verifiable | Deterministic dish maths: cost/serving, food-cost %, margin, monthly/annual impact | The versions, side by side, with their differences | Rule-based claim extraction (facts separated from opinion), each claim linked to evidence |
| Conflict | The disagreement is made explicit | The supplier's $0.24 vs the owner's mandate (target $0.16, max $0.20, walk away above $0.20) | The conflict table (salt, fat, simmer time) + blind ratings | The guest's challenge vs the transcript |
| Proposal | An option is priced, tested, or corrected | Six strategies; the supplier's $0.19 counter is priced against the same maths | The tally, revealed only when all ratings are in | The verification agent's evaluation |
| Human approval | A person — never an agent — decides | The owner approves in the Mattermost room | A human approves the canonical recipe | The host approves the correction |
| Audited resolution | The outcome is filed and can be re-checked | The agreed $0.19 is recorded and re-checked next month | The canonical recipe is recorded with the dissent preserved | The errata is published with the original preserved |

The product is the engine. The workflows are proof that it generalises. That is the positioning, and it is the only honest one: **CONVERGE is a shared decision-resolution engine with three applications, not one commercial product with one buyer.**

## 2. Honest evaluation — is it one product or three apps?

It is coherent as an **engine** and honest about being three **applications**. The coherence is in the mechanism (the six stages above), the room model (one Mattermost room per case), the approval gate (human-only, enforced at the engine level, not a UI convention — an agent approving returns 400), and the audit trail (every state change recorded with actor and kind). The same stepper, the same tabs, the same approval and audit pattern appear in all three workflows, and a judge can see that in the demo.

The incoherence risk is real and should not be hidden: a restaurant owner, a family, and a podcaster are three different buyers, and no single buyer needs all three. As a commercial product, CONVERGE would be three products sharing infrastructure. For this hackathon that is a strength (it demonstrates generality), but only if it is framed that way. The README and demo script frame it exactly this way: **HAGGLE is the flagship business product; COURT is proof the engine handles a very different kind of disagreement; CORRECTION is a supporting application.** A judge who sees "three demos stapled together" has a point unless the shared mechanism is made visible — which is why the README names the six stages and the demo walks them in the same order in every workflow.

### What is genuinely interesting

- **The combination, not the parts.** No single product was found doing any of the three complete workflows end to end (see `docs/competitor-validation.md`). The claim is phrased carefully: our research did not identify one — not "none exists anywhere".
- **COURT's mechanism.** Version conflict → blind coded test → gated tally → canonical recipe with the dissent preserved. The closest pieces are a single-user recipe app (Chef Notebook) and a party game (Palate Party). Neither adjudicates.
- **CORRECTION's loop.** The guest challenges *their own* claims in chat, the host approves the errata, the original is preserved. Errata today is manual practice (a dated show-notes note, an audio-file swap, a next-episode announcement). No product was found doing the loop.
- **The human-only approval gate, enforced in the engine.** ChefOps AI and SupplyScout have approval routing; Pactum explicitly removes the human buyer. CONVERGE's gate is the opposite design: the agent proposes, the human decides, and the engine refuses an agent approval.
- **Deterministic money maths.** An LLM never invents a financial number. The engine computes; the agent and the human argue about the result. That is a design choice, not a feature.

### What is common and already exists

- Invoice → dish margin (PlateSense / Marji, $59/mo, a commodity).
- Recipe storage and sharing (Paprika, Samsung Food, Cookpad, and a dozen others).
- Transcription (Descript, Riverside, Otter).
- Claim extraction for professional fact-checkers (Full Fact AI, Logically Accelerate).
- Autonomous negotiation at enterprise scale (Pactum).
- Group voting and deliberation (Loomio, Miro, ForkPeace).
- Supplier chat for ordering (Choco, REKKI).
- The arithmetic itself (food-cost % is standard practice; WISK already inverts target food-cost % into a required menu price).

### What a competitor could easily copy

- The UI (a case view with tabs and a stepper).
- The deterministic maths (it is arithmetic).
- The blind-test protocol (a standard sensory method).
- The claim-extraction idea (rule-based extraction is simple; Full Fact AI does it with ML).

What is hard to copy is the **assembled workflow in a real Switch room**: the human-only approval gate, the audit trail, the trust that comes from a verified live integration, and the specific combination per workflow. That is the defensible differentiation, and it is an assembly claim — not a first-ever claim.

### Why use CONVERGE instead of chat, a spreadsheet, or an existing tool?

- **Chat alone** on its own does not price the decision, structure a mandate, or produce an approval record — though teams can add bots, approvals and other tools around it. Decisions can get lost, the loudest voice can win, and proving what was agreed takes extra work.
- **A spreadsheet alone** can calculate, and can be configured with sharing, comments or approval add-ons, but on its own it is not a shared negotiation with a counter-party, a backend-enforced approval gate, and preserved dissent in one record. CONVERGE's claim is that conjunction in one workflow, not that chat or spreadsheets are useless.
- **Existing tools** each solve one step (invoice→margin, or voting, or transcription) but none carries a disagreement from intake to an audited, human-approved resolution in the room where the people already are.
- **Why return:** the record accrues. The agreed price is filed and re-checked next month; the canonical recipe is recorded with its dissent; the errata is published with the original preserved. The next price shock, the next family dispute, the next episode — the engine is reusable, and the history is the reason to come back.

## 3. Target users and value

### HAGGLE — the flagship (Business track)

- **Primary user:** an independent restaurant or café owner (one location, or two or three) who buys from one to three suppliers, does their own ordering, and feels a price rise in their margin immediately.
- **Their actual problem:** a supplier raises a price and the owner does not know what it actually costs per dish, negotiates from a position of ignorance, and agrees verbally with no record.
- **Their current solution:** a phone call or WhatsApp with the supplier, a spreadsheet (or gut feel), and memory.
- **The frustration:** they cannot answer "what does +50% on cream cost me?" without doing the maths by hand, and they cannot prove what was agreed a month later.
- **What CONVERGE saves:** the maths (cream/serving $0.96 → $1.44; food cost 28.63% → 31.62%; monthly extra $76.80), the negotiation position (a priced counter with a walk-away), and the record (the agreed price, filed).
- **Measurable benefit (demo numbers):** the supplier's $0.19 counter, accepted, saves **$48.00/month** versus accepting $0.24 — $576/year — and keeps food cost at 29.75% instead of 31.62%. More generally, knowing the max sustainable price ($0.1967 at a 30% target) prevents accepting a price that silently kills margin.
- **Why trust an AI-assisted negotiation:** the AI never invents money (deterministic engine), the owner sets the mandate (target $0.16, max $0.20, walk away above $0.20), and only the owner can approve. The AI proposes; the human decides.
- **Why pay:** one avoided bad acceptance pays for months of a tool. PlateSense and Marji charge $59/location/mo for the maths alone; CONVERGE adds the negotiation, the approval, and the record. (No CONVERGE price is set — this is a value argument, not a pricing claim.)

### COURT — proof the engine generalises (Personal / Creative)

- **Audience:** a family, a cooking group, or a food community arguing about the "real" version of a dish.
- **Value:** a fair process (blind, coded, independent ratings) instead of the loudest voice, plus the losing version preserved as dissent rather than erased.
- **No money at stake.** The value is harmony and a defensible decision, not margin. This is a different buyer from HAGGLE and should not be pitched as a business product.

### CORRECTION — supporting application

- **Audience:** an independent podcaster or a small editorial team (one to five people) who publish claims and cannot afford a fact-checking desk.
- **Value:** a guest-corrected, host-approved errata without hiring anyone — the guest's challenge, evaluated and approved, with the original preserved.
- **Different buyer again.** The value is credibility and a public record of corrections, not revenue.

### The commercial reality

Do not pretend one buyer wants all three. The clearest hackathon positioning is: **HAGGLE is the business product (main track); COURT and CORRECTION are proof the engine generalises (supporting evidence).** That is how the README and the demo script are written.

## 4. Why SWITCH and Mattermost are essential

Switch is not a chat widget on top of the app. It is the collaboration surface, and removing it collapses the product:

- **The shared room** (one Mattermost room per case) is where the people already are. Without it, CONVERGE becomes a single-user web app with a chat sidecar, and the multi-party work disappears.
- **Human-message ingestion** (the bridge delivering Mattermost messages into Switch's room timeline, read with `read_context`) is how the agent hears the owner. Without it, the agent cannot receive an approval, a counter, or a challenge.
- **Approval in chat** is the point of the gate. An approval button in a web UI is a form; an approval posted by the owner in the room, read by the agent, and recorded in the audit trail is a decision the whole team can see.
- **The room timeline is the record.** The audit trail lives in the app, but the decision is visible in the room where it was made.

What is real and what is simulated — stated plainly:

- **Real:** the integration. Switch-core 0.31.0 + Mattermost 11.9.0, running as native processes from the published images, with a live bridge, real rooms (`#haggle-dairyco`, `#recipe-ragu`, `#episode-osei`), and a real approval posted by the owner in Mattermost that moved HAG-014 to COMPLETED with its audit trail intact. Verified live, 2026-11-06.
- **Simulated (labelled):** the business participants. DairyCo, the family members, and the guest are fictional demo data; the supplier counter is a demo proposal. The supplier is not real, and the demo never claims it is.
- **The stub:** the app has a labelled SIMULATED-STUB fallback (a fixed 2026-11-06 dataset, plainly shown as a stub) so it can be demonstrated without a live Switch server. The stub is a fallback, not the product. The multi-party room work — the thing the hackathon is about — has no substitute in the stub.

## 5. Judge score — honest estimate

Scored out of 50 on a stated rubric, not the hackathon's (no official numerical weights are published). This is an estimate of how a judge would see the submission as it stands, not a promise.

| Criterion (10 each) | Score | Reasoning |
|---|---|---|
| Problem & business value | 7 | A real problem, quantified benefit ($48/mo saved in the demo, margin preserved). Deducted: the supplier is fictional and there are no real users yet. |
| Switch centrality & collaboration | 8 | Live, verified integration; the approval genuinely happens in chat. Deducted: the stub fallback exists, and the drawer shows app-stored messages only (full history is in Mattermost). |
| Technical quality | 8 | 161/161 tests, axe-core 0 violations on 13 pages, deterministic engine, security hardened. Deducted: no live XSS probe (blocked by a platform safety filter, documented, not retried), no usability sessions. |
| Novelty & differentiation | 7 | The combination is genuinely unoccupied in our research (verified, two passes); COURT's mechanism is the strongest differentiator. Deducted: every component exists somewhere, and the assembly claim is weaker than a first-ever claim. |
| Demo, evidence & presentation | 8 | A real demo video, 48 screenshots, a QA report, and an evidence package. Deducted: the video has two documented stale frames (see §7). |
| **Total** | **38 / 50** | A strong, honest submission. Not a 45+ submission — that would need real users and usability evidence. |

**What would genuinely raise the score:** real users running the HAGGLE flow (5–8 participants, documented), an independent evaluation of the Copilot/Court outputs, and a re-recorded demo video. **What would not:** more features, a UI redesign, or a bigger claim. The product is complete enough for the demo; the gap is evidence, not code.

**What a judge could challenge, and the answer:**

- *"Is this three apps stapled together?"* — No: one engine, six stages, the same approval and audit pattern in every workflow. COURT and CORRECTION exist to prove the engine generalises; HAGGLE is the business product.
- *"PlateSense already does the maths."* — Yes, for $59/mo. It never negotiates, never talks to the supplier, and never files an agreed price. The maths is the brief; the negotiation and the approval are the product.
- *"Pactum already negotiates."* — At enterprise scale, autonomously, and it explicitly removes the human buyer. HAGGLE is the inverse: deterministic, single-ingredient, small-restaurant, human-only approval.
- *"Where are the real users?"* — There are none yet. That is stated in the README and the checklist. It is the biggest remaining gap.
- *"Is Switch really necessary?"* — Yes for the multi-party work. The stub proves it: without the room, there is no shared decision, only a single-user calculator.

## 6. Remaining risks

1. **No real users or usability sessions.** The biggest gap. Nothing in this pass fixes it (that would need real participants, not more writing).
2. **The demo video's two stale frames** (see §7). Disclosed in the demo script and the README; a judge who watches the video may still notice the "Pending" line on the completed case.
3. **The XSS live probe is outstanding.** Static review is complete and regression tests exist, but the live probe was blocked by a platform safety filter and was not retried. Documented as a limitation, not hidden.
4. **The stub fallback could be misread.** A sceptical judge could read "SIMULATED-STUB" as "Switch is optional". The README frames it as a fallback and states what is lost without the room.
5. **First-stack room timelines were lost** in the overnight VM replacement. The approval record survives in the app's audit trail and in the evidence screenshots; the current rooms carry a record note. Disclosed, not re-staged.
6. **Deadline.** Submission closes Nov 7, 11:59 PM IST (Nov 8, 12:29 AM Dhaka). The three remaining personal actions (Wispr scorecard, the submission itself, the phone check) are all Rubai's.
7. **Binary assets are not on GitHub.** The connector is text-only; screenshots and the demo video are delivered to Rubai as attachments and must be uploaded to the submission platform by him.

## 7. Demo video — recommendation: retain

The video (`submission/demo/converge-demo.mp4`, 2:28, recorded 2026-11-06) shows the real app, the real first-stack rooms, and the real HAG-014 approval. It has two documented stale frames:

1. The HAG-014 overview shows a stale "Pending: $0.19/fl oz for 6 weeks" line above the APPROVED stamp (recorded before the H1 fix; the live app no longer shows it).
2. The room timelines shown are the first stack's (lost to the VM replacement; current rooms carry a record note).

**Recommendation: retain the original recording. Do not re-record, do not edit it.**

- Re-recording is not feasible without losing the burned-in section titles — the title burn-in step was never scripted, so a re-record would come out without them.
- A minimal correction (a title card at the start) would not fix the mid-video "Pending" frame, and editing a recording to hide a stale frame would be worse than disclosing it.
- The staleness is disclosed in writing (demo script §9 and the README's submission section), which is the honest handling. The video's value — the real app, the real rooms, the real approval — outweighs two disclosed stale frames.
- **The original must not be destroyed.** Any future re-record is a new file, never an overwrite.

## 8. What was not done in this pass

No new features. No UI redesign. No changes to the financial calculations. No Switch infrastructure changes. No production-data changes. No security probes. No fabricated users, interviews, market statistics, or competitor capabilities. The README, competitor validation, demo script, and checklist were revised; this document was added. The application code was not touched.

# CONVERGE — Demo script (3 minutes, HAGGLE flagship)

Total: ~3:00. All demo data is fictional. The supplier in the demo is simulated
and labelled as such. Switch here is the labelled SIMULATED stub unless the
run is on a real Switch server — say which one on camera.

## 0:00–0:20 — The problem
"Your supplier just raised cream by 50%. What does that do to your menu —
and what do you say back?" Show the dashboard: 3 cases, 1 awaiting approval.

## 0:20–1:10 — HAGGLE (HAG-014)
1. Open HAG-014 — DairyCo cream $0.16 → $0.24/fl oz.
2. Show the deterministic analysis: +$0.48/serving, food cost 28.6% → 31.6%,
   +$76.80/month, max sustainable price $0.20 at a 30% target. Point out the
   assumptions line — gross margin shown separately from net profit.
3. Show the six priced strategies. Pick the $0.19 counter-offer: saves
   $48/month vs $0.24, stays under the 30% target.
4. Show the Switch room `#haggle-dairyco`: owner, DairyCo rep (simulated),
   Negotiation Agent, Financial Analyst. Agent posts within the mandate
   (target $0.16, max $0.20, walk away above it).

## 1:10–1:40 — The approval
5. Supplier counters $0.19 for 6 weeks. Agent recalculates and asks the owner.
6. Owner approves in chat / in the app (human approval). State moves
   AWAITING_APPROVAL → APPROVED. Show the audit trail: who approved, when,
   on what terms. The agreed price is filed and will be re-checked next month.

## 1:40–2:25 — COURT + CORRECTION (30s each)
7. COURT (CRT-007): ragù conflict table — salt/fat/simmer conflict, tomato
   agrees. Blind test-cook, independent ratings, disagreement flagged,
   canonical recipe with the dissent preserved.
8. CORRECTION (COR-003): 3 factual claims from the transcript, opinion
   separated. Guest corrects "led" → "co-led" and "Professor" → "Senior
   Lecturer" in the room; host approves the errata.

## 2:25–3:00 — Why Switch, why CONVERGE
9. "Without Switch there is no shared room — no multi-party work, no approval
   in chat, no audit trail. The engine is shared; the maths is deterministic;
   the human decides." Show the README limitations slide (stub status, simulated
   supplier, family panel is deliberation not statistics).

## Reproduce it
`npm test` (8/8) → `npm start` → http://localhost:3000 → open HAG-014 →
post in the room → approve the $0.19 counter as Owner.

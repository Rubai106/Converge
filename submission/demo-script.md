# CONVERGE — Demo script (live run, ~2:30, HAGGLE flagship)

Recorded against the **real Switch server** (switch-core 0.31.0 + Mattermost
11.9.0 on this machine, REAL-SWITCH mode) — say so on camera. All demo data
is fictional. The supplier in the demo is simulated and labelled as such;
the owner approval in the demo is a real approval posted in the real
Mattermost room and recorded by CONVERGE.

## 0:00–0:20 — The problem
"Your supplier just raised cream by 50%. What does that do to your menu —
and what do you say back?" Show the dashboard: 3 cases, HAG-014 completed.

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
6. COURT (CRT-007): ragù conflict table — salt/fat/simmer conflict,
   tomato agrees. Blind test-cook, independent ratings, disagreement
   flagged, canonical recipe with the dissent preserved.
7. CORRECTION (COR-003): 3 factual claims from the transcript, opinion
   separated. Guest corrects "led" → "co-led" and "Professor" →
   "Senior Lecturer" in the room; host approves the errata.

## 2:10–2:30 — Why Switch, why CONVERGE
8. "Without Switch there is no shared room — no multi-party work, no
   approval in chat, no audit trail. The engine is shared; the maths is
   deterministic; the human decides." Show the README limitations slide
   (simulated supplier, family panel is deliberation not statistics).

## Recording notes
- The video is `submission/demo/converge-demo.mp4` (147.8s, 1440×900,
  H.264, 3.2 MB; source webm alongside it) — a scripted walkthrough of
  the live app (Playwright), silent, with section titles burned in.
  It shows the real app, the real rooms, and the real approval record —
  nothing staged beyond the navigation itself.
- HAG-014 is COMPLETED in the recorded run because the approval already
  happened in the real room. That is the honest record; do not re-stage
  the approval live.

## Reproduce it
`npm test` (19/19) → `npm start` (with the real Switch env — see
`.env.example`) → http://localhost:3100 → open HAG-014 → open the room →
see the approval in the Audit tab.

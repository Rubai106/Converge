# CONVERGE — a collaborative AI decision and resolution platform

**Flip the Switch Hackathon 2026 — Main track: Best Business Workflow · Side track: Code with Wispr**

People bring conflicting proposals, evidence, opinions and interests. CONVERGE helps them investigate, compare, challenge, negotiate and resolve those differences through structured human–AI collaboration — in a shared Switch room, with a human approving every commitment.

## 1. What problem does it solve?
A supplier raises a price, a family disagrees on a recipe, a podcast guest disputes a claim. In each case the work happens in chat, the evidence is scattered, and the decision has no audit trail. CONVERGE turns that chat into a case: evidence → conflict → proposal → human approval → audited outcome.

## 2. Who uses it?
Restaurant/café owners, families and food communities, independent podcasters and small editorial teams — people whose counterparties will never install a portal, but already live in chat.

## 3. Why it matters
A few points of food margin are profit or loss for a small restaurant. A family recipe decided by the loudest voice loses the real version. A wrong claim published without a guest correction loses trust. Each needs a decision people can understand, verify and approve.

## 4. What makes it different?
Not any single feature — invoice→dish-margin, negotiation agents, recipe versioning and podcast fact-checking all exist somewhere (see `docs/competitor-validation.md`; Sofra and Happi Happi could not be found and are NOT cited). The difference is the assembly: **one shared decision engine** (case → evidence → conflict → proposal → approval → audited outcome) reused across three workflows, **in a Switch room in Mattermost**, with **deterministic maths** and a **human approval gate**. No adjudication product was found for COURT's core mechanism.

## 5. The three workflows
- **HAGGLE (flagship, Business)** — supplier price shock. Deterministic engine: old/new cost per serving, % change, food-cost %, gross margin, monthly/annual impact, max sustainable price at target food-cost %. Strategies priced from the same maths. Negotiation in a Switch room within the owner's mandate (target $0.16, max $0.20, walk away above it). Demo: DairyCo cream $0.16 → $0.24/fl oz, Alfredo +$0.48/serving, +$76.80/month, counter $0.19 for 6 weeks saves $48/month vs $0.24.
- **COURT (Personal/Creative)** — competing recipe versions. Conflict table, standardised blind test-cook with coded samples, independent ratings (taste/texture/aroma/appearance/difficulty/overall), disagreement analysis, human-approved canonical recipe with the dissenting version preserved. A family panel is a deliberation tool, not a statistically valid study — stated in the app.
- **CORRECTION (Personal/Creative)** — guest challenges a claim. Transcript → rule-based claim extraction (factual assertions separated from opinions) → evidence → guest correction in a shared room → Verification Agent evaluates → host approves → corrected show notes / errata, original preserved. Claim statuses: Verified / Corrected / Clarified / Disputed / Unresolved.

## 6. How does SWITCH participate?
Switch is central — without it there is no shared room, no multi-party work, no approval in chat. Each case has a Mattermost room (`#haggle-dairyco`, `#recipe-ragu`, `#episode-osei`) with humans + agents, room Instructions bounding each agent, and roles (owner, supplier, negotiator, analyst, facilitator, verifier). Agents: Facilitator, Researcher, Analyst (deterministic tools only for money/maths), Challenger/Auditor, and workflow specialists via role instructions. One agent hands work to another with a message — there is no separate task protocol.

**Protocol (verified 2026-11-05, Console 0.40.1 / switch-core 0.31.0):** WebSocket events + HTTP ops (SSE is legacy fallback only). `GET /health` probe, `POST /agents` → `{id, api_key}` once, event stream `/agents/{id}/events`, ops via `GET /ops` + `POST /ops/{name}`. Per-operation JSON shapes must be read from a live server's `GET /ops` — they are not invented here. See `docs/switch-protocol-notes.md`.

**Honest Switch status in this build: SIMULATED-STUB.** The app ships a protocol-shaped client (`server/switch-client.js`) plus a local stub (`server/stub-switch.js`) implementing the same routes, with every stub transcript captioned "SIMULATED — stub server, not Switch". A genuine headless Switch deployment is in progress on this machine (Docker Engine install + official Compose stack, `switch-core` 0.31.0, profiles `collab` + `gateway`, bundled Mattermost) — see `docs/switch-deployment.md`. No laptop setup is required from the user. Until the real server answers `GET /health`, the stub is the honest fallback and is never presented as real Switch. To point the client at a real server, set `SWITCH_BASE_URL` + `SWITCH_API_KEY` — the client points at the real server by changing only those.

## 7. Which agents exist?
Facilitator (coordinates, tracks progress, blocks premature completion), Researcher (collects evidence, records uncertainty), Analyst (deterministic calculations only), Challenger/Auditor (challenges unsupported conclusions, checks assumptions), Workflow Specialist (negotiation / adjudication / correction instructions per room).

## 8. What do humans approve?
Supplier commitments, prices and contract terms, final recipe selection, editorial decisions, publication, and any irreversible operation. Agents recommend, calculate, investigate and prepare. They never execute an unauthorised commitment — the state machine enforces it (`AWAITING_APPROVAL` → `APPROVED` requires a human actor and a pending approval; tests prove an agent cannot approve).

## 9. How to install and reproduce the demo
```
node --version   # >= 22
npm test         # 12/12 (8 engine + 4 server persistence tests)
npm run check    # node --check on all server files
PORT=3000 npm start   # http://localhost:3000
```
No npm dependencies, no database server: data is a JSON file in `data/converge.json`, seeded with fictional demo cases. Open HAG-014, see the analysis and strategies, post in the room (stub log), approve the $0.19 counter as Owner, and watch the audit trail. Then open CRT-007 (conflict table) and COR-003 (claims).

## 10. Limitations
- Switch demo here is the labelled stub, not a live Switch server (see §6). Real-server run sheet is in `docs/switch-protocol-notes.md` §4.
- Demo supplier/guest are simulated and labelled; no agreement is real unless a real supplier accepted it.
- COURT panel is deliberation, not statistics. CORRECTION claim extraction is rule-based, not a verified fact-checker; citations must be supplied as evidence, never fabricated.
- UI is the premium Direction B operations workspace (Inter + IBM Plex Mono, bullet graph, dense tables, two-step approval) — see `docs/ui-directions.md` and `submission/screenshots/premium-*.png`.

## Submission
- Track: Best Business Workflow ($2,000) + Code with Wispr ($500, side track)
- Deadline: Nov 7 2026, 11:59 PM IST / Nov 8, 12:29 AM Bangladesh time
- Wispr: see `docs/wispr-log.md` — voice log only; the genuine Insights scorecard screenshot is supplied by Rubai at submission time and is never fabricated.

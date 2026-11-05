# CONVERGE — UI/UX Directions

**Status: FOR SELECTION — no direction is final.** The user (Rubai) personally selects the final direction. These three are genuinely different systems, not three skins on the same layout. Backend, data model, APIs, agent services and Switch integration continue regardless of which is chosen; only the visual system, layout grammar and interaction language change.

**How to compare:** open the three prototypes side by side — `ui-directions/direction-a.html`, `direction-b.html`, `direction-c.html`. Each shows the *same* dashboard data and the *same* HAGGLE case with the *same* numbers, so the only variable is the design. Pick the one whose reading order, density and trust signals match how you want a judge to understand CONVERGE in two minutes.

**Research grounding (Nov 2026, checked):** premium ops dashboards work best table-first, dense but calm, with tabular numerals and 4-item KPI strips (Bloomberg/TradingView lineage; Linear/Stripe/Vercel restraint; Few's bullet graphs over gauges/donuts; Cowan's 4-chunk rule). Editorial/evidence systems work best when claims fit the evidence, hierarchy is a reading map, and a decision log makes ordinary decisions easy and unusual ones visible. Spatial canvases work best when presence, non-destructive draft overlays and context-selection links are explicit, and human vs agent authorship is never ambiguous (Nimbus collaborative-canvas research; FigJam live-presence pattern). All three directions follow WCAG 2.1 AA (4.5:1 normal text, 3:1 large text, ≥1.5 line-height, visible focus, keyboard-operable approvals).

## Shared demo case — used identically in all three prototypes

So the comparison is honest, every prototype uses one HAGGLE case:

| Field | Value |
|---|---|
| Case | HAG-014 — DairyCo heavy cream price rise |
| Supplier / ingredient | DairyCo / heavy cream |
| Old price → new price | $0.16 → $0.24 / fl oz (+50%) |
| Recipe | Alfredo, 6 fl oz cream per portion |
| Menu price | $16.00 |
| Cream cost / serving | $0.96 → $1.44 (+$0.48) |
| Total food cost / serving | $4.58 (28.6%) → $5.06 (31.6%) |
| Gross margin | 71.4% → 68.4% |
| Volume | 40 plates / week (160 / month) |
| Extra cost | $19.20 / week, $83.20 / month, $998 / year |
| Max sustainable cream price | $0.20 / fl oz (at 30% food-cost target) |
| Owner's mandate | Target $0.16, max approved $0.20, walk away above $0.20 |
| Supplier counter-offer | $0.19 / fl oz for 6 weeks (saves $48.00 / month vs $0.24) |
| Status | PROPOSAL — awaiting owner approval |
| Switch room | #haggle-dairyco (Mattermost) — owner, DairyCo rep, Negotiation Agent, Financial Analyst |

All money is deterministic backend calculation, never LLM-invented. Gross profit is shown separately from net profit; assumptions and units are always visible next to the number.

---

## Direction A — Evidence-first editorial

### Philosophy
A decision is a document that can be read, checked and defended. CONVERGE reads like a well-edited investigation: the claim first, the evidence underneath it, the dissent preserved, the decision signed at the end. Nothing shouts. The interface earns trust the way a good newspaper or a court record does — by showing its working, numbering its sources, and never hiding uncertainty. If a judge prints a case, it should still make sense on paper.

### Colour palette
- Paper `#F7F3EB` — page background
- Ink `#1B1A17` — primary text
- Ink soft `#5C574D` — secondary text, captions
- Rule `#D8D0BF` — hairline rules, table dividers
- Accent (verdict red) `#8C2F39` — approvals, decisions, warnings only
- Accent 2 (evidence green) `#2F5D3A` — verified evidence, approved items
- Highlight (margin note) `#F2E3B6` — analyst notes, never for decoration
- White `#FFFFFF` — evidence cards only
- All text ≥4.5:1 on its background. Red and green are never the *only* signal — every status also has a word and an icon/shape.

### Typography
- Display / headings: **Fraunces** (serif, 600, tight leading) — case titles, decision headings. Fallback: Georgia, serif.
- Body / UI: **Inter** (400/500/600) — evidence, messages, labels. Fallback: system-ui.
- Numbers / evidence IDs: **IBM Plex Mono** (500, tabular-nums) — money, IDs, timestamps, `[E1]` references. Money is always mono and right-aligned in tables.
- Scale: 13px body, 15px evidence text, 24–32px case title, 11px uppercase letterspaced (0.08em) section labels. Measure capped at ~68 characters for prose.

### Navigation architecture
Top masthead (CONVERGE wordmark left, workspace + user right) → thin section rail underneath: Overview · Cases · Evidence · Decisions · Activity · Settings. No left sidebar. Inside a case, a second line: Summary · Evidence · Proposals · Negotiation · Decision. Breadcrumb is a sentence: `Cases / HAGGLE / HAG-014 — DairyCo cream`. Search is a single prominent field: "Search cases, evidence, decisions…".

### Dashboard
Called **"Today's docket"**, not a dashboard. One column, reading order top to bottom: (1) a 3-line editorial lede — "3 cases await approval. 1 supplier counter-offer needs a decision today." (2) Cases awaiting approval as a numbered list with one-line verdicts, not cards. (3) "What changed since yesterday" — a short, timestamped ledger. No KPI tiles, no charts on the landing view; numbers appear inside sentences and tables where they belong.

### Case workspace
A document page: title, one-paragraph summary, then sections in fixed order — *The claim → The numbers → The options → The discussion → The decision*. A narrow right margin (280px, collapses below 1024px) holds footnotes, evidence references `[E1]–[E4]`, and the analyst's margin notes. The state of the case is a single stamped line at the top: `STATUS: PROPOSAL — AWAITING OWNER APPROVAL`, not a coloured badge alone.

### Negotiation interface
A **transcript with a ledger beside it**. Left: the Switch/Mattermost conversation as a chronological transcript, each message numbered, agent messages labelled `NEGOTIATION AGENT` in small caps, supplier messages indented and quoted. Right: a running "terms ledger" — every proposal/counter-offer as a dated row (price, duration, volume, status: proposed / countered / accepted / rejected / expired). The owner approves by signing a single sentence: "I approve $0.19/fl oz for 6 weeks" + name + timestamp. No chat bubbles, no emoji reactions as approval.

### Recipe comparison interface (COURT)
A **conflict table as the hero**: rows are variables (salt, fat, simmer time, tomato), columns are versions (Card / Auntie / Cousin), conflicting cells are outlined in red with a `CONFLICT` tag, agreeing cells are plain. Below it, the test-cook protocol as numbered instructions, then blind scores in a small table (taste / texture / aroma / appearance / difficulty / overall, 1–5), then the canonical recipe as a clean, printable document with the dissenting version kept as a footnote — never deleted.

### Evidence workspace
Evidence is a **numbered bibliography**. Each item has an ID (`E1` invoice PDF, `E2` recipe file, `E3` supplier message, `E4` rate card), a one-line description, its source and date, a status (Verified / Unverified / Disputed), and every place it is cited. Clicking a citation scrolls to the evidence and highlights it; clicking evidence lists its citations. Unverified claims are visibly marked "Unverified — do not rely on this alone."

### Switch integration experience
Switch is presented as **the room where the record was made**. Each case shows its Mattermost room (`#haggle-dairyco`), its members with roles, and a "View in Mattermost" link. Room messages are quoted with timestamps and authors; the agent's room Instructions are shown as a collapsible "What the agent was told" block, so a judge can see the mandate that bounded it. If Switch is down, the page says so plainly and shows the last synced transcript with its sync time — it never pretends live data.

### Motion
Almost none. 120ms fades on section expansion only; no slide-ins, no parallax, no animated counters. The one deliberate motion is the highlight that sweeps to a cited evidence item when clicked (300ms, respects `prefers-reduced-motion`).

### Responsive behaviour
Desktop: document + margin notes. ≤1024px: margin notes move below the section they annotate, in a bordered "Notes" block. ≤640px: single column, tables become stacked definition lists (label + value per row), the terms ledger becomes a vertical list, approval button is full-width and sticky at the bottom of the case.

### Accessibility
Serif headings are ≥18px bold (3:1) and body is 13px+ at 4.5:1+; focus is a 2px solid ink outline with 2px offset; all status is text + shape, never colour alone; tables use real `<th>`/scope; the approval control is a real button with `aria-describedby` naming the exact terms being approved; keyboard order follows reading order.

### Advantages
Strongest for judges who read: the decision, evidence and audit trail are legible in 60 seconds and printable. Best for COURT and CORRECTION, where the *record* is the product. Cheapest to build well — no custom charting, no canvas. Most honest about uncertainty.

### Disadvantages
Weakest at a glance for money: HAGGLE's financial impact is a table, not a picture — a judge skimming will miss the $998/year figure unless it is in the lede. Feels slow and formal for a fast-moving negotiation; the transcript view can feel like reading minutes. Least distinctive on a demo screen next to flashier entries — it wins on reading, not on first sight.

---

## Direction B — Premium operations workspace

### Philosophy
A trading floor for small businesses: dense, calm, precise. Every number earns its place, every number aligns, and the operator can see the state of the whole business in one screen without scrolling. Trust comes from precision — tabular numerals, aligned columns, explicit units, and a single accent colour that means "you can act here". This is the Linear / Stripe / Bloomberg lineage: restraint is the luxury.

### Colour palette
- Background `#F4F6F8` — app canvas
- Panel `#FFFFFF` — operational surfaces, 1px border `#D9DEE3`, radius 4px, no shadow (or 0 1px 2px rgba(15,27,45,.06))
- Ink `#0F1B2D` — headings, primary text
- Ink soft `#5A6B7F` — secondary text, labels
- Accent (action teal) `#0E7C6B` — primary actions, approved, live state only
- Danger `#B3261E` — cost increases, rejections (with text label, never colour alone)
- Warning `#8A6D00` on `#FFF3CD` — awaiting approval
- Brass (secondary accent) `#B9975B` — sparingly, for the CONVERGE wordmark and the "approved" stamp only
- All text ≥4.5:1. Green/red are two-state only (better/worse); a third state always gets a third visual (amber + label).

### Typography
- UI / headings: **Inter** (500/600/700) — compact, 12–13px body, 15–18px section headings, 11px uppercase labels (0.06em).
- Numbers: **IBM Plex Mono** (500, `font-variant-numeric: tabular-nums`) — *every* money, percentage, count and ID is mono and column-aligned. No proportional numerals in tables, ever.
- No display serif. Large type is reserved for the single hero number per screen (e.g. "+$0.48 / serving").

### Navigation architecture
Left sidebar 232px (collapses to 56px icons): Overview · Active Cases · Workflows · Evidence · Decisions · Activity · Settings, with a case-count badge on Active Cases. Top bar: breadcrumb, case search (⌘K), environment ("Demo — Mattermost connected" dot), user. Inside a case: horizontal tabs — Overview · Analysis · Negotiation · Evidence · Audit — with the current workflow stage as a 5-step stepper above the tabs (Draft → Investigating → Proposal → Awaiting approval → Approved).

### Dashboard
A **single-screen operations board**: KPI strip of exactly 4 (Active cases 6 · Awaiting approval 3 · Extra cost this month $83.20 · Decisions this week 4), then a dense cases table (Case / Workflow / Counterparty / Impact / Stage / Owner / Updated) with row click → case, then a two-column lower row: "Needs a decision today" (3 rows, with Approve buttons inline) and "Recent agent activity" (timestamped feed). No card grid; the table *is* the dashboard.

### Case workspace
Three columns at ≥1280px: (1) case summary + financials (left, 320px), (2) main work area — analysis and negotiation (centre, fluid), (3) participants + approvals + audit (right, 300px). Below 1280px the right rail becomes a tab; below 900px everything stacks. The hero number is the impact: "+$0.48 / serving · $998 / year" with a bullet graph (not a gauge/donut) showing food-cost % 28.6% → 31.6% against the 30% target band.

### Negotiation interface
A **timeline + terms table**. Top: horizontal timeline of offers (Old $0.16 → Proposed $0.24 → Counter $0.19 → Approved ?) with dates and authors. Below: a proposals table (Option / Price / Duration / Volume / Monthly impact / Status) where selecting a row recomputes the impact panel live and marks the recommendation. The Switch room is a compact, live-looking message list on the right of the timeline, with agent messages tagged `AGENT` and a visible mandate box: "Target $0.16 · Max $0.20 · Walk away > $0.20". Approval is a two-step control: select terms → "Approve $0.19 / 6 weeks" → confirm with the exact terms restated.

### Recipe comparison interface (COURT)
A **dense comparison matrix**: versions as columns, ingredients/steps as rows, differing cells highlighted with a thin left border + Δ value (e.g. salt: pinch / 1 tbsp / none). Blind scores are a small heat-table (readers × criteria, 1–5, with the disagreement row highlighted where scores differ by ≥2). The canonical recipe is a compact, printable summary panel with the winning version's values and the dissent as a one-line footnote.

### Evidence workspace
Evidence as a **filterable table**: ID / Type / Source / Date / Status / Cited in. Filters: All / Verified / Unverified / Disputed. Row expands inline to show the excerpt, provenance and citation list. Upload is a single "Add evidence" button with type + source required — no evidence without provenance.

### Switch integration experience
Switch is the **live operations channel**. A persistent "Rooms" section in the right rail lists the case's Mattermost rooms with live presence (who is online now), unread counts, and the agent's status (Investigating / Awaiting human / Proposal submitted). Clicking a room opens the transcript in a drawer with the room Instructions visible at the top. Connection state is explicit: green dot + "Connected — synced 2 min ago" or a plain-text offline notice with last sync time.

### Motion
Functional only: 150ms row hover, 200ms tab/step transitions, numbers update with a brief highlight (not a count-up). No entrance animations, no parallax. Charts redraw on data change, not on scroll.

### Responsive behaviour
≥1280px three columns; 900–1280px two columns (right rail → tab); <900px single column, sidebar becomes bottom nav, KPI strip becomes a 2×2 grid, tables scroll horizontally with sticky first column, approval button is sticky at the bottom. Touch targets ≥44px on mobile.

### Accessibility
Dense does not mean small: minimum 12px UI text at 4.5:1, 11px labels only for non-essential metadata and always ≥4.5:1; focus is a 2px teal outline; tables have `<caption>` and sortable headers with `aria-sort`; the stepper uses `aria-current="step"`; all charts have a text table alternative (the numbers are already in the table beside them); `prefers-reduced-motion` disables the highlight flash.

### Advantages
Best for HAGGLE — the flagship — and for a judge who wants to *operate* the product, not just read it. Highest information density per screen, fastest to scan, most "real product" feeling. The table-first grammar scales cleanly to all three workflows and to 20+ cases. Easiest to make responsive without redesigning.

### Disadvantages
Risks looking like every other premium SaaS dashboard (Stripe/Linear clone) unless the brass/teal discipline and the bullet-graph/terms-table details are kept strict. COURT and CORRECTION feel slightly cramped in a table grammar — a recipe is not a row, and a correction is a story. Density can tip into intimidation for a first-time user; the onboarding must teach the stepper, not the whole screen at once.

---

## Direction C — Collaborative spatial workspace

### Philosophy
A decision is a place, not a page. People and agents stand in a room together, evidence sits on the table where everyone can see it, and the workflow is a path you can walk — Intake → Investigate → Discuss → Propose → Approve — with each stage a visible station. Trust comes from *presence*: you can see who is here, what the agent is doing right now, and what is still unresolved. This is the FigJam / Miro lineage, disciplined into a product: spatial, but every node has a job.

### Colour palette
- Canvas `#EFEAE0` — warm paper canvas (flat, no gradient)
- Node (human) `#FFFFFF` — people, messages, evidence cards; 1px border `#D5CFC2`, radius 10px
- Node (agent) `#FFF8E6` — agent work, with a 2px left border in agent amber `#C98A1B`
- Ink `#22211E` — primary text
- Ink soft `#6B675E` — secondary text
- Accent (coral) `#D9552C` — the decision / approval action, used only there
- Accent 2 (violet) `#5B4CAD` — room links, connections between stages
- Presence colours (flat, labelled): owner `#0E7C6B`, supplier `#8A6D00`, analyst `#2F5D8A`, agent `#C98A1B` — always paired with a name label, never colour alone
- All text ≥4.5:1 on its node colour.

### Typography
- Display / headings: **Sora** (600/700) — room names, stage titles, the "CONVERGE" wordmark. Fallback: system-ui.
- Body / UI: **Inter** (400/500/600) — messages, evidence, labels.
- Numbers: **IBM Plex Mono** (500, tabular-nums) — money and IDs only, inside nodes.
- Scale: 13px body, 15px node titles, 20–24px stage titles, 11px uppercase stage labels. Generous line-height (1.6) because nodes are read at a glance, not scanned like tables.

### Navigation architecture
Top bar: workspace switcher · case search · presence strip (who is in this room now, with coloured dots + names). Left rail (200px): Rooms list grouped by workflow (HAGGLE / COURT / CORRECTION), each room with an unread dot and a stage pill. Centre: the canvas. Right rail (280px): Participants (humans + agents, with role and current activity) and Approvals. Navigation is *going to a room*, not opening a page — the URL is the room.

### Dashboard
Called **"The floor"**: a canvas overview showing all active cases as **rooms on a floor plan** — each case is a node sized by impact, positioned by stage (left = Intake, right = Approved), connected by a line to its Switch room. Clicking a room zooms into it. A small strip at the top answers the only dashboard question: "What needs a human today?" (3 rooms, with the decision each needs). No KPI tiles; impact is node size + a number inside the node.

### Case workspace
The case *is* a canvas: five stage stations left → right (Intake → Investigate → Discuss → Propose → Approve), connected by violet lines. Each station is a node containing its artefacts (e.g. Investigate holds the invoice + recipe + margin note; Propose holds the three options). The current station is outlined in coral and slightly larger. Below the canvas, a detail panel shows the selected node in full. Zoom controls (Fit / 100% / + / −) and a minimap are present; on a small screen the canvas becomes a vertical stepper (see Responsive).

### Negotiation interface
A **two-room map**: left room `#strategy` (private: owner + agents) and right room `#supplier-dairyco` (owner + supplier + agent), connected by a labelled arrow "Agent carries approved proposals only". Inside each room, messages are nodes on a vertical thread with presence dots showing who has read them. The owner drags (or clicks) a proposal from the strategy room across the arrow to send it — the crossing is the approval moment, and it is logged. Counter-offers arrive as a new node in the supplier room and are relayed as a linked node in the strategy room.

### Recipe comparison interface (COURT)
A **tasting table on the canvas**: three version nodes (Card / Auntie / Cousin) around a central "conflict" node listing the disagreements, with lines from each version to the variables it differs on. Blind tasting is enforced spatially: each reader gets their own coded-sample node that they cannot see the others' scores in until they submit — the canvas literally hides the other nodes until submission, then reveals the tally node in the centre. The canonical recipe is a final node at the right edge, with the dissenting version as a smaller node attached underneath it.

### Evidence workspace
Evidence is **objects on the table**: each evidence item is a node you can drag onto a stage, a claim, or a proposal to link it — the link is drawn as a line and listed in the evidence's "cited by" panel. Unlinked evidence sits in an "Unfiled" tray at the bottom and is visibly flagged ("3 items unfiled"). Provenance is a label on the node (source + date + status), not a separate page.

### Switch integration experience
Switch is **the architecture, not a feature**: every room on the canvas *is* a Switch/Mattermost room, with its real members, its real Instructions (shown when you click the room's "i"), and live presence. The agent appears as a distinct node/participant with a visible status ("Investigating — reading invoice E1") and a draft overlay: agent suggestions appear as amber-bordered draft nodes with Accept / Edit / Reject controls, never as finished text. If an agent is offline, its node is greyed with "Offline — last seen 14:02" — never hidden.

### Motion
Purposeful, spatial motion only: 250ms ease-out for zoom/pan, node selection, and the proposal crossing the room arrow; draft nodes fade in (200ms). No bounce, no decorative animation, no auto-play. All motion respects `prefers-reduced-motion` (instant state changes instead).

### Responsive behaviour
≥1100px: full canvas + both rails. 700–1100px: right rail becomes a bottom sheet; canvas pans horizontally. <700px: the canvas *becomes* a vertical stepper — stages stack top to bottom, rooms stack, the map becomes a list — because a spatial canvas is unusable on a phone. The phone view is a deliberate, different layout, not a squeezed canvas. Touch targets ≥44px; drag is replaced by tap-to-move on touch.

### Accessibility
The canvas is the hardest direction for accessibility, so it is designed for it from the start: every node is also a list item in a hidden-but-keyboard-reachable "List view" toggle (same content, linear order); arrow-key navigation moves between stages; screen-reader announcements on stage change ("Stage: Propose — 3 options, 1 awaiting approval"); focus is a 2px coral outline; colour is never the only signal (every presence dot has a name, every agent node has an "AGENT" label); zoom is capped so text never falls below 12px equivalent.

### Advantages
Most distinctive and most memorable in a demo — a judge will remember "the one with the rooms" when the other entries blur into dashboards. Best expresses what Switch actually *is* (rooms, people, agents together), so the Switch-centrality criterion is visible, not just claimed. Best for COURT (blind tasting as spatial hiding) and for showing multi-party negotiation as a map. Strongest for the "collaborative" story in the brief.

### Disadvantages
Highest build cost and highest risk: a canvas that is merely a prettier list will be judged as decoration, and a real canvas (pan/zoom, drag-to-link, minimap) is a week of work, not a day — in a ~26-hour hackathon it must be faked carefully (fixed layout, tap-to-move, no free drag) and that fakery must not be presented as real. Worst on mobile unless the vertical-stepper fallback is built properly. Density is lower than B — fewer cases per screen — and financial precision is harder to show in nodes than in tables.

---

## Comparison at a glance

| | A — Editorial | B — Operations | C — Spatial |
|---|---|---|---|
| Best for | COURT, CORRECTION, audit | HAGGLE, scale, ops | Switch story, COURT blind test, demo memorability |
| Reading style | Read top → bottom | Scan table → act | Walk the room → decide |
| Density | Low–medium | High | Medium (spatial) |
| Build cost (26h) | Low | Medium | High — fake the canvas honestly |
| Mobile | Excellent (stacks) | Good (tables scroll) | Needs a separate vertical layout |
| Judge's first impression | Serious, trustworthy | Professional, real product | Distinctive, memorable |
| Biggest risk | Looks slow / plain | Looks like Stripe/Linear clone | Canvas feels decorative |

## Recommendation — Direction B, Premium operations workspace

**Recommend B, with A's evidence discipline borrowed for the Decision/Audit views.**

Reasoning: the flagship is HAGGLE and the main track is Best Business Workflow. B is the only direction that makes the *money* legible in one screen — "+$0.48/serving, $998/year, food cost 28.6% → 31.6%" as a hero number with a bullet graph, a proposals table that recomputes live, and a terms timeline a judge can follow without reading prose. That is what the $2,000 track rewards: a practical workflow where people and agents get real work done, shown as an operable tool, not a document or a diorama.

B also has the best risk profile in ~26 hours: it is buildable in Next.js + TypeScript with tables, a stepper and a drawer — no canvas engine, no print-perfect typography system — and it scales to all three workflows without redesigning (COURT becomes a comparison matrix, CORRECTION becomes a claims table). Its main weakness (looking generic) is fixable within the direction: keep the teal + brass discipline, the 4px radius, the mono tabular numerals and the bullet graphs, and forbid card grids and gradients in the build — the prototypes already do this.

A is the right second choice and the right *borrow*: use A's numbered evidence (`[E1]`), its "decision as a signed sentence", and its margin-note treatment inside B's Evidence and Audit tabs, so B gains A's trust without losing its density. C is the most memorable but the riskiest: in the remaining time its canvas would have to be a fixed, tap-to-move facsimile, and a judge who tries to drag a node and finds it does not move will mark down technical execution — the criterion B is strongest on.

**If the user prefers A or C, that is a legitimate choice** — A if the story is "trustworthy record", C if the story is "Switch as a place". But on the brief as written (business workflow first, ~26h left, reproducibility judged), **B is the recommendation**.

*Prototypes: `direction-a.html`, `direction-b.html`, `direction-c.html` in `ui-directions/`. Each is self-contained HTML/CSS/JS, no external images, same HAGGLE demo numbers throughout.*

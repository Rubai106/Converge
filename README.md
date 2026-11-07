<div align="center">
  <h1>CONVERGE</h1>
  <p><strong>One human decision-maker. One AI teammate. Accountability always stays human.</strong></p>
  <p>A shared decision-resolution workspace for turning disagreement into evidence-backed, human-approved outcomes.</p>
  <p>
    <a href="#the-three-workflows">Workflows</a> ·
    <a href="#how-it-works">How it works</a> ·
    <a href="#run-locally">Run locally</a> ·
    <a href="#live-switch-and-ai-setup">Live integration</a> ·
    <a href="#security-and-deployment-readiness">Security & deployment</a>
  </p>
</div>

---

## What is CONVERGE?

CONVERGE is a collaborative decision-resolution platform built around a simple idea: **an AI teammate should help people make better decisions, not make consequential decisions for them.**

People already discuss supplier changes, family disagreements, and editorial corrections in chat. But the evidence gets scattered, assumptions go unchallenged, and the final decision is often difficult to verify later.

CONVERGE gives that work a shared structure. A human and an AI teammate investigate the issue, examine evidence, make disagreements explicit, compare proposals, and record the outcome. The facilitator can participate in a real Mattermost conversation through Switch, while the CONVERGE application provides the calculations, case workspace, approval flow, and audit history.

**The AI contributes analysis, calculations, questions, and proposals. A human retains authority over approvals and final decisions.**

> Most collaboration tools help people communicate. CONVERGE helps them reach an accountable decision.

## The three workflows

CONVERGE uses one decision engine across three applications. **HAGGLE is the flagship business workflow.** COURT and CORRECTION demonstrate how the same decision process can support other kinds of disagreement.

| Workflow | Who it serves | What it does |
|---|---|---|
| **HAGGLE** · Business | Independent restaurant and café owners | Analyses supplier price changes, calculates dish-level impact, compares negotiation strategies, and prepares terms for human approval. |
| **COURT** · Personal / creative | Families, cooking groups, and food communities | Compares competing recipe versions through coded blind ratings, makes disagreement visible, and records a human-selected canonical version while preserving dissent. |
| **CORRECTION** · Editorial | Independent podcasters and small editorial teams | Organises transcript claims, connects them to supplied evidence, records guest challenges, and supports a human-approved correction record. |

### HAGGLE — supplier negotiation

A supplier price increase can quietly erode a restaurant's margin. HAGGLE turns the price change into a decision the owner can evaluate.

- Enter supplier prices, ingredient usage per serving, menu price, sales volume, and the owner's target.
- Calculate cost per serving, food-cost percentage, gross margin, monthly and annual impact, and the maximum sustainable supplier price.
- Compare negotiation strategies using the same deterministic financial engine.
- Submit a specific proposal for approval. The owner approves or rejects it; the AI cannot approve it.

**Illustrative demo scenario:** heavy cream rises from $0.16 to $0.24 per fl oz. At six fl oz per Alfredo serving, the increase adds $0.48 per serving and $76.80 per month at 160 servings. A $0.18 counter-proposal would leave food cost at 29.38% and save $57.60 per month compared with $0.24. At a 30% food-cost target, the maximum sustainable price is approximately $0.1967 per fl oz.

These are fictional demonstration inputs, not a real supplier quote or a claim that a supplier accepted the proposal. Actual outputs are calculated from the case inputs.

### COURT — recipe deliberation

COURT helps a group compare versions of the same recipe without letting the loudest opinion automatically win.

- Compare ingredient and method differences in a conflict table.
- Rate coded samples without revealing the sample-to-recipe mapping before the tally is complete.
- Review reader-level scores, aggregate results, and disagreement.
- Let a human adopt the canonical version while preserving the alternatives and recorded dissent.

The seeded demonstration contains three recipe versions, three demo readers, and nine ratings. The panel illustrates a deliberation process; it is **not a statistically representative study**.

### CORRECTION — evidence-led editorial review

CORRECTION supports a transparent process when a guest challenges a statement in a transcript.

- Extract candidate factual claims from a transcript using rule-based logic.
- Separate factual assertions from opinions.
- Link claims to evidence supplied with the case.
- Record a guest challenge and an assessment for human review.
- Preserve the original claim while a human decides whether it is Verified, Corrected, Clarified, Disputed, or Unresolved.

CORRECTION is not an independent fact-checking service. Claim extraction is rule-based, evidence must be supplied, and a human remains responsible for editorial decisions.

## How it works

All three workflows use the same six-stage lifecycle:

~~~mermaid
flowchart LR
    A["1. Intake"] --> B["2. Evidence"]
    B --> C["3. Conflict"]
    C --> D["4. Proposal"]
    D --> E["5. Human approval"]
    E --> F["6. Audited resolution"]
~~~

1. **Intake** — create a case with the people, inputs, and decision that need attention.
2. **Evidence** — gather the relevant figures, versions, transcript material, and supplied sources.
3. **Conflict** — make differences, assumptions, and uncertainty explicit.
4. **Proposal** — calculate or draft options that can be evaluated.
5. **Human approval** — the responsible person decides. The agent cannot approve, adopt, or make a commitment.
6. **Audited resolution** — record the selected outcome and the history behind it.

## The AI teammate and the trust boundary

The facilitator is one registered Switch agent. Its facilitator, financial-analyst, researcher, challenger, and workflow-specialist roles are **internal reasoning lenses**, not separate independently authenticated agent accounts.

The runtime can read case context, use the restricted read/draft tool registry, create a reviewable draft, and post a validated informational reply under its own agent identity. It cannot use the human session, approve a proposal, adopt a recipe, change a claim status, or execute a supplier commitment.

The core safeguards are deliberate:

- **Deterministic financial calculations.** The engine computes all monetary and percentage figures. The language model drafts explanations around those values; it does not invent the numbers.
- **Structured model output.** Provider responses are checked against the expected schema before they are used.
- **Validated room replies.** Informational replies are checked for approval or commitment language, credential requests, supplier-contact instructions, and figures that do not match the engine context. Replies are idempotently associated with their source message.
- **Human-only decisions.** Mutating application endpoints require a session. Approval is bound to a specific proposal version and content hash; an agent has no approval tool.
- **Audit history.** State changes are recorded with actor information. The SHA-256 audit chain provides tamper evidence, not tamper-proof storage: an operator with write access could recompute the chain, and an independently anchored checkpoint is not yet implemented.

## Architecture

The application and the long-running agent runtime are separate Node.js processes. Switch provides the shared room and agent connection; Mattermost is the human-facing chat surface.

~~~mermaid
flowchart TB
    H["People"] <--> MM["Mattermost rooms"]
    MM <--> SW["Switch Core and Mattermost bridge"]
    SW <--> AR["CONVERGE agent runtime"]
    AR <--> LLM["Configured LLM provider"]
    AR --> VAL["Reply validation"]
    VAL --> SW
    AR <--> TOOLS["Read / draft tool registry"]
    TOOLS --> ENG["Deterministic decision engine"]

    B["Browser"] <--> APP["CONVERGE web app and Node.js API"]
    APP <--> ENG
    APP <--> SW
    APP <--> DATA[("Case data and audit history")]
    AR <--> AUX[("Draft and reply records")]
~~~

### Main components

| Component | Responsibility |
|---|---|
| **app/** | Browser interface: case workspace, workflow views, evidence, decisions, activity, and the Switch room drawer. |
| **server/server.js** | Node.js HTTP server, API routes, session handling, static app delivery, and Switch client integration. |
| **server/engine.js** | Deterministic HAGGLE calculations, workflow transitions, COURT tally, CORRECTION claim handling, and audit events. |
| **server/store.js** | Case persistence in the local JSON data store, with atomic writes and rotating backups. |
| **server/agent-runtime.js** | Persistent Switch connection, addressed-message routing, context gathering, drafting, and validated conversational replies. |
| **server/llm.js** | Provider adapter and structured-output validation for mock, OpenAI, and OpenAI-compatible providers. |
| **server/tools.js** | Restricted agent tool registry. The model receives read/draft capabilities, not approval or execution tools. |
| **server/drafts.js / server/replies.js** | Human-reviewable draft records and idempotent validated-reply records. |
| **tests/** | Unit, integration, security, accessibility, and browser-journey tests. |

## Technology

- **Runtime:** Node.js 22 or newer, ECMAScript modules.
- **Web application:** HTML, CSS, and browser JavaScript.
- **Server:** Node.js built-in HTTP and filesystem APIs. The app has no production npm runtime dependencies.
- **Collaboration:** Switch Core and its Mattermost bridge, with Mattermost as the chat interface.
- **AI:** provider-independent adapter for OpenAI and OpenAI-compatible chat-completion APIs. Cloudflare Workers AI can be configured through its OpenAI-compatible endpoint.
- **Persistence:** JSON files for the CONVERGE app's case, draft, and reply records. The Switch deployment has its own database and storage requirements.
- **Testing:** Node's built-in test runner, Playwright, and axe-core.

## Run locally

### Requirements

- Node.js **22+**
- npm
- Git

### Install and start the app

~~~bash
git clone https://github.com/Rubai106/accordweave.git
cd accordweave
npm ci

# Start the web app
npm start
~~~

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The app binds to loopback by default. If port 3000 is already in use, set another port before starting it.

**PowerShell (Windows):**

~~~powershell
$env:PORT = "3100"
npm start
~~~

**Bash (Linux / macOS):**

~~~bash
PORT=3100 npm start
~~~

### Run checks and tests

Playwright's Chromium browser is needed for the browser tests. Install it once:

~~~bash
npx playwright install chromium
~~~

Then run:

~~~bash
npm run check
npm test
~~~

The test suite uses isolated temporary case data. It does not need a live Switch server for the standard test run. The live Switch integration test is opt-in and runs only when its connection and credentials are configured.

### Default mode: labelled simulation

With SWITCH_BASE_URL unset, the app runs in **SIMULATED-STUB** mode. The room transcript is a labelled local simulation, not a real Mattermost room. This mode is useful for exploring the interface and running the app without a Switch deployment.

A missing LLM configuration is also explicit: the agent runtime does not produce live-model drafts or replies without a configured provider. The mock provider is for tests and explicit local development only; mock output must never be described as live AI output.

## Live Switch and AI setup

A real collaboration deployment needs three running pieces:

1. **Switch Core and Mattermost** — the Switch API, bridge, and Mattermost server must be running and healthy.
2. **CONVERGE web app** — the app must be configured with a real Switch Core API URL and agent credentials.
3. **CONVERGE agent runtime** — start this separately so it can maintain the long-lived connection, listen for addressed human messages, and respond in the correct rooms.

### Configure the web app

Set these environment variables in the process environment or your service manager. Do not put credentials in source control.

| Variable | Required | Meaning |
|---|---:|---|
| **PORT** | No | HTTP port for the CONVERGE app. Defaults to **3000**. |
| **SWITCH_BASE_URL** | For live Switch | **Switch Core API base URL**, not the Mattermost web URL and not the Gateway UI URL. |
| **SWITCH_AGENT_ID** | For live Switch | Registered facilitator agent ID. |
| **SWITCH_API_KEY** | For live Switch | Facilitator agent API key. Treat it as a secret. |
| **SWITCH_BRIDGE_ID** | No | Mattermost bridge ID. If omitted, the app attempts to use the default bridge. |
| **CONVERGE_DATA_FILE** | No | Path to the case JSON file. Defaults to data/converge.json. |

The app uses the real Switch path only when SWITCH_BASE_URL, SWITCH_AGENT_ID, and SWITCH_API_KEY are all present. Verify the result at GET /api/status; it should report REAL-SWITCH and a healthy Switch probe.

### Start the agent runtime

Run the runtime in a **separate terminal or managed process**:

~~~bash
node server/agent-runtime.js
~~~

The runtime uses the Switch credentials from SWITCH_AGENT_ID and SWITCH_API_KEY, or from a protected credentials file supplied through CONVERGE_AGENT_CREDENTIALS_FILE.

Set CONVERGE_ROOMS to a comma-separated list of the **actual room IDs in your Switch deployment**. Do not rely on the source-code defaults when setting up a new Switch installation; those IDs belong to a particular demo environment.

The runtime and web app must point to the same case-data file. The runtime reads the case store without mutating it; draft and reply records are written alongside it.

### Configure the language model

| Variable | Meaning |
|---|---|
| **CONVERGE_LLM_PROVIDER** | openai, openai-compatible, or mock. |
| **CONVERGE_LLM_API_KEY** | Provider API key. Never commit it or print it in logs. |
| **CONVERGE_LLM_BASE_URL** | Base URL for an OpenAI-compatible API. Defaults to the OpenAI API base URL. |
| **CONVERGE_LLM_MODEL** | Provider model identifier. |

For Cloudflare Workers AI, use the provider's OpenAI-compatible endpoint with CONVERGE_LLM_PROVIDER=openai-compatible, and set the account-specific base URL, API token, and model identifier from your Cloudflare account.

Conversational replies are enabled by default when a provider is configured. Set CONVERGE_REPLY_ENABLED=false to disable room replies while testing; drafts can still be generated for review. Enable replies only after confirming the provider, room mapping, and reply validation behaviour.

For the complete runtime lifecycle and Switch protocol notes, see [Agent Runtime](docs/AGENT-RUNTIME.md), [Architecture](docs/ARCHITECTURE.md), and [Setup](docs/SETUP.md).

## Data and persistence

The CONVERGE app currently uses local JSON files:

- **data/converge.json** — cases, proposals, approvals, messages, and audit events.
- **data/drafts.json** — agent drafts for human review.
- **data/replies.json** — validated conversational reply records.

These files are gitignored and created at runtime. Case data is written atomically with rotating backups. Draft and reply files also use atomic writes.

This design is suitable for a local or single-instance demonstration. It is **not a multi-instance database**: the app and runtime share files, and simultaneous read-modify-write operations can race. A production deployment needs durable shared persistence and appropriate concurrency control before scaling to multiple app or runtime instances.

## Security and deployment readiness

**The repository is not currently ready to be exposed as an unrestricted public service.** The local demo has deliberate constraints that must be addressed before a public cloud deployment:

- The server binds to 127.0.0.1 and the current origin/CORS policy is restricted to local origins.
- POST /api/session issues a single fixed demo identity (Mara · Owner). This is a demonstration session, not user authentication, multi-user identity, or role-based access control.
- The app's JSON file store is single-instance storage, not a horizontally scalable production database.
- Switch agent credentials and LLM API keys must be provided through a secure environment or secret manager and must never be committed.
- Public deployment needs real user authentication and authorization, configurable trusted origins, durable shared persistence, backups, monitoring, and deployment-level access controls.

The documented Switch setup is a self-hosted/local integration path. **A complete Cloudflare/VPS production deployment has not yet been implemented or validated in this repository.** Cloudflare Workers AI is a supported model-provider option; using it does not mean the CONVERGE application, Switch Core, or Mattermost are hosted on Cloudflare.

For Switch deployment reference material, see [Submission Setup Guide](submission/setup-guide.md), [Switch Deployment Notes](docs/switch-deployment.md), and [Switch Live Integration Record](docs/switch-live-integration.md).

## Demo data and evaluation boundaries

The seeded scenarios are fictional demonstrations:

- DairyCo and the supplier negotiation are fictional.
- The COURT readers and ratings are seeded demonstration data, not evidence of a user study.
- The CORRECTION transcript and supplied evidence are demo material, not independent verification of a real guest's claims.

The app's safeguards and workflows can be tested, but the seed data should not be presented as real customer outcomes, independent validation, or measured product impact.

## Repository guide

~~~text
accordweave/
├── app/                 # Browser application
├── server/              # API, decision engine, Switch client, AI runtime
├── tests/               # Automated tests
├── docs/                # Architecture, setup, security, and research notes
├── submission/          # Demo scripts, setup notes, and submission material
├── .env.example         # Variable names and empty example values
├── package.json
└── README.md
~~~

## Further documentation

- [Architecture](docs/ARCHITECTURE.md) — components, boundaries, and message flow.
- [Setup guide](docs/SETUP.md) — local setup and environment variables.
- [Agent runtime](docs/AGENT-RUNTIME.md) — persistent connection, message routing, and recovery.
- [Security](docs/SECURITY.md) — approval boundary, audit model, and limitations.
- [Positioning and differentiation](docs/positioning.md) — target users, value proposition, and honest competitive framing.
- [Judge scorecard](docs/JUDGE-SCORECARD.md) — evidence-based evaluation against the hackathon criteria.
- [Demo script](submission/demo-script.md) — the planned HAGGLE and COURT walkthrough.
- [Switch live integration notes](docs/switch-live-integration.md) — live protocol and local deployment record.

---

<div align="center">
  <strong>CONVERGE</strong><br>
  One human decision-maker. One AI teammate. Better-informed decisions, with accountability always human.
</div>

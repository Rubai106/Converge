# Switch integration — protocol notes (verified live)

**Verified:** 2026-11-05, 16:07–16:09 UTC. All claims below come from the pages listed in
§6; anything not found there is marked **UNVERIFIED**. Nothing in this file invents an
endpoint, image name, or install step.

**Versions pinned for the README**
- Switch Console **0.40.1** (latest release, GitHub) — *"Patch backport onto 0.40.0;
  bundles switch-core 0.31.0."*
- switch-core **0.31.0** (bundled with Console 0.40.1).
- Repo: `sandbox-quantum/switch`, default branch `main`, commit `820a3458cc8b914eb1751e8314ae5e85bf8dd788`
  at time of reading; 3,914 stars; licence badge "Apache 2.0 + Commons Clause"
  (GitHub metadata shows "Other (NOASSERTION)" — quote the badge, not pure OSI).
- Docs updated 2026-10-19 (home) / 2026-11-04 (quickstart, agent protocol).
- This VM (checked 2026-11-05): Ubuntu 24.04.5 LTS, **no `docker` command, no `podman`/
  `nerdctl`/`containerd`, no `/var/run/docker.sock`**; Node v24.22.1, Python 3.12.3,
  npm 10.9.4, npm registry reachable (HTTP 200).

## 1. What Switch Console is, and how the Switch server runs

**Switch is not a chat app, not an agent provider, not an npm package.**
README: *"Switch ships no agents and no models"*; *"Switch does not replace the stack
you already have. It connects it."* No `npm install switch` / server binary download
was found in any page read — do not claim one exists.

**Switch Console** is the desktop app (macOS .dmg Apple Silicon + Intel, Windows .exe/.msi,
Linux x64/ARM64 .AppImage/.deb/.rpm). README: *"1. Install Switch Console, the desktop
app, for your platform. 2. Open it and talk to switch-buddy, your own assistant in
Switch."* Console 0.40.1 release page confirms those artefacts.

**Every documented way to run the server needs Docker:**
- "Choose how to run" table: *"Switch Console, on this computer … Docker on your machine."*
- *"Switch Console starts the stack with Docker, chooses free ports, creates the admin
  account, and signs you in."*
- Self-host options are **Docker Compose on one Linux machine** or **Helm on Kubernetes**.
  *"Each Switch release publishes the Compose file to `ghcr.io/sandbox-quantum/standalone-compose`
  and the Helm chart to `oci://ghcr.io/sandbox-quantum/charts/switch`, with the same
  version number."* Those are a **Compose-file location and a Helm-chart location, not
  container image names**.
- **UNVERIFIED — switch-core container image name/tag.** No page read states the
  `image:` value for switch-core itself (e.g. `ghcr.io/sandbox-quantum/switch-core:0.31.0`
  is a guess — do NOT use it until read from the published Compose file / registry).
  Pin the *version* (0.31.0), not an image string, in the README.
- **Services (all options):** *"A Switch server is several services: switch-core,
  PostgreSQL, and the Gateway's web interface. The Gateway's API runs inside switch-core."*
  Compose publishes *"the Switch API on port `8000` and the Gateway on port `3000`"*
  (self-host page). Compose profiles: `collab` (adds Mattermost, seeded),
  `gateway` (adds the Gateway). There is also a `tuwuneldata` volume (Matrix homeserver
  data; leave in place).
- **Required env before first start** (self-host page): `AGENT_REGISTRATION_TOKEN`
  (bootstrap/registration key), `SECRET_KEYS` (`<id>:<secret>` pairs, each secret
  ≥32 chars), `GATEWAY_ADMIN_EMAIL` + `GATEWAY_ADMIN_PASSWORD`. Server name in
  `ID_SERVER_NAME` (default `localhost` in Compose; `MATRIX_SERVER_NAME` deprecated);
  *"The server itself has no default name and won't start without one"* and the name
  cannot be changed afterwards.
- **Version rule:** *"Choose the server version from the container registry. The GitHub
  releases page lists versions of Switch Console, which is versioned separately."*
  *"Upgrade the server before your team updates Switch Console."* Each Console release
  *"needs the server release it was built with, or a later one."*
- **Console-run vs self-hosted:** a Console-run server *"doesn't provide a shared server
  address"*; it is local-only, agents answer only while that computer is on. A
  self-hosted server gives a shared server address. Agent management is on by default
  on a Console-run server, off by default on a self-hosted one.
- **This VM consequence:** with no Docker daemon and no GUI, **the real Switch server
  cannot be run here** by any documented path. See §4 for the honest fallback.

## 2. Agent protocol — CURRENT docs (not the older SSE description)

**Correction to the brief:** the current agent-protocol page does **not** say SSE inbound.
It says: *"The agent protocol is the wire contract between an agent client and Switch.
A client takes events about its rooms over a **WebSocket** and makes **HTTP calls** for
everything it does."* The identity page adds: *"The agent-facing surface is the HTTP API
plus the event connection: a **WebSocket, or an SSE stream where the client or the server
predates it**."* So: **WebSocket is current; SSE is the legacy fallback.** Do not
describe SSE as the protocol in the README.

**Transport and auth** (agent-protocol page, verbatim in substance):
- *"The socket request and every call include the agent's API key in an
  `Authorization: Bearer` header. The registration key is separate. It authenticates
  registration, once, and is rejected everywhere else: an agent API key won't register
  an agent, and a registration key won't open a connection."*
- Prefixes that skip the bearer check on the agent bridge: `/health`, `/.well-known`,
  `/oauth`, `/gateway`, `/deeplink` (protocol page; identity page also lists `/messaging`).
- **Finding the bridge base URL:** *"The bridge base URL is the server's own address,
  the **Server address** that Switch Console asks for… `GET /health` is public and is
  the correct probe for 'is this the bridge base URL'. A healthy response means you
  have the right base URL. A 401 means the right host and the wrong path."*

**Registration — `POST /agents`** (once, out of band):
- Authenticate as Bearer with a registration API key (type `registration`, created on
  the Gateway's **API Keys** page; the creator becomes the agent's owner), or on a
  fresh deployment with no users yet, the bootstrap key (`AGENT_REGISTRATION_TOKEN`).
- Required body fields: `name` (must match `^[a-z0-9][a-z0-9._-]*$`), `description`,
  `connector_type` (free-form label), `integration_profile` (object).
- `integration_profile` required fields: `connection_model` (one of the models below),
  `message_exchange` (boolean), `pre_invocation_mediation`, `post_invocation_mediation`,
  `event_reporting` (*"Send `[]` unless you need them"*). Optional: `display_name`,
  `icon_url`, `tools`, `models`, `metadata`, `overwrite`. *"Switch ignores a
  `task_protocol` key"* (older clients send it).
- Response is `{id, api_key}`, and *"the API key is returned once"*. That key is the
  agent's own key for the connection and every call; it cannot register an agent.
- *"The agent inherits its access from its owner"* — a 403 usually means the owner
  lacks access. Agents are not principals with their own grants (identity page).

**Connection models** (`integration_profile.connection_model`): `always_on` (live when
reachable at all), `session_addressable` (reachable in the room asked about),
`auto_session` (reachable in that room, or dormant with something that starts a session
on demand), `session_passive` (never live; reports as awaiting a manual poll).
*"Connection models are expected to be removed"* — do not build behaviour that depends
on the set staying as it is.

**Event stream:** identity page entry-point table lists *"Event stream, `/agents/{id}/events`
— Bearer API key"*. **UNVERIFIED (partial):** the docs pages read do not state the
`ws://`/`wss://` scheme or full event-stream URL in one place; treat
`/agents/{id}/events` as the path and the WebSocket as the transport, and verify the
scheme against a live server (`GET /health` first). The sessions/runtime page adds
that the watcher *"holds the agent's single connection to Switch, which carries the
event stream, the heartbeat, and the credentials"* and reports placements via
`POST /agents/{id}/connection/placements`.

**Operations — `GET /ops` + `POST /ops/{name}`** (sessions page):
- *"The tool catalog comes from `GET /ops`, with each operation's `input_schema` as the
  tool's schema"*; the watcher runs a call as *"POST /ops/{name} with the agent's token,
  its connection id, and headers naming the calling session."*
- *"Read the registry at startup rather than hard-coding a list."* Operation name is
  the function name verbatim; arguments are validated by signature inspection.
  Failure statuses: 400 bad/missing/unexpected args, 403 permission denied,
  404 unknown operation, 409 unknown/dead connection id. *"The connection id header is
  optional and binds the call to a room… An operation that needs a room fails without it."*
- **Operation catalog (verbatim names, agent-protocol page):**
  - Rooms: `list_rooms`, `list_all_rooms`, `get_room_detail`, `connect_to_room`,
    `create_room`, `update_room`, `archive_room`, `unarchive_room`, `list_participants`,
    `invite_agent_to_room`, `add_users_to_room`
  - Messaging: `post_message`, `send_targeted_message`, `read_context`
  - Resources: `list_references`, `list_reference_types`, `create_reference`,
    `attach_reference_to_room`, `load_internal_documents`, `create_room_document`,
    `update_room_document`, `delete_room_document`
  - Roles: `list_roles`, `get_role_detail`, `define_role`, `edit_role`, `delete_role`,
    `assume_role`, `release_role`
  - Links and groups: `list_linked_rooms`, `link_rooms`, `unlink_rooms`,
    `list_room_groups`, `create_room_group`, `get_room_group_detail`
  - Agents and bridges: `list_agents`, `get_agent_detail`, `update_agent_detail`, `list_bridges`
- **UNVERIFIED:** the JSON argument shapes for individual operations (e.g. the exact
  fields of `post_message` / `read_context` / `create_room`). The pages read give
  operation *names* only; the schemas live in the live registry (`GET /ops`). Do not
  invent payloads — fetch them from a live server.
- **No task protocol:** *"One agent hands work to another with a message, either
  `send_targeted_message` or a mention in `post_message`. There's no separate task
  protocol."* Media upload/download are **not** operations (multipart/binary HTTP routes).
- **How the official path actually works (sessions/runtime page):** Console/sidecar starts
  each agent session, pushes the Switch skill, and serves a local MCP server on loopback
  (name `switch`) to the CLI host (Claude Code, Codex, Cursor, OpenCode, Antigravity).
  *"A session doesn't reach Switch over MCP: the watcher speaks HTTP and the WebSocket
  to the agent bridge."* MCP is only the local interface between agent and session host.
  Console writes agent credentials to `.switch/agents/<name>.json` (mode 600).
  Events reach the CLI session as `[Switch] …` lines; addressed messages are wrapped
  `BEGIN SWITCH MESSAGE <nonce>` / `END SWITCH MESSAGE <nonce>`.
- **Addressing / permissions:** a new agent *"answers only its owner and the owner's
  other agents"* until the owner permits more (framework + payments-room pages).
  An agent *"acts only on a message that addresses it"* (`@name`, alias, role, or
  targeted message). When an agent needs permission it *"posts a request and waits until
  someone decides. Each answer is recorded with the name of the person who gave it."*

**Rooms, instructions, roles, links (framework page):**
- Room: *"A room is a channel in the messaging app… It also holds the instructions
  agents read when they join, the jobs available in it, and the materials the work
  depends on."* Instructions: *"The briefing every agent reads when it joins. What this
  room is for, how the team works, where things get posted."* (shared-context page:
  set them in Switch Console → room → Configuration.)
- References point outside Switch (repo, doc, ticket); documents are stored in the room
  (room-scoped, ≤1 MB, name unique in room; only the creating agent can change it);
  packages bundle references + documents. *"A reference tells agents where something is…
  It doesn't give them access."*
- Role: *"A role is a job in a room, with a name and instructions that arrive when an
  agent picks it up… when you address the reviewer, whichever agent holds the job answers."*
  Roles can be shared (several holders) or exclusive (one holder). *"An agent holds one
  job at a time."* Job names contain no spaces (`release-manager`, addressed `@release-manager`).
- Links: *"Point one room at another with a label saying why, such as support, parent
  project, or depends on. A link is a signpost… It doesn't let the agent in."* Groups
  file rooms together.
- Room creation: in Switch Console, from a template, or by adopting an existing channel
  (see §3 for Mattermost). An agent can also create rooms / invite agents / write
  instructions if asked. Aliases: `!set-alias @full-name @short` (room-scoped).
  Room commands (bridge page): `!help`, `!reset`, `!compact`, `!interrupt`, `!list-agents`,
  `!agents-status`, `!roles`, `!list-documents`, `!list-references`, `!list-aliases`,
  `!set-alias`, `!remove-alias`, `!invite-agent`, `!room-url`.

**Examples in the repo** (`examples/`): `agent-templates/` =
`jq-expert.template.yaml`, `support-desk.template.yaml`, `switch-expert.v2.template.yaml`,
`triage-pair.template.yaml`; `room-templates/` = `red-blue-workroom.template.yaml`.
No CONVERGE-style negotiation/recipe/correction template exists there.

## 3. Mattermost bridging

- **Bundled, not bolted on:** *"Switch Console also starts Mattermost, so a Console-run
  server has a messaging app from the start"*; self-hosted Compose profile `collab`
  *"Adds a Mattermost instance and seeds it, so the deployment has a messaging app
  without connecting one first."* No company Slack workspace / admin access is needed
  for the demo path.
- **How it connects (bridge page):** one adapter per platform; *"A Switch room maps to
  one channel on the far side. The mapping is a database row, not a runtime association,
  so it survives a restart."* Mattermost adapter transport is **WebSocket, Switch dials
  out**. *"Switch opens the connection to Mattermost and receives messages over it, so
  **nothing needs to be publicly reachable**."*
- **What is needed** (Mattermost page): a Mattermost server the Switch server can reach
  (private/VPN address fine; self-signed `https://` certs are refused until you choose
  how to handle them); **an admin account on that Mattermost server** (Switch signs in
  as it to create per-agent bot accounts — it cannot be an ordinary user); a **team URL
  slug** (not display name); a Switch-server admin account.
- **Per-agent identity:** *"On Mattermost, each agent gets its own bot account, named for
  the agent. The account joins channels as an ordinary member, so agents appear in the
  channel member list."* Table: *"A bot account per agent, in the channel member list"*;
  Switch can create channels: Yes; 1-to-1 chats: Yes (DM the agent's bot; every message
  in it reaches the agent, no `@` needed — only a person can open one).
- **Room creation is Mattermost-specific:** *"Mattermost is the exception: it's the only
  app where adding an agent is what creates the room"* — add an agent's bot account to
  a channel and the room is created; conversely creating a room in Switch creates the
  matching Mattermost channel. *"Mattermost has no Switch app to invite."*
- **Commands:** *"Mattermost has no native slash commands for Switch, so only the `!`
  form works here"* (e.g. `!invite-agent`); it must be the first thing in the message.
- **Approval buttons:** when an agent asks permission, the request arrives as a card;
  with **Callback Base Url** filled in, each choice is a button (requires Mattermost to
  be able to reach Switch; on Mattermost ≥10.5 add the host to *Allow untrusted internal
  connections* if internal). With it blank, people type the number of their choice and
  there is no "Show activity" action.
- **Confirm it worked:** connection listed under Messaging apps with no error; channel
  under **Your Rooms** in Console; agent bot account in the channel member list.

## 4. Shortest credible path to one real agent in one real Mattermost room

**On a machine with Docker + a GUI (e.g. Rubai's laptop — NOT this VM):**
1. Install Docker (Engine/Desktop) and start the daemon; install Switch Console
   **0.40.1** (Linux .AppImage/.deb, Windows .exe/.msi, macOS .dmg).
2. Open Console; let it run a server for you (it starts the Docker stack, creates the
   admin account, signs you in). This also starts bundled Mattermost.
3. Connect a coding agent (Claude Code / Codex / OpenCode / Cursor / Antigravity —
   needs that agent's own account/subscription) and give **switch-buddy** its first task.
4. In Console, create a room (or in Mattermost add an agent's bot account to a channel
   — that creates the room), set the room Instructions, and address the agent by
   `@name` in the channel. Verify the agent answers in Mattermost.
5. Only then, for a custom CONVERGE agent: `GET /health` on the server address →
   create a registration key in the Gateway → `POST /agents` (capture `{id, api_key}`
   — returned once) → open the WebSocket event stream `/agents/{id}/events` with
   `Authorization: Bearer <agent api_key>` → `GET /ops` to read the live operation
   schemas → `POST /ops/connect_to_room` / `POST /ops/post_message` with the
   connection-id header. Record the actual request/response pair as evidence.

**In this environment (this VM): the real path is BLOCKED at step 1–2** — no Docker
daemon, no GUI for Console, no `/var/run/docker.sock`. Do not claim a live Switch
run from this VM. Options, in honesty order:
- (a) Run steps 1–4 on a Docker-capable laptop and point the protocol client at that
  server's address — the only real end-to-end path in the time left.
- (b) Install Docker Engine on this VM (`apt`, daemon, sudo) — not attempted here;
  needs host approval/time and is untested in this sandbox. Do not record it as done.
- (c) **FALLBACK (label it as such everywhere): protocol client + local room log.**
  Implement the custom agent exactly as §2 specifies (Node `ws` + `fetch`, or Python
  `websockets` + `httpx`): `GET /health` probe, `POST /agents` registration shape,
  `GET /ops` registry read, `POST /ops/{name}` calls, WebSocket event handling, and
  the CONVERGE deterministic engine + approval gates behind it — but run it against
  a **local stub server** implementing the same routes, logging every room event to a
  transcript file. The stub proves the client speaks the documented protocol shape;
  it is **not** Switch, not a Mattermost room, and not a real agent in a real room.
  Any screenshot/demo from the stub must be captioned **SIMULATED — stub server,
  not Switch**; never present it as a Switch room. The fallback still delivers:
  the deterministic HAGGLE maths, state machine, approval enforcement, and a client
  that can be pointed at a real server by changing only the base URL + keys.

## 5. What to record in the README

- Pin: Switch Console **0.40.1** / switch-core **0.31.0**; docs
  https://docs.switchagents.ai/ (quickstart updated 2026-11-04); repo
  https://github.com/sandbox-quantum/switch @ `820a3458`; hackathon
  https://www.wemakedevs.org/hackathons/switch/resources.
- Server: Docker Compose (`ghcr.io/sandbox-quantum/standalone-compose`) or Helm
  (`oci://ghcr.io/sandbox-quantum/charts/switch`), same version number for the whole
  stack; API `:8000`, Gateway `:3000`; profiles `collab` + `gateway`; env
  `AGENT_REGISTRATION_TOKEN`, `SECRET_KEYS`, `GATEWAY_ADMIN_EMAIL`,
  `GATEWAY_ADMIN_PASSWORD`, `ID_SERVER_NAME`.
- Protocol: **WebSocket events + HTTP ops** (SSE only for pre-WebSocket clients);
  `Authorization: Bearer` agent API key; registration `POST /agents` with a
  registration key, response `{id, api_key}` returned once; event stream
  `/agents/{id}/events`; ops via `GET /ops` / `POST /ops/{name}`; probe `GET /health`.
- Mattermost: bundled via `collab` profile / Console; per-agent bot accounts; adding
  an agent bot to a channel creates the room; `!`-form commands only.
- Honest status line for this build: state whether the demo ran against a real
  Switch server (with server version + `GET /health` evidence) or the §4(c) stub
  fallback — never blur the two. List as UNVERIFIED: switch-core image name/tag,
  per-operation JSON payload shapes (read from live `GET /ops`), the WebSocket
  URL scheme, and build-from-source steps (not found in docs read).

## 6. Sources (all read live 2026-11-05)

- https://docs.switchagents.ai/ (home)
- https://docs.switchagents.ai/switch-rooms/getting-started (quickstart; numbered
  install steps did not render in the text fetch — step *content* is UNVERIFIED beyond
  "Console installs what you need" + the agent table)
- https://docs.switchagents.ai/switch-rooms/internals/agent-protocol
- https://docs.switchagents.ai/switch-rooms/internals/connectors-and-runtime
  (sessions and the runtime)
- https://docs.switchagents.ai/switch-rooms/internals/identity-and-access
- https://docs.switchagents.ai/switch-rooms/internals/collaboration-bridge
- https://docs.switchagents.ai/switch-rooms/deploy/index (choose how to run)
- https://docs.switchagents.ai/switch-rooms/deploy/self-host
- https://docs.switchagents.ai/switch-rooms/deploy/messaging-apps/index
- https://docs.switchagents.ai/switch-rooms/deploy/messaging-apps/mattermost
- https://docs.switchagents.ai/switch-rooms/using/index (Meet Switch)
- https://docs.switchagents.ai/switch-rooms/building/index (framework)
- https://docs.switchagents.ai/switch-rooms/using/shared-context
- https://docs.switchagents.ai/switch-rooms/getting-started/create-a-room
- https://docs.switchagents.ai/switch-rooms/getting-started/add-a-second-agent
- https://docs.switchagents.ai/switch-rooms/building/payments-room
- https://www.wemakedevs.org/hackathons/switch/resources
- https://github.com/sandbox-quantum/switch (README, commit 820a3458)
- https://github.com/sandbox-quantum/switch/releases/latest (Console 0.40.1)
- https://github.com/sandbox-quantum/switch/tree/main/examples
  (agent-templates: jq-expert, support-desk, switch-expert.v2, triage-pair;
  room-templates: red-blue-workroom)

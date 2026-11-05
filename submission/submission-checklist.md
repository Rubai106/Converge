# CONVERGE — Submission checklist

Hackathon: WeMakeDevs Flip the Switch 2026 — https://www.wemakedevs.org/hackathons/switch
Deadline: Nov 7 2026, 11:59 PM IST / Nov 8, 12:29 AM Bangladesh time
Tracks: Best Business Workflow ($2,000) + Code with Wispr ($500, side track)
Repo (canonical): https://github.com/Rubai106/accordweave (public, main)

## Done
- [x] Shared decision engine + HAGGLE end-to-end (tests 12/12, check passes)
- [x] COURT + CORRECTION slices, both server-persisted and audited
- [x] Switch protocol client + labelled SIMULATED stub (protocol verified from official docs/repo; no live server yet)
- [x] Premium Direction B UI built and verified (screenshots read clean)
- [x] README, architecture, setup guide, demo script, PROGRESS.md
- [x] Competitor validation + Switch protocol notes + UI/UX directions (3)
- [x] Official GitHub repo connected; first push verified on GitHub (commit a50f5a7, 28 files)
- [x] App screenshots captured locally — 4 premium submission assets in submission/screenshots/ (see its README); 3 temp-UI shots archived, not for submission

## Still needed
- [ ] Genuine Switch deployment on this VM (Docker install in progress → official Compose stack 0.31.0, collab + gateway, bundled Mattermost) → GET /health evidence, real agent registration, real HAGGLE room + message in Mattermost
- [ ] PNG screenshots uploaded to the repo (blocked: the available GitHub integration is text-only; no create_blob/create_tree/create_commit/update_ref tools, and plain git push cannot authenticate from this VM — see PROGRESS.md "GitHub sync strategy")
- [ ] Wispr Flow: dictate through Wispr during the remaining build; capture the genuine Insights scorecard screenshot → submission/wispr/ (never fake it)
- [ ] Demo video (~3 min, follow submission/demo-script.md)
- [ ] Final submission on the hackathon page (Rubai submits; include live/repo links, README, demo video, Wispr scorecard)
- [ ] 2-minute phone check of the final build before submitting

## Do not include
- Fake Switch screenshots (stub shots must be captioned SIMULATED)
- Fake Wispr screenshot or invented usage numbers
- Sofra / Happi Happi as competitors (not found)
- "First ever" claims (see docs/competitor-validation.md)
- The Oct 30 PayCheckpoint draft deck or any other project's artifacts

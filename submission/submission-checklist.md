# CONVERGE — Submission checklist

Hackathon: WeMakeDevs Flip the Switch 2026 — https://www.wemakedevs.org/hackathons/switch
Deadline: Nov 7 2026, 11:59 PM IST / Nov 8, 12:29 AM Bangladesh time
Tracks: Best Business Workflow ($2,000) + Code with Wispr ($500, side track)
Repo (canonical): https://github.com/Rubai106/accordweave (public, main)

## Done
- [x] Shared decision engine + HAGGLE end-to-end (tests 20/20, check passes)
- [x] COURT + CORRECTION slices, both server-persisted and audited
- [x] **Real Switch integration (2026-11-06): switch-core 0.31.0 + Mattermost 11.9.0 live on this VM** — `GET /health` 200 `{"status":"ok"}`, `/health/ready` all healthy; agent converge-facilitator registered; 53 live per-agent ops; Mattermost bridge active; 3 real rooms; HAGGLE approval completed end to end in the real room (see docs/switch-live-integration.md + submission/evidence/switch-live/)
- [x] CONVERGE app wired to the real server (REAL-SWITCH mode; /api/status live health; /api/switch/rooms lists the 3 real rooms)
- [x] Premium Direction B UI built and verified (screenshots read clean)
- [x] README, architecture, setup guide, demo script, PROGRESS.md
- [x] Competitor validation + Switch protocol notes + UI/UX directions (3)
- [x] Official GitHub repo connected; pushes verified on GitHub (a50f5a7, 4e72071, ac9caef — 35 files incl. Switch evidence)
- [x] App screenshots captured locally — 4 premium submission assets in submission/screenshots/ (see its README); 3 temp-UI shots archived, not for submission

## Still needed
- [x] Fresh live screenshots + demo video — 7 live screenshots in submission/screenshots/ (REAL-SWITCH mode, LIVE room banner) + `submission/demo/converge-demo.mp4` (147.8s, 1440×900, section titles burned in), captured from the live app
- [ ] PNG screenshots + demo video uploaded to the repo (blocked: the available GitHub integration is text-only; no create_blob/create_tree/create_commit/update_ref tools, and plain git push cannot authenticate from this VM — see PROGRESS.md "GitHub sync strategy")
- [ ] Wispr Flow: dictate through Wispr during the remaining build; capture the genuine Insights scorecard screenshot → submission/wispr/ (never fake it)
- [ ] Final submission on the hackathon page (Rubai submits; include live/repo links, README, demo video, Wispr scorecard)
- [ ] 2-minute phone check of the final build before submitting

## Do not include
- Fake Switch screenshots (stub shots must be captioned SIMULATED)
- Fake Wispr screenshot or invented usage numbers
- Sofra / Happi Happi as competitors (not found)
- "First ever" claims (see docs/competitor-validation.md)
- The Oct 30 PayCheckpoint draft deck or any other project's artifacts

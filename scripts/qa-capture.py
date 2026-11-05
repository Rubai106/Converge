"""CONVERGE QA screenshot capture — every required screen, from the real app.

Production instance: http://localhost:3100 (REAL-SWITCH) — READ-ONLY browsing.
QA instance:         http://localhost:3200 (SIMULATED-STUB, own disposable data)
                     — approval / challenge / rating flows run here only.
Mattermost:          http://localhost:8065 (real channel, login read from
                     ~/workspace/switch-server/.env at runtime; never printed
                     or written into the repo).

Outputs: ~/workspace/converge/submission/qa/screenshots/NN-name.png
         ~/workspace/converge/submission/qa/responsive/*.png
A QA log with overflow/console-error notes is written next to the shots.
"""
import json, os, re, time
from playwright.sync_api import sync_playwright

PROD = "http://localhost:3100"
QA = "http://localhost:3200"
MM = "http://localhost:8065"
OUT = "/home/hatch/workspace/converge/submission/qa/screenshots"
RESP = "/home/hatch/workspace/converge/submission/qa/responsive"
os.makedirs(OUT, exist_ok=True)
os.makedirs(RESP, exist_ok=True)

LOG = []
def note(msg):
    LOG.append(msg)
    print(msg)

def check_page(page, name):
    """Overflow + console-error + page-error check for the current page."""
    try:
        overflow = page.evaluate(
            "() => document.documentElement.scrollWidth > window.innerWidth + 1")
        if overflow:
            note(f"  !! H-OVERFLOW on {name}: scrollWidth exceeds viewport")
        else:
            note(f"  ok no h-overflow: {name}")
    except Exception as e:
        note(f"  ?? overflow check failed on {name}: {e}")

def shot(page, name, full=False):
    page.screenshot(path=f"{OUT}/{name}", full_page=full)
    note(f"shot: {name}")

def goto(page, url, wait="#view, #nav-case-count", timeout=15000):
    page.goto(url)
    if wait:
        page.wait_for_selector(wait, timeout=timeout)
    time.sleep(1.2)

def click_nav(page, view):
    page.click(f'[data-view="{view}"]')
    time.sleep(1.0)

def tab(page, name):
    page.click(f'[data-tab="{name}"]')
    time.sleep(1.0)

def mm_env():
    env = {}
    for line in open('/home/hatch/workspace/switch-server/.env'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k] = v
    return env

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    # ---------------- GROUP A — main application (production) ----------------
    goto(page, PROD + "/")
    shot(page, "01-overview-dashboard.png")
    check_page(page, "01 dashboard")
    click_nav(page, "cases")
    shot(page, "02-active-cases.png")
    check_page(page, "02 cases")
    click_nav(page, "workflows")
    shot(page, "03-workflows.png")
    check_page(page, "03 workflows")
    click_nav(page, "evidence")
    shot(page, "04-evidence.png")
    check_page(page, "04 evidence")
    click_nav(page, "decisions")
    shot(page, "05-decisions.png")
    check_page(page, "05 decisions")
    click_nav(page, "activity")
    shot(page, "06-activity.png")
    check_page(page, "06 activity")
    click_nav(page, "settings")
    shot(page, "07-settings.png")
    check_page(page, "07 settings")

    # ---------------- GROUP B — HAGGLE (production, COMPLETED) ----------------
    goto(page, PROD + "/?case=HAG-014")
    page.wait_for_selector(".tab", timeout=15000)
    shot(page, "08-haggle-overview.png")
    check_page(page, "08 haggle overview")
    # bullet graph lives in the overview summary; scroll to it for #10
    page.evaluate("() => { const el = document.querySelector('.bullet-wrap'); if (el) el.scrollIntoView({block:'center'}); }")
    time.sleep(0.8)
    shot(page, "10-haggle-cost-viz.png")
    tab(page, "analysis")
    shot(page, "09-haggle-analysis.png")
    check_page(page, "09 haggle analysis")
    tab(page, "negotiation")
    shot(page, "11-haggle-strategies.png")
    check_page(page, "11 haggle strategies")
    # impact panel for the selected counter-019 proposal
    page.evaluate("() => { const el = document.querySelector('#impact-panel'); if (el) el.scrollIntoView({block:'center'}); }")
    time.sleep(0.8)
    shot(page, "12-haggle-proposal.png")
    # mandate box is in the overview summary
    goto(page, PROD + "/?case=HAG-014")
    page.wait_for_selector(".tab", timeout=15000)
    page.evaluate("() => { const el = document.querySelector('.mandate-box'); if (el) el.scrollIntoView({block:'center'}); }")
    time.sleep(0.8)
    shot(page, "13-haggle-mandate.png")
    # live room drawer
    page.click("[data-room-btn]")
    page.wait_for_selector("#room-drawer:not([hidden])", timeout=10000)
    time.sleep(1.0)
    shot(page, "14-haggle-room.png")
    check_page(page, "14 haggle room")
    page.keyboard.press("Escape")
    time.sleep(0.5)
    tab(page, "negotiation")
    shot(page, "18-haggle-completed.png")
    tab(page, "audit")
    shot(page, "19-haggle-audit.png")
    check_page(page, "19 haggle audit")

    # ---------------- GROUP C — COURT (production) ----------------
    goto(page, PROD + "/?case=CRT-007")
    page.wait_for_selector(".tab", timeout=15000)
    shot(page, "20-court-overview.png")
    check_page(page, "20 court overview")
    tab(page, "analysis")
    shot(page, "22-court-matrix.png")
    check_page(page, "22 court matrix")
    # versions list is in the overview summary; re-capture overview scrolled
    goto(page, PROD + "/?case=CRT-007")
    page.wait_for_selector(".tab", timeout=15000)
    page.evaluate("() => { const el = document.querySelector('#court-sum-h'); if (el) el.scrollIntoView({block:'center'}); }")
    time.sleep(0.8)
    shot(page, "21-court-versions.png")
    # blind instructions + heat table
    goto(page, PROD + "/?case=CRT-007&tab=analysis")
    page.wait_for_selector(".tab", timeout=15000)
    page.evaluate("() => { const el = document.querySelector('#blind-h'); if (el) el.scrollIntoView({block:'center'}); }")
    time.sleep(0.8)
    shot(page, "23-court-blind-instructions.png")
    shot(page, "24-court-rating.png")
    # disagreement: switch to S2 (texture range 2 -> DISAGREE tag)
    page.click('[data-sample="S2"]')
    time.sleep(1.0)
    shot(page, "27-court-disagreement.png")
    # tally + dissent at the bottom of the analysis tab
    page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(0.8)
    shot(page, "26-court-tally.png")
    shot(page, "28-court-canonical.png")
    check_page(page, "28 court canonical")

    # ---------------- GROUP D — CORRECTION (production) ----------------
    goto(page, PROD + "/?case=COR-003")
    page.wait_for_selector(".tab", timeout=15000)
    shot(page, "29-correction-overview.png")
    check_page(page, "29 correction overview")
    tab(page, "analysis")
    shot(page, "30-correction-transcript.png")
    shot(page, "31-correction-claims.png")
    check_page(page, "31 correction claims")
    tab(page, "evidence")
    shot(page, "33-correction-evidence.png")
    tab(page, "audit")
    shot(page, "37-correction-audit.png")
    check_page(page, "37 correction audit")

    # ---------------- GROUP E — Switch status ----------------
    # The Switch gateway serves the Console UI on :3000 — the real server's
    # own dashboard is the honest REAL-SWITCH status screen.
    page.goto("http://localhost:3000/")
    time.sleep(2.5)
    shot(page, "38-switch-status.png")
    check_page(page, "38 gateway")

    note(f"console errors on production pages: {len(errors)}")
    for e in errors[:10]:
        note(f"  console: {e}")
    ctx.close()

    # ---------------- QA INSTANCE FLOWS (destructive — stub mode) ----------------
    ctx2 = browser.new_context(viewport={"width": 1440, "height": 900})
    q = ctx2.new_page()
    qerrs = []
    q.on("console", lambda m: qerrs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    q.on("pageerror", lambda e: qerrs.append(f"pageerror: {e}"))

    # Approval flow on QA HAG-014 (pristine AWAITING_APPROVAL)
    goto(q, QA + "/?case=HAG-014&tab=negotiation")
    q.wait_for_selector(".tab", timeout=15000)
    q.click("#approve-btn")
    q.wait_for_selector("#modal-backdrop:not([hidden])", timeout=10000)
    time.sleep(0.8)
    shot(q, "16-approval-modal.png")
    check_page(q, "16 approval modal")
    q.click("#modal-confirm")
    q.wait_for_selector(".approve-stamp, .decision-sentence", timeout=15000)
    time.sleep(1.0)
    shot(q, "17-approval-success.png")
    # duplicate approval attempt via API (button is gone by design)
    dup = q.evaluate("""async () => {
      const r = await fetch('/api/cases/HAG-014/transition', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({to:'APPROVED', actor:'Mara (owner)', actorKind:'human'})});
      return {status: r.status, body: await r.text()};
    }""")
    note(f"duplicate approval on QA HAG-014: HTTP {dup['status']} -> {dup['body'][:120]}")
    # agent approval attempt via API on QA HAG-QA (DISCUSSION -> invalid) and on QA HAG-014 (COMPLETED -> invalid)
    ag = q.evaluate("""async () => {
      const r = await fetch('/api/cases/HAG-014/transition', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({to:'APPROVED', actor:'Facilitator Agent', actorKind:'agent'})});
      return {status: r.status, body: await r.text()};
    }""")
    note(f"agent approval on QA HAG-014: HTTP {ag['status']} -> {ag['body'][:120]}")

    # COURT hidden tally on QA CRT-QA (4 of 9 ratings)
    goto(q, QA + "/?case=CRT-QA&tab=analysis")
    q.wait_for_selector(".tab", timeout=15000)
    shot(q, "25-court-blind-hidden.png")
    check_page(q, "25 court hidden tally")
    # duplicate rating attempt via API
    dupr = q.evaluate("""async () => {
      const r = await fetch('/api/court/rate', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({caseId:'CRT-QA', reader:'Reader A', sampleCode:'S1', scores:{taste:5,texture:4,aroma:5,appearance:4,difficulty:3,overall:5}})});
      return {status: r.status, body: await r.text()};
    }""")
    note(f"duplicate rating on QA CRT-QA: HTTP {dupr['status']} -> {dupr['body'][:120]}")
    # invalid rating (out of range)
    invr = q.evaluate("""async () => {
      const r = await fetch('/api/court/rate', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({caseId:'CRT-QA', reader:'Reader C', sampleCode:'S3', scores:{taste:9,texture:4,aroma:5,appearance:4,difficulty:3,overall:5}})});
      return {status: r.status, body: await r.text()};
    }""")
    note(f"invalid rating (taste 9) on QA CRT-QA: HTTP {invr['status']} -> {invr['body'][:120]}")

    # CORRECTION flow on QA COR-QA
    goto(q, QA + "/?case=COR-QA&tab=negotiation")
    q.wait_for_selector(".tab", timeout=15000)
    q.click('[data-challenge="C1"]')
    q.wait_for_selector("#challenge-form", timeout=10000)
    time.sleep(0.6)
    shot(q, "32-correction-challenge.png")
    check_page(q, "32 correction challenge")
    q.fill("#challenge-text", "Survey was co-led with Dr Chen")
    q.select_option("#challenge-ev", "E1")
    q.click("#challenge-form button[type='submit']")
    q.wait_for_selector('.challenge-note', timeout=10000)
    time.sleep(0.8)
    shot(q, "34-correction-status.png")
    # agent status-change attempt via API (must fail)
    agc = q.evaluate("""async () => {
      const r = await fetch('/api/correction/claim', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({caseId:'COR-QA', id:'C2', status:'Verified', actor:'Verification Agent', actorKind:'agent'})});
      return {status: r.status, body: await r.text()};
    }""")
    note(f"agent claim-status change on QA COR-QA: HTTP {agc['status']} -> {agc['body'][:120]}")
    # host approves the correction
    q.click('[data-approve-claim="C1"]')
    q.wait_for_selector("#err-h", timeout=10000)
    time.sleep(0.8)
    shot(q, "35-correction-approval.png")
    page2 = q
    page2.evaluate("() => { const el = document.querySelector('#err-h'); if (el) el.scrollIntoView({block:'center'}); }")
    time.sleep(0.8)
    shot(q, "36-correction-errata.png")
    tab(q, "audit")
    shot(q, "37b-correction-audit-qa.png")
    note(f"console errors on QA pages: {len(qerrs)}")
    for e in qerrs[:10]:
        note(f"  console: {e}")
    ctx2.close()

    # ---------------- GROUP E — Mattermost (real channel) ----------------
    env = mm_env()
    mctx = browser.new_context(viewport={"width": 1440, "height": 900})
    m = mctx.new_page()
    m.goto(MM + "/login")
    m.wait_for_selector("#input_loginId", timeout=15000)
    m.fill("#input_loginId", "user")
    m.fill("#input_password", env["MATTERMOST_USER_PASSWORD"])
    m.click("#saveSetting")
    m.wait_for_selector("#sidebar-left, .sidebar--left, #channel-header", timeout=20000)
    time.sleep(2)
    m.goto(MM + "/switch/channels/haggle-dairyco")
    m.wait_for_selector(".post__body", timeout=20000)
    time.sleep(2)
    # channel header / members
    m.screenshot(path=f"{OUT}/39-mattermost-agent.png")
    note("shot: 39-mattermost-agent.png")
    # scroll to the agent analysis message
    m.evaluate("() => { const els=[...document.querySelectorAll('.post__body')]; const t=els.find(e=>e.textContent.includes('CONVERGE HAGGLE analysis')); if(t) t.scrollIntoView({block:'center'}); }")
    time.sleep(0.8)
    m.screenshot(path=f"{OUT}/40-agent-message.png")
    note("shot: 40-agent-message.png")
    # scroll to the owner approval
    m.evaluate("() => { const els=[...document.querySelectorAll('.post__body')]; const t=els.find(e=>e.textContent.includes('Approved: accept the DairyCo counter')); if(t) t.scrollIntoView({block:'center'}); }")
    time.sleep(0.8)
    m.screenshot(path=f"{OUT}/41-human-response.png")
    note("shot: 41-human-response.png")
    # full discussion, scrolled to top
    m.evaluate("() => window.scrollTo(0,0)")
    time.sleep(0.8)
    m.screenshot(path=f"{OUT}/42-haggle-discussion.png", full_page=True)
    note("shot: 42-haggle-discussion.png (full page)")
    mctx.close()

    # ---------------- GROUP F — mobile (production, 390x844) ----------------
    mctx2 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    mo = mctx2.new_page()
    goto(mo, PROD + "/")
    mo.screenshot(path=f"{OUT}/mobile-01-dashboard.png")
    note("shot: mobile-01-dashboard.png")
    check_page(mo, "mobile dashboard")
    goto(mo, PROD + "/?case=HAG-014")
    mo.wait_for_selector(".tab", timeout=15000)
    mo.screenshot(path=f"{OUT}/mobile-02-haggle.png")
    note("shot: mobile-02-haggle.png")
    check_page(mo, "mobile haggle")
    mo.click("[data-room-btn]")
    mo.wait_for_selector("#room-drawer:not([hidden])", timeout=10000)
    time.sleep(0.8)
    mo.screenshot(path=f"{OUT}/mobile-03-room.png")
    note("shot: mobile-03-room.png")
    check_page(mo, "mobile room")
    mo.keyboard.press("Escape")
    goto(mo, PROD + "/?case=CRT-007")
    mo.wait_for_selector(".tab", timeout=15000)
    mo.screenshot(path=f"{OUT}/mobile-04-court.png")
    note("shot: mobile-04-court.png")
    check_page(mo, "mobile court")
    goto(mo, PROD + "/?case=COR-003")
    mo.wait_for_selector(".tab", timeout=15000)
    mo.screenshot(path=f"{OUT}/mobile-05-correction.png")
    note("shot: mobile-05-correction.png")
    check_page(mo, "mobile correction")
    mctx2.close()

    # ---------------- Responsive set ----------------
    for w, h, label in [(1920, 1080, "1920x1080"), (1366, 768, "1366x768"),
                        (1280, 800, "1280x800"), (1024, 768, "1024x768"),
                        (768, 1024, "768x1024"), (430, 932, "430x932"),
                        (375, 812, "375x812")]:
        rctx = browser.new_context(viewport={"width": w, "height": h})
        rp = rctx.new_page()
        rp.goto(PROD + "/")
        rp.wait_for_selector("#nav-case-count", timeout=15000)
        time.sleep(1.0)
        rp.screenshot(path=f"{RESP}/dashboard-{label}.png")
        note(f"shot: responsive dashboard-{label}.png")
        ov = rp.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1")
        note(f"  {'!! H-OVERFLOW' if ov else 'ok no h-overflow'}: dashboard {label}")
        rp.goto(PROD + "/?case=HAG-014")
        rp.wait_for_selector(".tab", timeout=15000)
        time.sleep(1.0)
        rp.screenshot(path=f"{RESP}/haggle-{label}.png")
        note(f"shot: responsive haggle-{label}.png")
        ov2 = rp.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1")
        note(f"  {'!! H-OVERFLOW' if ov2 else 'ok no h-overflow'}: haggle {label}")
        rctx.close()

    browser.close()
    with open("/home/hatch/workspace/converge/submission/qa/capture-log.txt", "w") as f:
        f.write("\n".join(LOG))
    note("CAPTURE DONE")

"""CONVERGE QA capture, part 2 — Mattermost, mobile, responsive.

Mattermost shows a "View in Desktop App or Browser" interstitial first;
click "View in Browser" before the login form appears.
"""
import os, time
from playwright.sync_api import sync_playwright

PROD = "http://localhost:3100"
MM = "http://localhost:8065"
OUT = "/home/hatch/workspace/converge/submission/qa/screenshots"
RESP = "/home/hatch/workspace/converge/submission/qa/responsive"
os.makedirs(OUT, exist_ok=True)
os.makedirs(RESP, exist_ok=True)

LOG = []
def note(msg):
    LOG.append(msg); print(msg)

def check_page(page, name):
    try:
        overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1")
        note(f"  {'!! H-OVERFLOW on ' + name if overflow else '  ok no h-overflow: ' + name}")
    except Exception as e:
        note(f"  ?? overflow check failed on {name}: {e}")

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

    # ---------------- GROUP E — Mattermost (real channel) ----------------
    env = mm_env()
    mctx = browser.new_context(viewport={"width": 1440, "height": 900})
    m = mctx.new_page()
    m.goto(MM + "/login")
    m.wait_for_selector("text=View in Browser", timeout=20000)
    m.click("text=View in Browser")
    m.wait_for_selector("#input_loginId", timeout=20000)
    m.fill("#input_loginId", "user")
    m.fill("#input_password-input", env["MATTERMOST_USER_PASSWORD"])
    m.click("#saveSetting")
    m.wait_for_selector("#sidebar-left, .sidebar--left, #channel-header", timeout=25000)
    time.sleep(2)
    m.goto(MM + "/switch/channels/haggle-dairyco")
    m.wait_for_selector(".post__body", timeout=25000)
    time.sleep(2)
    m.screenshot(path=f"{OUT}/39-mattermost-agent.png")
    note("shot: 39-mattermost-agent.png")
    m.evaluate("() => { const els=[...document.querySelectorAll('.post__body')]; const t=els.find(e=>e.textContent.includes('CONVERGE HAGGLE analysis')); if(t) t.scrollIntoView({block:'center'}); }")
    time.sleep(0.8)
    m.screenshot(path=f"{OUT}/40-agent-message.png")
    note("shot: 40-agent-message.png")
    m.evaluate("() => { const els=[...document.querySelectorAll('.post__body')]; const t=els.find(e=>e.textContent.includes('Approved: accept the DairyCo counter')); if(t) t.scrollIntoView({block:'center'}); }")
    time.sleep(0.8)
    m.screenshot(path=f"{OUT}/41-human-response.png")
    note("shot: 41-human-response.png")
    m.evaluate("() => window.scrollTo(0,0)")
    time.sleep(0.8)
    m.screenshot(path=f"{OUT}/42-haggle-discussion.png", full_page=True)
    note("shot: 42-haggle-discussion.png (full page)")
    mctx.close()

    # ---------------- GROUP F — mobile (production, 390x844) ----------------
    mctx2 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    mo = mctx2.new_page()
    mo.goto(PROD + "/")
    mo.wait_for_selector("#view", timeout=15000)
    time.sleep(1.2)
    mo.screenshot(path=f"{OUT}/mobile-01-dashboard.png")
    note("shot: mobile-01-dashboard.png")
    check_page(mo, "mobile dashboard")
    mo.goto(PROD + "/?case=HAG-014")
    mo.wait_for_selector(".tab", timeout=15000)
    time.sleep(1.0)
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
    mo.goto(PROD + "/?case=CRT-007")
    mo.wait_for_selector(".tab", timeout=15000)
    time.sleep(1.0)
    mo.screenshot(path=f"{OUT}/mobile-04-court.png")
    note("shot: mobile-04-court.png")
    check_page(mo, "mobile court")
    mo.goto(PROD + "/?case=COR-003")
    mo.wait_for_selector(".tab", timeout=15000)
    time.sleep(1.0)
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
        rp.wait_for_selector("#view", timeout=15000)
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
    with open("/home/hatch/workspace/converge/submission/qa/capture-log-2.txt", "w") as f:
        f.write("\n".join(LOG))
    note("CAPTURE PART 2 DONE")

"""Capture fresh CONVERGE screenshots + the demo walkthrough video.

Runs the REAL app (localhost:3100, REAL-SWITCH mode) in headless Chromium
via Playwright, following the demo script. Screenshots go to
submission/screenshots/live-*.png; the video is recorded to
submission/demo/ (webm, converted to mp4 afterwards).
Everything shown is the live app against the live Switch server.
"""
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100"
SHOTS = "/home/hatch/workspace/converge/submission/screenshots"
VIDEO_DIR = "/home/hatch/workspace/converge/submission/demo"

def dwell(page, seconds, scroll=False):
    end = time.time() + seconds
    while time.time() < end:
        if scroll:
            page.mouse.wheel(0, 120)
            time.sleep(0.6)
            page.mouse.wheel(0, -120)
        time.sleep(0.8)

def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}")
    print("shot:", name)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport={"width": 1440, "height": 900},
        record_video_dir=VIDEO_DIR,
        record_video_size={"width": 1440, "height": 900},
    )
    page = ctx.new_page()

    # 1. Dashboard
    page.goto(BASE + "/")
    page.wait_for_selector("#nav-case-count", timeout=15000)
    time.sleep(2)
    shot(page, "live-dashboard.png")
    dwell(page, 18, scroll=True)

    # 2. HAGGLE overview
    page.goto(BASE + "/?case=HAG-014")
    page.wait_for_selector(".tab", timeout=15000)
    time.sleep(2)
    shot(page, "live-haggle.png")
    dwell(page, 16, scroll=True)

    # 3. HAGGLE analysis tab
    page.click('[data-tab="analysis"]')
    time.sleep(2)
    shot(page, "live-haggle-analysis.png")
    dwell(page, 16, scroll=True)

    # 4. Real Switch room drawer
    page.click("[data-room-btn]")
    page.wait_for_selector("#room-drawer:not([hidden])", timeout=10000)
    time.sleep(2)
    shot(page, "live-room-haggle.png")
    dwell(page, 20)
    page.keyboard.press("Escape")
    time.sleep(1)

    # 5. Audit trail (the approval record)
    page.click('[data-tab="audit"]')
    time.sleep(2)
    shot(page, "live-haggle-audit.png")
    dwell(page, 14, scroll=True)

    # 6. COURT
    page.goto(BASE + "/?case=CRT-007")
    page.wait_for_selector(".tab", timeout=15000)
    time.sleep(2)
    shot(page, "live-court.png")
    dwell(page, 16, scroll=True)

    # 7. CORRECTION
    page.goto(BASE + "/?case=COR-003")
    page.wait_for_selector(".tab", timeout=15000)
    time.sleep(2)
    shot(page, "live-correction.png")
    dwell(page, 16, scroll=True)

    # 8. Close on the dashboard
    page.goto(BASE + "/")
    page.wait_for_selector("#nav-case-count", timeout=15000)
    dwell(page, 8)
    ctx.close()
    browser.close()
    print("done")

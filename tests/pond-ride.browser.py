"""Exercise the public boat view with mouse, keyboard and simulated touch."""
from datetime import datetime
import math
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright


origin = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:4175"
captures = Path(sys.argv[2]) if len(sys.argv) > 2 else None
canvas = ".scene canvas"
afternoon = datetime.fromisoformat("2026-11-23T12:30:00+08:00")


def frame(page, condition="data.boatAvailable"):
    handle = page.wait_for_function(
        f"""() => {{
            const data = JSON.parse(document.querySelector('{canvas}')?.dataset.pond || '{{}}');
            return ({condition}) ? data : null;
        }}""",
        timeout=30000,
    )
    data = handle.json_value()
    handle.dispose()
    return data


def mode(page, name):
    page.locator(f'{canvas}[data-pond-view="{name}"]').wait_for()


def relative_camera(data):
    x, y, z = data["camera"]
    boat = data["boat"]
    return x - boat["x"] / 100, y - .62, z - boat["y"] / 100


def pose_distance(a, b):
    return math.dist(relative_camera(a), relative_camera(b))


def boat_in_overview(page, data, fov):
    width, height = page.viewport_size["width"], page.viewport_size["height"]
    x, z = data["boat"]["x"] / 100, data["boat"]["y"] / 100
    _, cy, cz = data["camera"]
    dy, dz = .34 - cy, z - cz
    radius = math.hypot(cy - .5, cz)
    up = (dy * cz - dz * (cy - .5)) / radius
    depth = (-dy * (cy - .5) - dz * cz) / radius
    scale = height / (2 * math.tan(math.radians(fov / 2)) * depth)
    return width / 2 + x * scale, height / 2 - up * scale


def shoot(page, name):
    if captures:
        captures.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=captures / f"{name}.jpg", quality=91)


def boot(browser, *, phone=False):
    size = {"width": 390, "height": 844} if phone else {"width": 1440, "height": 900}
    page = browser.new_page(viewport=size, is_mobile=phone, has_touch=phone, timezone_id="Asia/Shanghai",
                            reduced_motion="reduce" if phone else "no-preference")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.clock.set_fixed_time(afternoon)
    page.add_init_script("sessionStorage.setItem('pond-play-hint', '1')")
    page.goto(f"{origin}/", wait_until="domcontentloaded")
    page.locator(".journey-page.is-ready").wait_for(timeout=90000)
    frame(page)
    return page, errors


def desktop(browser):
    page, errors = boot(browser)
    before_pause = frame(page)["renderedFrames"]
    page.get_by_role("button", name="暂停池塘动态").click()
    still = frame(page, f"data.renderedFrames > {before_pause}")
    page.mouse.dblclick(*boat_in_overview(page, still, 38))
    mode(page, "boat")
    start = frame(page, "data.camera?.[1] < 1.17")
    assert 3.35 < math.hypot(*relative_camera(start)) < 3.66
    assert start["boat"] == still["boat"]
    shoot(page, "ride-day")
    assert not start["boatLantern"]["on"]
    for index, light_on in enumerate((True, False, True), start=1):
        if index == 3:
            page.locator(canvas).focus()
            page.keyboard.press("B")
        else:
            position = frame(page)["boatLantern"]
            size = page.viewport_size
            page.mouse.click(position["x"] * size["width"], position["y"] * size["height"])
        lamp = frame(page, f"data.interactions?.boatLantern === {index} && data.boatLantern.on === {str(light_on).lower()}")
        assert lamp["time"] == still["time"] and lamp["boat"] == still["boat"]
        mode(page, "boat")
    reset = page.get_by_role("button", name="回到全景")
    assert reset.is_visible()

    page.mouse.move(665, 336)
    page.mouse.down(button="right")
    page.mouse.move(835, 337, steps=5)
    page.mouse.up(button="right")
    turned = frame(page, f"Math.abs(data.camera?.[0] - {start['camera'][0]}) > 1.0")
    assert abs(math.hypot(*relative_camera(start)) - math.hypot(*relative_camera(turned))) < .1
    page.mouse.wheel(0, -520)
    x, _, z = start["boat"]["x"] / 100, .62, start["boat"]["y"] / 100
    frame(page, f"Math.hypot(data.camera?.[0] - {x}, data.camera?.[2] - {z}) < 3.0")

    page.locator(canvas).focus()
    page.keyboard.press("4")
    start = frame(page, f"Math.abs(data.camera?.[0] - {start['camera'][0]}) < .04 && data.camera[1] < 1.16")
    page.get_by_role("button", name="播放池塘动态").click()
    page.mouse.click(883, 425)
    route = frame(page, "data.travel === 'water'")
    moved = frame(page, f"Math.hypot(data.boat?.x - {route['boat']['x']}, data.boat?.y - {route['boat']['y']}) > 62")
    assert pose_distance(start, moved) < .23, (start["camera"], moved["camera"], moved["boat"])
    mode(page, "boat")

    page.get_by_role("button", name="暂停池塘动态").click()
    page.locator(".phase-toggle").click()
    frame(page, "data.sunAltitude < -4")
    mode(page, "boat")
    shoot(page, "ride-night")
    page.locator(canvas).focus()
    page.keyboard.press("1")
    mode(page, "pond")
    frame(page, "data.camera?.[0] < -2.8 && data.camera?.[1] > 3")
    page.keyboard.press("0")
    reset.wait_for(state="hidden")
    assert not errors, errors
    page.close()
    print("Desktop: double-click, lantern while paused, steady follow while sailing, orbit, zoom, phase, island and reset.")


def touch(browser):
    page, errors = boot(browser, phone=True)
    still = frame(page)
    x, y = boat_in_overview(page, still, 49)
    page.touchscreen.tap(x, y)
    page.touchscreen.tap(x, y)
    mode(page, "boat")
    start = frame(page, "data.camera?.[1] < 1.6")
    assert start["time"] == 0
    shoot(page, "ride-portrait")

    cdp = page.context.new_cdp_session(page)
    def fingers(event, *points):
        cdp.send("Input.dispatchTouchEvent", {"type": event,
                 "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(points)]})

    fingers("touchStart", (130, 355), (220, 355))
    for shift in (18, 39, 65, 76):
        fingers("touchMove", (130 + shift, 355), (220 + shift, 355))
    fingers("touchEnd")
    turned = frame(page, f"Math.abs(data.camera?.[0] - {start['camera'][0]}) > 1.0")
    assert abs(math.hypot(*relative_camera(start)) - math.hypot(*relative_camera(turned))) < .1
    fingers("touchStart", (147, 355), (243, 355))
    for shift in (14, 31, 46):
        fingers("touchMove", (147 - shift, 355), (243 + shift, 355))
    fingers("touchEnd")
    x, z = still["boat"]["x"] / 100, still["boat"]["y"] / 100
    radius = math.hypot(*relative_camera(turned)) - .4
    near = frame(page, f"Math.hypot(data.camera?.[0] - {x}, data.camera?.[1] - .62, data.camera?.[2] - {z}) < {radius}")
    page.set_viewport_size({"width": 844, "height": 390})
    page.wait_for_function(f"document.querySelector('{canvas}').clientWidth === 844")
    mode(page, "boat")
    wide = frame(page, f"Math.abs(data.camera?.[1] - {near['camera'][1]}) > .07")
    x1, _, z1 = relative_camera(near)
    x2, _, z2 = relative_camera(wide)
    assert (x1 * x2 + z1 * z2) / (math.hypot(x1, z1) * math.hypot(x2, z2)) > .998
    page.get_by_role("button", name="回到全景").tap()
    mode(page, "pond")
    frame(page, "data.camera?.[1] > 8")
    assert not errors, errors
    page.close()
    print("Touch: double-tap, two-finger orbit and pinch, retained aim on rotation, reduced-motion reset.")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
    desktop(browser)
    touch(browser)
    browser.close()

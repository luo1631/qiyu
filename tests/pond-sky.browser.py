"""Check the rendered sky and the planar reflection at a fixed lunar sightline."""
from io import BytesIO
import math
from pathlib import Path
import statistics
import sys

from PIL import Image
from playwright.sync_api import sync_playwright


origin = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:5175"
output = Path(sys.argv[2]) if len(sys.argv) > 2 else None
size = {"width": 1280, "height": 800}
review = origin + "/scripts/design/scene-review.html?clean=1&date=2026-11-23"


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    x, y, z = a
    u, v, w = b
    return y * w - z * v, z * u - x * w, x * v - y * u


def unit(v):
    length = math.hypot(*v)
    return tuple(value / length for value in v)


def project(direction):
    # Match the published authoring view. Translation cancels for a sky direction.
    forward = unit((-8.55, .72, -1.38))
    right = unit(cross(forward, (0, 1, 0)))
    up = cross(right, forward)
    factor = size["height"] / (2 * math.tan(math.radians(30)) * dot(forward, direction))
    return round(size["width"] / 2 + factor * dot(right, direction)), round(size["height"] / 2 - factor * dot(up, direction))


def patch(image, centre, radius):
    x, y = centre
    return list(image.crop((x - radius, y - radius, x + radius + 1, y + radius + 1)).getdata())


def luma(color):
    return .2126 * color[0] + .7152 * color[1] + .0722 * color[2]


def shot(page, view, time, tag):
    page.goto(f"{review}&view={view}&time={time}", wait_until="domcontentloaded")
    page.locator("body[data-ready=true]").wait_for(timeout=90000)
    image = Image.open(BytesIO(page.screenshot())).convert("RGB")
    if output:
        output.mkdir(parents=True, exist_ok=True)
        image.save(output / f"{tag}.jpg", quality=92)
    return image


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport=size, timezone_id="Asia/Shanghai", reduced_motion="reduce")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    image = shot(page, "moonrise", "17:20", "moonrise")
    direction = unit(page.evaluate("""async () => {
        const { lightingAt, observerAt } = await import('/src/scene/time.ts');
        const date = new Date('2026-11-23T17:20:00+08:00');
        return lightingAt(date, observerAt(date, 'Asia/Shanghai')).moon;
    }"""))
    above = project(direction)
    reflected = project((direction[0], -direction[1], direction[2]))
    face = statistics.median(map(luma, patch(image, above, 5)))
    sky = statistics.median(map(luma, patch(image, (above[0] - 38, above[1]), 10)))
    silver = max(map(luma, patch(image, reflected, 11)))
    water = statistics.median(map(luma, patch(image, (reflected[0] - 36, reflected[1]), 12)))
    assert face > 203 and face - sky > 80, (above, face, sky)
    assert silver > 150 and silver - water > 37, (reflected, silver, water)

    dusk = shot(page, "dusk", "17:20", "dusk")
    upper = tuple(statistics.median(channel) for channel in zip(*patch(dusk, (666, 49), 19)))
    horizon = tuple(statistics.median(channel) for channel in zip(*patch(dusk, (675, 203), 19)))
    assert upper[2] > upper[0] and horizon[0] > upper[0] + 28, (upper, horizon)
    assert not errors, errors
    assert page.locator("canvas").evaluate("canvas => canvas.getContext('webgl2').getError()") == 0
    print("The moon and its reflection follow the same bearing. The sunset keeps a warm horizon below a cool upper sky.")
    browser.close()

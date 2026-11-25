"""Run against both builds: python tests/pond-assets.browser.py [qiyu_url] [youjing_url]."""
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


qiyu = sys.argv[1].rstrip("/") + "/" if len(sys.argv) > 1 else "http://127.0.0.1:4175/"
youjing = sys.argv[2].rstrip("/") + "/" if len(sys.argv) > 2 else "http://127.0.0.1:4174/"


def assets(browser, url, ready, pond=False):
    detail = dict(viewport={"width": 390, "height": 640}, is_mobile=True, has_touch=True, device_scale_factor=2.5)
    page = browser.new_page(reduced_motion="reduce", **(detail if pond else {}))
    requested = []
    page.on("request", lambda request: requested.append(urlparse(request.url).path))
    page.add_init_script("localStorage.setItem('pond-ink-entered', '1')")
    if pond:
        page.add_init_script("""const observeFirstPondFrame = new MutationObserver(records => {
            for (const {target} of records) {
                if (target instanceof HTMLCanvasElement && target.dataset.pond) {
                    window.firstPondFrame = JSON.parse(target.dataset.pond);
                    observeFirstPondFrame.disconnect();
                    return;
                }
            }
        });
        observeFirstPondFrame.observe(document, {subtree: true, attributes: true, attributeFilter: ['data-pond']});
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });""")
    page.goto(url, wait_until="domcontentloaded")
    page.locator(ready).wait_for(timeout=90000)
    if pond:
        page.wait_for_function("Boolean(window.firstPondFrame)")
        first = page.evaluate("window.firstPondFrame")
        assert first["renderedFrames"] == 1 and first["boatAvailable"] and first["swan"], first
        canvas_size, max_texture, gl_error = page.locator(ready).evaluate("""el => {
            const gl = el.getContext('webgl2');
            return [[el.width, el.height], gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getError()];
        }""")
        assert first["renderProfile"] == "high" and first["dpr"] == detail["device_scale_factor"], first
        assert first["shadowMapSize"] == min(4096, max_texture) and first["waterCaptureSize"] == canvas_size, (first, canvas_size)
        assert gl_error == 0, gl_error
    page.wait_for_load_state("networkidle")
    page.close()
    return requested


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
    home = assets(browser, youjing, ".specimen-window")
    pond = assets(browser, qiyu, ".journey-page.is-ready canvas", pond=True)

    home_art = ("youjing-lakeside", "youjing-lettering", "exhibit-pavilion")
    pond_art = ("pond-poster",)
    for token in home_art:
        assert any(token in path for path in home), (token, home)
        assert not any(token in path for path in pond), (token, pond)
    for token in pond_art:
        assert any(token in path for path in pond), (token, pond)
        assert not any(token in path for path in home), (token, home)
    assert not any("/src/exhibits/" in path for path in pond), pond
    assert not any(path.endswith((".glb", ".gltf")) for path in pond), pond
    print("Each page loads its own artwork. The touch viewport uses full detail, native pixel density and matching water captures from the first frame.")
    browser.close()

"""Chargement progressif du décor réel, sans serveur ni accès réseau.

Exécution : python tests/adPopupCinemaRain.browser.py
Nécessite les dépendances de tests/liveTvAdPopup.browser.py.
"""
import asyncio
import importlib.util
import json
import tempfile
from pathlib import Path
from urllib.parse import urlparse

spec = importlib.util.spec_from_file_location('popup_fixture', Path(__file__).with_name('liveTvAdPopup.browser.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

PROBE = """
localStorage.setItem('settings_light_mode', 'off');
// Stabiliser le tirage pour vérifier la réutilisation de tous les plans préparés.
let seed = 1234;
window.resetRandom = () => { seed = 1234; };
Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
window.probe = {frame: 0, loads: [], preparations: [], preparedKeys: [], svgOnScreen: 0, earlyMeasurements: 0, draws: 0, motifs: new Set(), releases: []};
const laidOut = new WeakSet();
const NativeResizeObserver = window.ResizeObserver;
window.ResizeObserver = class extends NativeResizeObserver {
  constructor(callback) {
    super((entries, observer) => {
      entries.forEach(entry => laidOut.add(entry.target));
      callback(entries, observer);
    });
  }
};
const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
Object.defineProperty(Element.prototype, 'clientWidth', {...clientWidth, get() {
  if (this instanceof HTMLCanvasElement && this.isConnected && !laidOut.has(this)) probe.earlyMeasurements++;
  return clientWidth.get.call(this);
}});
function tick() { probe.frame++; requestAnimationFrame(tick); }
requestAnimationFrame(tick);
window.waitFrames = count => new Promise(resolve => {
  function step() { if (--count <= 0) resolve(); else requestAnimationFrame(step); }
  requestAnimationFrame(step);
});
const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', {...src, set(value) {
  probe.loads.push(probe.frame);
  src.set.call(this, value);
}});
const decode = HTMLImageElement.prototype.decode;
HTMLImageElement.prototype.decode = function() {
  const decoded = decode.call(this);
  if (window.holdDecode) return Promise.all([decoded, new Promise(resolve => probe.releases.push(resolve))]);
  if (window.failDecode) return decoded.then(() => { throw new Error('Décodage indisponible'); });
  return decoded;
};
const draw = CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
  if (image instanceof HTMLImageElement) {
    if (this.canvas.isConnected) probe.svgOnScreen++;
    else {
      probe.preparations.push(probe.frame);
      probe.preparedKeys.push(`${image.dataset.cinemaMotif || 'beam'}:${this.filter}`);
    }
  }
  if (this.canvas.isConnected) {
    probe.draws++;
    if (image.dataset.cinemaMotif) probe.motifs.add(image.dataset.cinemaMotif);
  }
  return draw.call(this, image, ...args);
};
window.setHidden = hidden => {
  Object.defineProperty(document, 'hidden', {configurable: true, value: hidden});
  document.dispatchEvent(new Event('visibilitychange'));
};
window.releaseDecode = () => {
  window.holdDecode = false;
  probe.releases.splice(0).forEach(resolve => resolve());
};
"""


async def open_fixture(browser, work):
    context = await browser.new_context(viewport={'width': 1280, 'height': 900})
    await context.add_init_script(PROBE)

    async def route(request):
        path = work / urlparse(request.request.url).path.lstrip('/')
        await request.fulfill(path=str(path if path.is_file() else work / 'index.html'))

    await context.route('**/*', route)
    page = await context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    await page.goto('https://cinema.test/')
    await page.wait_for_function('!!window.popup')
    return context, page, errors


async def check_loading(browser, work):
    context, page, errors = await open_fixture(browser, work)
    await page.evaluate('popup.open()')
    await page.wait_for_function('probe.motifs.size === 15')
    await page.evaluate('waitFrames(50)')
    stats = await page.evaluate('({loads: probe.loads, preparations: probe.preparations, svgOnScreen: probe.svgOnScreen})')
    assert len(stats['loads']) == 16, stats
    assert len(set(stats['loads'])) == 16, 'Les SVG ne doivent pas démarrer en rafale'
    assert len(set(stats['preparations'])) == len(stats['preparations']), 'Préparer au plus un sprite par frame'
    assert stats['svgOnScreen'] == 0, 'Le canvas animé ne doit dessiner que des sprites en cache'
    assert await page.evaluate('probe.earlyMeasurements') == 0, 'Attendre le layout natif avant de mesurer le canvas'
    await page.evaluate('popup.close()')
    await fixture.expect(page.get_by_role('dialog')).to_have_count(0)
    before = await page.evaluate('probe.draws')
    await page.evaluate('waitFrames(5)')
    assert await page.evaluate('probe.draws') == before, 'La fermeture doit arrêter le dessin'
    await page.evaluate('resetRandom(); popup.open()')
    await fixture.expect(page.get_by_role('dialog')).to_be_visible()
    await page.evaluate('waitFrames(50)')
    assert await page.evaluate('probe.loads.length') == 16, 'Réutiliser les images à la réouverture'
    assert await page.evaluate('new Set(probe.preparedKeys).size === probe.preparedKeys.length'), 'Ne pas recalculer un sprite déjà préparé'
    assert not errors, errors
    await context.close()


async def check_cancellation(browser, work, interruption):
    context, page, errors = await open_fixture(browser, work)
    await page.evaluate('window.holdDecode = true; popup.open()')
    await page.wait_for_function('probe.releases.length === 1')
    await page.evaluate(interruption)
    await page.evaluate('releaseDecode(); waitFrames(5)')
    assert await page.evaluate('probe.loads.length') == 1, 'Arrêter la file en attente'
    assert await page.evaluate('probe.preparations.length') == 0, 'Ignorer les décodages terminés après arrêt'
    await page.evaluate('setHidden(false); popup.light(false); popup.open()')
    await page.wait_for_function('probe.motifs.size === 15')
    assert not errors, errors
    await context.close()


async def check_preferences_and_failure(browser, work):
    context, page, errors = await open_fixture(browser, work)
    await page.evaluate('popup.light(true); popup.open()')
    await fixture.expect(page.get_by_role('dialog')).to_be_visible()
    await page.evaluate('waitFrames(5)')
    assert await page.evaluate('probe.loads.length') == 0
    await page.emulate_media(reduced_motion='reduce')
    await page.evaluate('popup.light(false); waitFrames(5)')
    assert await page.evaluate('probe.loads.length') == 0
    await page.evaluate('window.failDecode = true')
    await page.emulate_media(reduced_motion='no-preference')
    await page.wait_for_function('probe.loads.length >= 16')
    assert await page.evaluate('probe.preparations.length') == 0
    # Une erreur de décodage ne doit empêcher ni le bouton ni une réouverture.
    await page.locator('[data-ad-view-button]').click()
    await page.get_by_role('button', name='Accéder à la chaîne', exact=True).click()
    await fixture.expect(page.get_by_role('dialog')).to_have_count(0)
    await page.evaluate('window.failDecode = false; popup.open()')
    await page.wait_for_function('probe.motifs.size === 15')
    assert not errors, errors
    await context.close()


async def main():
    with tempfile.TemporaryDirectory(prefix='movix-cinema-test-') as directory:
        work = Path(directory)
        repo = fixture.REPO.as_posix()
        fixture.build_fixture(work, extra_mocks={'LiveTV': f"""
import React, {{useState}} from 'react';
import AdFreePlayerAds from {json.dumps(repo + '/src/components/AdFreePlayerAds')};
import {{useLightMode}} from {json.dumps(repo + '/src/context/LightModeContext')};
export default function Fixture() {{
  const [open, setOpen] = useState(false);
  const {{setLightModeSetting}} = useLightMode();
  window.popup = {{open: () => setOpen(true), close: () => setOpen(false), light: value => setLightModeSetting(value ? 'on' : 'off')}};
  return open ? <AdFreePlayerAds variant="livetv" onClose={{() => setOpen(false)}} onAccept={{() => setOpen(false)}}/> : null;
}}
"""})
        async with fixture.async_playwright() as playwright:
            browser = await playwright.chromium.launch()
            await check_loading(browser, work)
            for interruption in ['setHidden(true)', 'popup.close()', 'popup.light(true)']:
                await check_cancellation(browser, work, interruption)
            await check_preferences_and_failure(browser, work)
            await browser.close()
    print('Décor pub : préparation progressive, cache, arrêt, reprise et erreurs vérifiés.')


if __name__ == '__main__':
    asyncio.run(main())

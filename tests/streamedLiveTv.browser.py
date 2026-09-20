"""Catalogue réel et choix embed/natif, avec API simulée ; aucun serveur ni accès réseau."""
import asyncio
import importlib.util
import json
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('liveTvAdPopup.browser.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

async def check(browser, work, mode, width=1280, height=900):
    context = await browser.new_context(viewport={'width': width, 'height': height})
    await context.add_init_script(f"""
localStorage.setItem('fixture_vip', {json.dumps(str(mode.startswith('vip')).lower())});
localStorage.setItem('fixture_extension', {json.dumps(str(mode.startswith('extension')).lower())});
localStorage.setItem('fixture_mode', {json.dumps(mode)});
localStorage.setItem('settings_light_mode','on');
sessionStorage.setItem('livetv_ad_credits','10');
""")
    calls = {'native': 0, 'decode': 0, 'media': 0}
    native_keys = []
    async def route(r):
        path = urlparse(r.request.url).path
        if path == '/api/livetv/manifest':
            await r.fulfill(json={'catalogs': [
                {'id': 'matches_all', 'name': 'Tous les sports', 'type': 'tv'},
                {'id': 'streamed_all', 'name': 'Tous les sports', 'type': 'tv', '_emoji': '🏅'},
            ]})
        elif path == '/api/livetv/catalog/tv/streamed_all':
            await r.fulfill(json={'metas': [{'id': 'streamed_fixture', 'name': 'Match Streamed', 'type': 'tv', 'poster': '', '_serverCount': 3, '_isLive': True, '_emoji': '⚽'}]})
        elif path.startswith('/api/livetv/catalog/'):
            await r.fulfill(json={'metas': []})
        elif path.startswith('/api/livetv/stream/tv/'):
            await r.fulfill(json={'streams': [
                {'title': 'admin · 1 · English - Paramount+ · HD', 'url': 'https://embed.test/player', '_isEmbed': True, '_streamedKey': 'aea582d2d61149d6d27e236b'},
                {'title': 'admin · 2 · English - Paramount+ · SD', 'url': 'https://embed.test/player?server=2', '_isEmbed': True, '_streamedKey': '638ce4ba4be70df8111bc174'},
                {'title': 'delta · 1 · English · HD', 'url': 'https://embed.test/player?server=3', '_isEmbed': True, '_streamedKey': '3decb7367c83a4fb4e8ec9d9'},
            ]})
        elif path.startswith('/api/livetv/streamed/native/'):
            calls['native'] += 1
            native_keys.append(path.rsplit('/', 1)[-1])
            assert r.request.headers.get('x-access-key') == 'fixture'
            if mode == 'vip-error':
                await r.fulfill(status=502, json={'error': 'indisponible'})
            else:
                await r.fulfill(json={'url': 'https://media.test/live.m3u8'})
        elif path.startswith('/api/livetv/streamed/decode/'):
            calls['decode'] += 1
            assert json.loads(r.request.post_data)['goat'] == 'fixture'
            await r.fulfill(json={'url': 'https://media.test/live.m3u8', 'referer': 'https://embed.st/'})
        elif path == '/live.m3u8':
            calls['media'] += 1
            await r.fulfill(content_type='application/vnd.apple.mpegurl', body='#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-ENDLIST\n')
        elif path == '/player':
            await r.fulfill(content_type='text/html', body='<body>Lecteur amont</body>')
        else:
            file = work / path.lstrip('/')
            await r.fulfill(path=str(file if file.is_file() else work / 'index.html'))
    await context.route('**/*', route)
    page = await context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    await page.goto('https://livetv.test/live-tv')
    await page.get_by_role('button', name=re.compile('Streamed$')).click()
    await page.get_by_role('heading', name='Match Streamed', exact=True).click()
    player = page.locator('div[class*="z-[12000]"]')
    panel = player.get_by_role('region', name='Serveurs', exact=True)

    async def check_menu():
        await expect(panel).to_be_visible()
        await expect(panel.get_by_role('group', name='Serveurs').get_by_role('button')).to_have_count(3)
        await expect(panel.get_by_role('button', name='Serveur 1 Anglais · Paramount+ HD', exact=True)).to_be_visible()
        assert not re.search(r'admin|delta| · 1 · | · 2 · ', await panel.inner_text())
        assert await panel.evaluate('(el)=>el.scrollWidth<=el.clientWidth'), 'Le panneau déborde horizontalement'

    if mode == 'visitor':
        await expect(player.locator('iframe')).to_be_visible()
        assert calls['native'] == calls['decode'] == 0, 'Un visiteur reste en embed sans extraction'
        await player.get_by_title('Sources', exact=True).click()
        await check_menu()
        await expect(player.get_by_role('button', name=re.compile('Lecteur Movix'))).to_have_count(0)
        await panel.get_by_role('button', name=re.compile('Serveur 2')).click()
        await expect(player.locator('iframe')).to_have_attribute('src', 'https://embed.test/player?server=2')
    else:
        # Aucun clic dans le menu des sources : le premier serveur natif doit
        # se résoudre à l'ouverture, sans extraire les deux autres serveurs.
        if mode == 'vip-error':
            await expect(player.get_by_text('La vidéo ne démarre pas avec Movix.', exact=False)).to_be_visible()
            await player.get_by_role('button', name='Changer de serveur', exact=True).click()
            await check_menu()
            await page.keyboard.press('Escape')
            await expect(panel).to_have_count(0)
            await player.get_by_role('button', name='Essayer le lecteur Streamed', exact=True).click()
            await expect(player.locator('iframe')).to_be_visible()
        else:
            await expect(player.locator('video')).to_be_visible()
            await page.wait_for_function("window.streamedProxyReads > 0" if mode.startswith('extension') else "document.querySelector('video')?.src.startsWith('blob:')")
            if mode == 'vip':
                await player.get_by_title('Sources', exact=True).click()
                await check_menu()
                await expect(panel.get_by_role('button', name='Lecteur Movix', exact=True)).to_have_attribute('aria-pressed', 'true')
                if os.environ.get('MOVIX_SCREENSHOT_DIR'):
                    screenshots = Path(os.environ['MOVIX_SCREENSHOT_DIR'])
                    screenshots.mkdir(parents=True, exist_ok=True)
                    await panel.screenshot(path=str(screenshots / f'streamed-menu-{width}x{height}.png'))
                # La barre espace doit activer le bouton, sans lancer le raccourci vidéo global.
                await panel.get_by_role('button', name='Lecteur Streamed', exact=True).focus()
                await page.keyboard.press('Space')
                await expect(panel.get_by_role('button', name='Lecteur Streamed', exact=True)).to_have_attribute('aria-pressed', 'true')
                await expect(player.locator('video')).to_be_visible()
                await expect(player.locator('iframe')).to_have_count(0)
                await expect(panel).to_be_visible()
                await expect(panel.get_by_role('group', name='Serveurs').locator('[aria-pressed="true"]')).to_have_count(0)
                assert calls['native'] == 1, 'Parcourir un mode ne lance aucun flux'
                # Fermer sans choisir de serveur conserve le mode en lecture.
                await page.keyboard.press('Escape')
                await expect(panel).to_have_count(0)
                await player.get_by_title('Sources', exact=True).click()
                await expect(panel.get_by_role('button', name='Lecteur Movix', exact=True)).to_have_attribute('aria-pressed', 'true')
                await expect(panel.get_by_role('button', name=re.compile('Serveur 1'))).to_have_attribute('aria-pressed', 'true')
                await panel.get_by_role('button', name='Lecteur Streamed', exact=True).click()
                await panel.get_by_role('button', name=re.compile('Serveur 2')).click()
                await expect(panel).to_have_count(0)
                await expect(player.locator('iframe')).to_have_attribute('src', 'https://embed.test/player?server=2')
                await player.get_by_title('Sources', exact=True).click()
                await expect(panel.get_by_role('button', name='Lecteur Streamed', exact=True)).to_have_attribute('aria-pressed', 'true')
                await expect(panel.get_by_role('button', name=re.compile('Serveur 2'))).to_have_attribute('aria-pressed', 'true')
                await panel.get_by_role('button', name='Lecteur Movix', exact=True).click()
                await expect(player.locator('iframe')).to_have_attribute('src', 'https://embed.test/player?server=2')
                await expect(panel.get_by_role('group', name='Serveurs').locator('[aria-pressed="true"]')).to_have_count(0)
                assert calls['native'] == 1, 'Consulter Movix conserve le lecteur Streamed actif'
                await panel.get_by_role('button', name=re.compile('Serveur 3')).click()
                await expect(panel).to_have_count(0)
                await expect(player.locator('video')).to_be_visible()
                await page.wait_for_function("document.querySelector('video')?.src.startsWith('blob:')")
                assert native_keys == ['aea582d2d61149d6d27e236b', '3decb7367c83a4fb4e8ec9d9']
        assert calls['native'] == (2 if mode == 'vip' else 1 if mode.startswith('vip') else 0)
        assert calls['decode'] == (1 if mode == 'extension' else 0)
    assert not errors, errors
    print(json.dumps({'mode': mode, 'viewport': [width, height], **calls}), flush=True)
    await context.close()

async def main():
    with tempfile.TemporaryDirectory(prefix='movix-streamed-browser-') as directory:
        work = Path(directory)
        fixture.build_fixture(work, real_player=True, extra_mocks={
            'vipUtils': "export const getVipHeaders=()=>({'x-access-key':'fixture'}); export const isUserVip=()=>localStorage.getItem('fixture_vip')==='true';",
            'extensionProxy': """
export const isExtensionAvailable=()=>localStorage.getItem('fixture_extension')==='true';
export const fetchFromExtension=async(action,payload)=>{
 if(action==='GET_MANIFEST')return {catalogs:[]};
 if(action==='STREAMED_HANDSHAKE')return localStorage.getItem('fixture_mode')==='extension-golf'
  ? {url:'https://media.test/live.m3u8',referer:'https://exposestrat.com/'}
  : {embedUrl:payload.url,goat:'fixture',body:'CgEC'};
 if(action==='PROXY_HTTP'){
  const referer=localStorage.getItem('fixture_mode')==='extension-golf'?'https://exposestrat.com/':'https://embed.st/';
  if(payload.headers.Referer!==referer)throw new Error('Referer absent');
  window.streamedProxyReads=(window.streamedProxyReads||0)+1;
  return {status:200,data:btoa('#EXTM3U\\n#EXT-X-TARGETDURATION:6\\n#EXT-X-ENDLIST\\n')};
 }
 throw new Error('Action extension inattendue : '+action);
};""",
        })
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            for mode in ['visitor', 'vip', 'extension', 'extension-golf', 'vip-error']:
                await check(browser, work, mode)
            await check(browser, work, 'vip', 390, 844)
            await check(browser, work, 'vip', 844, 390)
            await browser.close()

asyncio.run(main())

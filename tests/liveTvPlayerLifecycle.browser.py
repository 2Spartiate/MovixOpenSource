"""Entrée/sortie du vrai lecteur et navigation, sans serveur ni accès réseau.

Exécution : python tests/liveTvPlayerLifecycle.browser.py
Nécessite les dépendances npm et Python Playwright avec Chromium.
"""
import asyncio
import importlib.util
import json
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

spec = importlib.util.spec_from_file_location('ad_fixture', Path(__file__).with_name('liveTvAdPopup.browser.py'))
ad_fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ad_fixture)

PLAYER = 'div[class*="z-[12000]"]'


async def check_lifecycle(browser, work, navigation=False, embed=True, light=False, deep_link=False):
    context = await browser.new_context(viewport={'width': 1280, 'height': 900})
    await context.add_init_script(f"""
localStorage.setItem('fixture_vip','true');
localStorage.setItem('settings_light_mode',{'"on"' if light else '"off"'});
window.lenis={{stop:()=>{{window.lenisStopped=true;}},start:()=>{{window.lenisStopped=false;}}}};
""")

    async def route(request):
        path = urlparse(request.request.url).path
        if path == '/api/livetv/manifest':
            await request.fulfill(json={'catalogs': [{'id': 'northlive_all', 'name': 'Toutes', 'type': 'tv'}]})
        elif path == '/api/livetv/catalog/tv/northlive_all':
            await request.fulfill(json={'metas': [{'id': f'northlive_{i}', 'type': 'tv', 'name': f'Chaîne {i}', 'poster': ''} for i in range(400)]})
        elif path.startswith('/api/livetv/stream/'):
            await request.fulfill(json={'streams': [{'url': 'https://stream.test/embed' if embed else 'https://stream.test/video.mp4', '_isEmbed': embed}]})
        elif path == '/embed':
            await request.fulfill(content_type='text/html', body='<body style="background:#222;color:white">Chaîne locale</body>')
        elif path == '/video.mp4':
            await request.fulfill(status=204)
        else:
            file = work / path.lstrip('/')
            await request.fulfill(path=str(file if file.is_file() else work / 'index.html'))

    await context.route('**/*', route)
    page = await context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    url = 'https://livetv.test/' if navigation else 'https://livetv.test/live-tv'
    if deep_link:
        url += '?source=northlive&targetId=northlive_30&kind=channel&catalogId=northlive_all'
    await page.goto(url)
    if navigation:
        await page.get_by_role('link', name='Ouvrir la TV').click()

    player = page.locator(PLAYER)
    channel = page.get_by_role('heading', name='Chaîne 30', exact=True)
    await expect(channel).to_have_count(1)

    if deep_link:
        await expect(player.locator('iframe')).to_be_visible()
        await expect(page).to_have_url('https://livetv.test/live-tv')
        await page.go_back()
        await expect(player).to_have_count(0)

    await channel.scroll_into_view_if_needed()
    await expect(channel.locator('xpath=../..')).to_have_css('opacity', '1')
    scroll_before = await page.evaluate('scrollY')
    base_state = await page.evaluate('history.state')

    for action in ['button', 'escape', 'back', 'double-click']:
        before = await page.evaluate('window.catalogRenders')
        await channel.click()
        await expect(player).to_have_css('opacity', '1')
        if embed:
            await expect(player.locator('iframe')).to_be_visible()
        assert await page.evaluate('window.catalogRenders') == before, 'Ouvrir le lecteur recalcule la grille'
        assert await page.evaluate('window.lenisStopped') is True
        assert await page.evaluate('history.state.playerOpen') is True
        assert await page.evaluate('history.state.idx') == base_state['idx']

        # Échantillonner la vraie opacité jusqu'au retrait : Framer 11 rendait
        # le panneau noir opaque une dernière image après avoir fini son fondu.
        await page.evaluate(f"""()=>{{
          window.exitSamples=[];
          window.exitCapture=new Promise((resolve,reject)=>{{
            const start=performance.now();
            const sample=()=>{{
              const el=document.querySelector({json.dumps(PLAYER)});
              if(!el) return resolve(window.exitSamples);
              window.exitSamples.push(Number(getComputedStyle(el).opacity));
              if(performance.now()-start>3000) return reject(new Error('Le lecteur reste monté après sa fermeture'));
              requestAnimationFrame(sample);
            }};
            requestAnimationFrame(sample);
          }});
        }}""")
        close_button = player.get_by_role('button', name='Retour', exact=True) if embed else player.locator('button').first
        if action == 'escape':
            # Le focus d'une iframe appartient à son document ; ici, on teste
            # le raccourci du lecteur hôte.
            await close_button.focus()
            await page.keyboard.press('Escape')
        elif action == 'back':
            await page.go_back()
        elif action == 'double-click':
            await close_button.evaluate('(button)=>{button.click();button.click();}')
        else:
            await close_button.click()

        samples = await page.evaluate('window.exitCapture')
        await expect(player).to_have_count(0)
        assert all(b <= a + 0.005 for a, b in zip(samples, samples[1:])), f'Flash pendant la sortie : {samples}'
        assert await page.evaluate('window.catalogRenders') == before, 'Fermer le lecteur recalcule la grille'
        await expect(page).to_have_url('https://livetv.test/live-tv')
        await page.wait_for_function('!history.state?.playerOpen')
        returned_state = await page.evaluate('history.state')
        assert returned_state == base_state, {'action': action, 'returned': returned_state, 'expected': base_state}
        assert await page.evaluate('window.lenisStopped') is False
        assert await page.evaluate('document.documentElement.style.overflow') == ''
        assert await page.evaluate('document.body.style.overflow') == ''
        assert abs(await page.evaluate('scrollY') - scroll_before) < 2
        await expect(page.locator('[data-premid-live-context]')).to_have_count(0)

    if navigation:
        await page.go_back()
        await expect(page.get_by_role('link', name='Ouvrir la TV')).to_be_visible()
    assert not errors, errors
    print(json.dumps({'navigation': navigation, 'embed': embed, 'light': light, 'deepLink': deep_link, 'gridRendersOnOpenClose': 0, 'exitFlash': False}), flush=True)
    await context.close()


async def main():
    with tempfile.TemporaryDirectory(prefix='movix-player-lifecycle-') as directory:
        work = Path(directory)
        ad_fixture.build_fixture(work, real_player=True)
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch()
            for options in [{}, {'navigation': True}, {'navigation': True, 'embed': False}, {'light': True}, {'deep_link': True}]:
                await check_lifecycle(browser, work, **options)
            await browser.close()
    print('Live TV : vrai lecteur, sortie sans flash, historique, raccourcis et défilement vérifiés.')


if __name__ == '__main__':
    asyncio.run(main())

"""Captures the README screenshots from the live site.

Run: python3 tests/readme_shots.py
Needs playwright with chromium installed. SESSIA_BASE overrides the target.
"""
import asyncio
import os
from pathlib import Path

from playwright.async_api import async_playwright

BASE = os.environ.get('SESSIA_BASE', 'https://sessia-beta.vercel.app')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'screenshots'
SIG = Path('/tmp/sessia_sig.txt')
ADDRESS = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

PROVIDER = """
(() => {
  const address = '%s';
  const signature = '%s';
  window.ethereum = {
    isMetaMask: true,
    request: async ({ method }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (method === 'eth_chainId') return '0x38';
      if (method === 'personal_sign') return signature;
      if (method === 'wallet_switchEthereumChain') return null;
      throw new Error('stub');
    },
    on() {},
    removeListener() {},
    providers: [],
  };
})();
"""


async def shoot_landing(browser, out):
    context = await browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    page = await context.new_page()
    await page.goto(f'{BASE}/', wait_until='load')
    await page.wait_for_timeout(3000)
    await page.screenshot(path=str(out / 'landing.png'))
    for name, selector in (('research', '#research'), ('simulate', '#watchlist'), ('method', '#method')):
        section = page.locator(selector)
        if await section.count():
            await section.scroll_into_view_if_needed()
            await page.wait_for_timeout(900)
            await page.screenshot(path=str(out / f'{name}.png'))
    await context.close()


async def shoot_gate(browser, out):
    context = await browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    page = await context.new_page()
    await page.goto(f'{BASE}/agent.html', wait_until='load')
    await page.wait_for_timeout(2500)
    await page.screenshot(path=str(out / 'agent-gate.png'))
    await context.close()


async def shoot_answer(browser, out, provider, viewport, name):
    context = await browser.new_context(viewport=viewport, device_scale_factor=2)
    await context.add_init_script(provider)
    page = await context.new_page()
    await page.goto(f'{BASE}/agent.html', wait_until='load')
    await page.wait_for_timeout(2500)
    button = page.locator('#connect-wallet')
    if await button.count() and await button.is_visible():
        await button.click()
    await page.wait_for_selector('#message:not([disabled])', timeout=90000)
    await page.fill('#message', 'Compare the NVDA pool price with the APRO oracle right now.')
    await page.keyboard.press('Enter')
    await page.wait_for_function(
        "(() => { const n = document.querySelectorAll('.message.agent'); "
        "if (n.length < 2) return false; "
        "const t = n[n.length - 1].innerText || ''; "
        "return t.length > 120 && !t.includes('Reading the chain'); })()",
        timeout=90000,
    )
    await page.wait_for_timeout(2000)
    await page.screenshot(path=str(out / f'{name}.png'))
    await context.close()


async def main():
    out = OUT
    out.mkdir(parents=True, exist_ok=True)
    signature = SIG.read_text().strip() if SIG.exists() else '0x'
    provider = PROVIDER % (ADDRESS, signature)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        shots = [
            ('landing', lambda: shoot_landing(browser, out)),
            ('gate', lambda: shoot_gate(browser, out)),
            ('answer', lambda: shoot_answer(browser, out, provider, {'width': 1440, 'height': 900}, 'agent-answer')),
            ('mobile', lambda: shoot_answer(browser, out, provider, {'width': 390, 'height': 844}, 'agent-mobile')),
        ]
        for name, shot in shots:
            try:
                await shot()
                print('shot ok:', name)
            except Exception as error:
                print('shot skipped:', name, type(error).__name__, str(error)[:120])
        await browser.close()
    print('screenshots written to', out)


if __name__ == '__main__':
    asyncio.run(main())

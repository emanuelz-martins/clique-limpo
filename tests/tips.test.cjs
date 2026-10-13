const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

test('Dicas orientam sem ativar sozinhas e sem limites de frequência', { timeout: 120000 }, async t => {
  let receivedSiteClicks = 0;
  const trap = '<a id="trap" href="#ad" style="position:fixed;inset:0;z-index:1000"></a>';
  const server = http.createServer((request, response) => {
    if (request.url === '/site-click') { receivedSiteClicks++; response.end('ok'); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(`<!doctype html><meta charset="utf-8"><title>Teste das dicas</title>
      <style>body{font:16px Arial;background:#f4f3ef;color:#292929;margin:50px}h1{font-size:26px}button{padding:12px}iframe{width:700px;height:400px}</style>
      <script>window.siteClicks=0;document.addEventListener('click',()=>{window.siteClicks++;navigator.sendBeacon('/site-click');},true);</script>
      <h1>Uma página com conteúdo</h1><p>Uma dica discreta para entender a proteção.</p><button id="normal">Conteúdo normal</button>
      ${request.url === '/generic' ? '<div id="overlay" style="position:fixed;inset:0;z-index:1000"></div>' : ''}
      ${request.url === '/long' ? '<p>Conteúdo</p>'.repeat(2000) + trap : ''}
      ${request.url.startsWith('/trap') || request.url === '/frame' ? trap : ''}
      ${request.url === '/embedded' ? '<iframe src="/frame"></iframe>' : ''}`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = `http://exemplo.test:${server.address().port}`;
  const otherAddress = `http://outro.test:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clique-limpo-tips-'));
  let context;
  try {
    const extension = path.resolve(__dirname, '../clique-limpo');
    context = await chromium.launchPersistentContext(profile, {
      ...(process.env.CLIQUE_LIMPO_BROWSER ? { executablePath: process.env.CLIQUE_LIMPO_BROWSER } : { channel: 'msedge' }),
      headless: true, ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--host-resolver-rules=MAP exemplo.test 127.0.0.1, MAP outro.test 127.0.0.1']
    });
    context.setDefaultTimeout(10000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).hostname;
    const page = await context.newPage();
    await page.setViewportSize({ width: 1000, height: 720 });
    await page.goto(`${address}/normal`);
    const id = await worker.evaluate(async address => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(address)).id, address);
    const status = () => worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'STATUS' }, { frameId: 0 }), id);
    const waitForState = async (enabled, previousDocumentId) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        try {
          const state = await status();
          if (state.ready && state.enabled === enabled && (!previousDocumentId || state.documentId !== previousDocumentId)) return state;
        } catch (error) {
          if (!previousDocumentId || !error.message.includes('Receiving end does not exist')) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error('Estado de proteção não confirmado');
    };
    const hint = () => page.locator('[data-clique-limpo-ui="hint"]');
    const screenshots = path.resolve(__dirname, '../test-results');
    fs.mkdirSync(screenshots, { recursive: true });
    const freshHints = () => worker.evaluate(async () => {
      await chrome.storage.local.set({ 'help:enabled': true, 'help:sites': {} });
      await chrome.storage.session.remove('help:lastShown');
    });
    const openPopup = async () => {
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 380, height: 600 });
      await page.bringToFront();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.waitForFunction(() => !document.getElementById('enabled').disabled);
      return popup;
    };

    await t.test('boas-vindas aparecem só na primeira abertura; página normal não recebe alerta', async () => {
      await waitForState(false);
      const popup = await openPopup();
      await popup.locator('#welcome').waitFor({ state: 'visible' });
      await popup.locator('body').screenshot({ path: path.join(screenshots, 'design-welcome.png') });
      await popup.locator('#welcome-dismiss').click();
      assert.equal(await popup.locator('#welcome').isVisible(), false);
      await popup.close();
      const reopened = await openPopup();
      await reopened.waitForFunction(() => document.getElementById('welcome').hidden);
      await reopened.close();
      await page.waitForTimeout(2400);
      assert.equal(await hint().count(), 0);
      assert.equal((await status()).enabled, false);
    });

    await t.test('camada transparente sem link também sugere proteção', async () => {
      await freshHints();
      await page.goto(`${address}/generic`);
      await hint().waitFor({ state: 'visible' });
      assert.equal((await status()).enabled, false);
      assert.notEqual(await page.locator('#overlay').evaluate(el => getComputedStyle(el).display), 'none');
      await hint().locator('.later').click();
    });

    await t.test('o aviso encontra camadas depois dos primeiros 1800 elementos', async () => {
      await freshHints();
      await page.goto(`${address}/long`);
      await hint().waitFor({ state: 'visible' });
      assert.equal((await status()).enabled, false);
      await hint().locator('.later').click();
    });

    await t.test('pausar a reprodução permite retomar a inspeção sem mudar o DOM', async () => {
      await freshHints();
      await page.goto(`${address}/normal`);
      await page.evaluate(async html => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 80;
        canvas.getContext('2d').fillRect(0, 0, 80, 80);
        const video = document.createElement('video');
        video.muted = true;
        video.srcObject = canvas.captureStream(10);
        document.body.append(video);
        await video.play();
        document.body.insertAdjacentHTML('beforeend', html);
      }, trap);
      await page.waitForTimeout(2400);
      assert.equal(await hint().count(), 0, 'A dica não interrompe a reprodução');
      await page.evaluate(() => {
        document.querySelector('video').pause();
      });
      await hint().waitFor({ state: 'visible' });
      await hint().locator('.later').click();
    });

    await t.test('camada transparente sugere ativação; clique no aviso é protegido', async () => {
      await freshHints();
      await page.goto(`${address}/trap`);
      await hint().waitFor({ state: 'visible' });
      assert.equal((await status()).enabled, false);
      assert.deepEqual(await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules()), []);
      assert.notEqual(await page.locator('#trap').evaluate(el => getComputedStyle(el).display), 'none');
      await page.screenshot({ path: path.join(screenshots, 'design-page-tip.png') });
      await hint().screenshot({ path: path.join(screenshots, 'design-tip-card.png') });
      const beforeActivation = await status();
      await hint().locator('.activate').click();
      await waitForState(true, beforeActivation.documentId);
      await page.waitForLoadState('load');
      await hint().waitFor({ state: 'detached' });
      await page.waitForFunction(() => getComputedStyle(document.getElementById('trap')).display === 'none');
      assert.equal(await page.evaluate(() => window.siteClicks), 0, 'O site não recebe o clique de ativação do aviso');
      assert.equal(receivedSiteClicks, 0, 'Nenhum clique foi enviado pelo documento anterior ao recarregamento');
      assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 6);
      const state = await status();
      await worker.evaluate(message => enqueue(() => setPageEnabled(message)), { tabId: id, documentId: state.documentId, pageUrl: state.pageUrl, enabled: false });
      await waitForState(false);
      await hint().waitFor({ state: 'visible' });
      assert.equal((await status()).enabled, false, 'Desativar permite avisar novamente sem reativar a proteção');
      await hint().locator('.later').click();
    });

    await t.test('avisos voltam na mesma página, após recarregar e em outro site sem cotas', async () => {
      await freshHints();
      await page.goto(`${address}/trap?dismiss`);
      await hint().waitFor({ state: 'visible' });
      await hint().locator('.later').click();
      await hint().waitFor({ state: 'detached' });
      assert.equal((await status()).enabled, false);
      assert.equal(await page.evaluate(() => window.siteClicks), 0);
      await hint().waitFor({ state: 'visible', timeout: 12000 });
      assert.equal(await hint().count(), 1, 'A inspeção retoma e mantém somente um aviso por vez');
      await hint().locator('.later').click();
      await worker.evaluate(async origin => {
        await chrome.storage.local.set({ 'help:sites': { [origin]: Date.now() } });
        await chrome.storage.session.set({ 'help:lastShown': Date.now() });
      }, new URL(address).origin);
      await page.reload();
      await hint().waitFor({ state: 'visible' });
      await hint().locator('.later').click();
      await page.goto(`${otherAddress}/trap`);
      await hint().waitFor({ state: 'visible' });
      await hint().locator('.later').click();
      await page.goto(`${address}/trap`);
      await hint().waitFor({ state: 'visible' });
      await hint().locator('.later').click();
    });

    await t.test('dicas podem ser desativadas e reativadas pelo painel, inclusive para camadas tardias', async () => {
      await freshHints();
      await page.goto(`${address}/trap?mute`);
      await hint().waitFor({ state: 'visible' });
      await hint().locator('.mute').click();
      await hint().waitFor({ state: 'detached' });
      assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('help:enabled'))['help:enabled']), false);
      await page.reload();
      await page.waitForTimeout(2300);
      assert.equal(await hint().count(), 0);
      await page.goto(`${address}/normal`);
      const popup = await openPopup();
      assert.equal(await popup.locator('#tips-toggle').getAttribute('aria-pressed'), 'false');
      await popup.locator('#tips-toggle').click();
      assert.equal(await popup.locator('#tips-toggle').getAttribute('aria-pressed'), 'true');
      await popup.close();
      await page.waitForTimeout(2200);
      assert.equal(await hint().count(), 0);
      await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), trap);
      await hint().waitFor({ state: 'visible', timeout: 12000 });
      await hint().locator('.activate').focus();
      const beforeActivation = await status();
      await page.keyboard.press('Space');
      await waitForState(true, beforeActivation.documentId);
      await page.waitForLoadState('load');
      assert.equal(await page.evaluate(() => window.siteClicks), 0, 'Ativação pelo teclado também não vaza para o site');
      assert.equal(receivedSiteClicks, 0);
    });

    await t.test('uma camada dentro de iframe produz somente um aviso na página principal', async () => {
      await freshHints();
      // Change origin first to explicitly leave the previously armed site.
      await page.goto(`${otherAddress}/normal`);
      await page.goto(`${address}/embedded`);
      await waitForState(false);
      await hint().waitFor({ state: 'visible' });
      assert.equal(await hint().count(), 1);
      const frame = page.frames().find(frame => frame.url().endsWith('/frame'));
      assert.equal(await frame.locator('[data-clique-limpo-ui="hint"]').count(), 0);
      await hint().locator('.later').click();
    });
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    const relative = path.relative(os.tmpdir(), profile);
    if (!relative.startsWith('clique-limpo-tips-') || relative.includes(path.sep) || path.isAbsolute(relative)) throw new Error('Perfil de teste fora do destino esperado');
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

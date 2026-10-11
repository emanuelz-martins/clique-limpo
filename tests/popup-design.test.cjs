const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

test('Botão com carinha salva o estado e preserva a opção do player', { timeout: 60000 }, async () => {
  let pageRequests = 0;
  let adRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/early-ad.js') {
      adRequests++;
      response.setHeader('Content-Type', 'application/javascript');
      response.end('window.earlyAdRan=true;');
      return;
    }
    if (request.url === '/') pageRequests++;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><title>Teste do painel</title><script src="http://mrktmtrcs.net:${server.address().port}/early-ad.js"></script><button>Conteúdo normal</button>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = `http://exemplo.test:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clique-limpo-design-'));
  const extension = path.resolve(__dirname, '../clique-limpo');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      ...(process.env.CLIQUE_LIMPO_BROWSER ? { executablePath: process.env.CLIQUE_LIMPO_BROWSER } : { channel: 'msedge' }),
      headless: true, ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--host-resolver-rules=MAP exemplo.test 127.0.0.1, MAP mrktmtrcs.net 127.0.0.1']
    });
    context.setDefaultTimeout(10000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).hostname;
    const page = await context.newPage();
    await page.goto(address);
    const tabId = await worker.evaluate(async address => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(address)).id, address);
    const errors = [];
    let popup;
    const openPopup = async () => {
      if (popup) await popup.close();
      popup = await context.newPage();
      popup.on('pageerror', error => errors.push(error.message));
      await popup.setViewportSize({ width: 380, height: 600 });
      await page.bringToFront();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.waitForFunction(() => !document.getElementById('enabled').disabled || document.getElementById('status-pill').textContent === 'Indisponível');
    };
    const waitForState = async enabled => {
      await popup.waitForFunction(enabled => {
        const button = document.getElementById('enabled');
        return !button.disabled && button.getAttribute('aria-pressed') === String(enabled);
      }, enabled);
    };
    await openPopup();
    await popup.locator('#welcome-dismiss').click();
    assert.equal(await popup.locator('#enabled').getAttribute('aria-pressed'), 'false');
    assert.match(await popup.locator('#activation-face').getAttribute('src'), /face-inactive\.svg$/);
    assert.equal(await popup.locator('#tracking').count(), 0);
    const bounds = await popup.locator('body').boundingBox();
    assert.equal(bounds.width, 380);
    assert.ok(bounds.height <= 600, 'Painel deve caber na altura máxima do navegador');
    const layout = await popup.locator('main').evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight }));
    assert.ok(layout.content <= layout.height, `As ações devem estar visíveis sem rolagem no estado inicial (${layout.content}/${layout.height}); ${await popup.locator('#feedback').textContent()}`);
    const iconTitle = () => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId);
    const status = () => worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'STATUS' }, { frameId: 0 }), tabId);
    const beforeActivation = await status();
    assert.equal(pageRequests, 1);
    assert.equal(adRequests, 1, 'A página inicial desativada não bloqueia o script simulado');
    assert.equal(await popup.locator('#reload-notice').textContent(), 'Ao ativar, a página será recarregada.');
    assert.equal(await popup.locator('#toggle-hint, #description, .scope').count(), 0);
    await popup.locator('#enabled').click();
    await waitForState(true);
    await page.waitForLoadState('load');
    const afterActivation = await status();
    assert.notEqual(afterActivation.documentId, beforeActivation.documentId);
    assert.equal(pageRequests, 2, 'Ativação manual recarrega exatamente uma vez');
    assert.equal(adRequests, 1, 'As regras estão instaladas antes do recarregamento');
    assert.equal(await page.evaluate(() => window.earlyAdRan), undefined);
    assert.match(await iconTitle(), /ativo nesta página/);
    await openPopup();
    const screenshots = path.resolve(__dirname, '../test-results');
    fs.mkdirSync(screenshots, { recursive: true });
    await popup.locator('body').screenshot({ path: path.join(screenshots, 'design-active.png') });
    await context.route('https://github.com/emanuelz-martins/clique-limpo', route => route.fulfill({ contentType: 'text/html', body: '<title>Repositório simulado</title>' }));
    const openedRepository = context.waitForEvent('page');
    await popup.locator('.github-link').click();
    const repository = await openedRepository;
    await repository.waitForURL('https://github.com/emanuelz-martins/clique-limpo');
    await repository.close();
    await page.bringToFront();
    await openPopup();
    await waitForState(true);
    assert.equal((await status()).documentId, afterActivation.documentId, 'Voltar à aba protegida não recarrega');
    assert.equal(pageRequests, 2);
    await popup.locator('#compatibility').check();
    await popup.waitForFunction(() => !document.getElementById('compatibility').disabled);
    await popup.locator('#enabled img').click();
    await waitForState(false);
    assert.equal((await status()).documentId, afterActivation.documentId, 'Desativar não recarrega');
    assert.equal(pageRequests, 2);
    assert.match(await popup.locator('#activation-face').getAttribute('src'), /face-inactive\.svg$/);
    assert.equal(await popup.locator('#scan').isDisabled(), true);
    assert.equal(await popup.locator('#compatibility').isChecked(), true);
    await worker.evaluate(async () => {
      const stored = await chrome.storage.local.get('site:exemplo.test');
      if ('enabled' in stored['site:exemplo.test'] || stored['site:exemplo.test'].compatibility !== true) throw new Error('Preferências não preservadas');
    });
    assert.match(await iconTitle(), /desativado/);
    await openPopup();
    await waitForState(false);
    await popup.locator('body').screenshot({ path: path.join(screenshots, 'design-paused.png') });
    await popup.locator('#enabled').focus();
    await popup.keyboard.press('Space');
    await waitForState(true);
    assert.equal(await popup.locator('#compatibility').isChecked(), true);
    await page.waitForLoadState('load');
    assert.equal(pageRequests, 3, 'Ativar pelo teclado também recarrega uma única vez');
    assert.match(await iconTitle(), /ativo nesta página/);
    assert.deepEqual(errors, []);

    await page.goto('about:blank');
    await openPopup();
    await popup.waitForFunction(() => document.getElementById('status-pill').textContent === 'Indisponível');
    assert.equal(await popup.locator('#enabled').isDisabled(), true);
    assert.match(await popup.locator('#activation-face').getAttribute('src'), /face-inactive\.svg$/);
    await popup.locator('body').screenshot({ path: path.join(screenshots, 'design-unavailable.png') });
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    const relative = path.relative(os.tmpdir(), profile);
    if (!relative.startsWith('clique-limpo-design-') || relative.includes(path.sep) || path.isAbsolute(relative)) throw new Error('Perfil de teste fora do destino esperado');
    fs.rmSync(profile, { recursive: true, force: true });
  }
});


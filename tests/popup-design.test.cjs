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
    let staleStatusReply = false;
    const openPopup = async () => {
      if (popup) await popup.close();
      popup = await context.newPage();
      popup.on('pageerror', error => errors.push(error.message));
      await popup.setViewportSize({ width: 380, height: 600 });
      if (staleStatusReply) await popup.addInitScript(id => {
        if (!globalThis.chrome?.tabs?.sendMessage) return;
        const original = chrome.tabs.sendMessage;
        window.restoreStatusResponse = () => { chrome.tabs.sendMessage = original; };
        chrome.tabs.sendMessage = async (...args) => {
          const result = await Reflect.apply(original, chrome.tabs, args);
          if (args[0] === id && args[1]?.type === 'STATUS' && result?.ready) {
            window.staleStatusSeen = true;
            return { ...result, enabled: false };
          }
          return result;
        };
      }, tabId);
      await page.bringToFront();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.waitForFunction(() => !document.getElementById('enabled').disabled || document.getElementById('status-pill').textContent === 'Indisponível');
    };
    const waitForState = async enabled => {
      try {
        await popup.waitForFunction(enabled => {
          const button = document.getElementById('enabled');
          return !button.disabled && button.getAttribute('aria-pressed') === String(enabled);
        }, enabled);
      } catch (error) {
        error.message += '; Estado da origem: ' + JSON.stringify(await worker.evaluate(async id => ({ config: await configForTab(id), tab: await chrome.tabs.get(id), state: await chrome.tabs.sendMessage(id, { type: 'STATUS' }, { frameId: 0 }) }), tabId));
        throw error;
      }
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
    assert.ok(layout.content > layout.height, 'Ferramentas ficam abaixo da primeira tela, acessíveis por rolagem');
    const viewport = await popup.locator('main').boundingBox();
    const tools = await popup.locator('#page-tools').boundingBox();
    assert.ok(tools.y >= viewport.y + viewport.height - 1, 'Ferramentas não invadem a tela de ativação');
    const stats = await popup.locator('.stats-container').boundingBox();
    assert.ok(stats.y + stats.height <= viewport.y + viewport.height, 'Resumo cabe no rodapé da primeira tela');
    const iconTitle = () => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId);
    const status = () => worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'STATUS' }, { frameId: 0 }), tabId);
    const beforeActivation = await status();
    assert.equal(pageRequests, 1);
    assert.equal(adRequests, 1, 'A página inicial desativada não bloqueia o script simulado');
    assert.equal(await popup.locator('#reload-notice').textContent(), 'Ao ativar, a página será recarregada.');
    assert.equal(await popup.locator('#toggle-hint, #description, .scope, #state-label').count(), 0);
    assert.equal((await popup.locator('#enabled').boundingBox()).width, 220);
    const activationBounds = await popup.locator('#enabled').boundingBox();
    const playerBounds = await popup.locator('.tracking').boundingBox();
    assert.ok(playerBounds.y - activationBounds.y - activationBounds.height >= 24, 'Botão e cartão do player devem ter espaço entre eles');
    assert.equal(await popup.locator('#player-hint').textContent(), 'Ative se o vídeo não iniciar, o player não responder ou o áudio estiver em outro idioma. Esta opção pode ajudar, mas também pode travar alguns players. Teste com ela ativada e desativada para ver qual funciona melhor neste site. Ao ativar, a página será recarregada.');
    await popup.locator('#player-help').hover();
    await popup.locator('#player-hint').waitFor({ state: 'visible' });
    const hintBounds = await popup.locator('#player-hint').boundingBox();
    assert.ok(hintBounds.x >= 0 && hintBounds.x + hintBounds.width <= 380 && hintBounds.y >= viewport.y, 'Explicação cabe no painel');
    await popup.locator('#player-help').click();
    assert.equal(await popup.locator('#compatibility').isChecked(), false, 'Clicar na ajuda não ativa o player');
    assert.equal(pageRequests, 1, 'Consultar a ajuda não recarrega a página');
    await popup.mouse.move(0, 0);
    await popup.locator('#player-hint').waitFor({ state: 'visible' });
    await popup.locator('body').screenshot({ path: path.resolve(__dirname, '../test-results/design-player-help.png') });
    await popup.locator('#enabled').focus();
    await popup.locator('#player-hint').waitFor({ state: 'hidden' });
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
    await popup.locator('main').hover();
    await popup.mouse.wheel(0, 500);
    await popup.waitForFunction(() => {
      const viewport = document.querySelector('main').getBoundingClientRect();
      const actions = document.querySelector('.actions').getBoundingClientRect();
      const footer = document.querySelector('footer').getBoundingClientRect();
      return actions.top >= viewport.top && footer.bottom <= viewport.bottom;
    });
    await popup.locator('body').screenshot({ path: path.join(screenshots, 'design-options.png') });
    await popup.locator('#scan').click();
    await popup.waitForFunction(() => document.getElementById('feedback').textContent.startsWith('Verificação solicitada'));
    const feedback = await popup.locator('#feedback').boundingBox();
    assert.ok(feedback.y + feedback.height <= 600, 'Confirmação permanece visível após rolar');
    await context.route('https://github.com/emanuelz-martins/clique-limpo', route => route.fulfill({ contentType: 'text/html', body: '<title>Repositório simulado</title>' }));
    const openedRepository = context.waitForEvent('page');
    await popup.locator('.github-link').click();
    const repository = await openedRepository;
    await repository.waitForURL('https://github.com/emanuelz-martins/clique-limpo');
    await popup.waitForFunction(async () => {
      const tabs = await chrome.tabs.query({});
      const source = tabs.find(tab => tab.url?.startsWith('http://exemplo.test:'));
      return !(await chrome.tabs.sendMessage(source.id, { type: 'STATUS' }, { frameId: 0 })).enabled;
    });
    // Model the stale content reply at the messaging boundary. Session, current
    // document and tab activation stay real, without timing assumptions.
    staleStatusReply = true;
    try {
      await repository.close();
      await page.bringToFront();
      await openPopup();
      await waitForState(true);
      assert.equal(await popup.evaluate(() => window.staleStatusSeen), true, 'O cenário forneceu uma resposta antiga do content script');
      assert.equal(await popup.locator('#enabled').getAttribute('aria-pressed'), 'true', 'O painel consulta a ativação real mesmo com o snapshot antigo');
    } finally { staleStatusReply = false; await popup.evaluate(() => window.restoreStatusResponse?.()); }
    assert.equal((await status()).documentId, afterActivation.documentId, 'Voltar à aba protegida não recarrega');
    assert.equal(pageRequests, 2);
    await popup.locator('.tracking').click({ position: { x: 8, y: 23 } });
    await popup.waitForFunction(() => !document.getElementById('compatibility').disabled);
    await page.waitForLoadState('load');
    const afterPlayerOption = await status();
    assert.notEqual(afterPlayerOption.documentId, afterActivation.documentId);
    assert.equal(afterPlayerOption.compatibility, true);
    assert.equal(pageRequests, 3, 'Ativar a opção do player recarrega uma única vez');
    assert.equal(adRequests, 1, 'Proteção permanece ativa durante o recarregamento do player');
    const staleResult = await worker.evaluate(async message => {
      try { return await enqueue(() => setPlayerCompatibility(message)); }
      catch (error) { return { ok: false, error: error.message }; }
    }, { tabId, documentId: afterActivation.documentId, pageUrl: afterActivation.pageUrl, compatibility: false });
    assert.equal(staleResult.ok, false, 'Um painel antigo não pode alterar a preferência da página nova');
    assert.equal((await status()).compatibility, true);
    await popup.locator('#enabled img').click();
    await waitForState(false);
    assert.equal((await status()).documentId, afterPlayerOption.documentId, 'Desativar não recarrega');
    assert.equal(pageRequests, 3);
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
    assert.equal(pageRequests, 4, 'Ativar pelo teclado também recarrega uma única vez');
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


const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

test('Painel atualizado ajusta o player mesmo com worker anterior e preserva a proteção', { timeout: 60000 }, async () => {
  let requests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/') requests++;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><title>Atualização local</title><button>Player local</button>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clique-limpo-worker-'));
  let context;
  try {
    const extension = path.join(root, 'extension');
    fs.cpSync(path.resolve(__dirname, '../clique-limpo'), extension, { recursive: true });
    const workerFile = path.join(extension, 'background.js');
    const marker = 'chrome.runtime.onMessage.addListener((message, sender, respond) => {';
    const original = fs.readFileSync(workerFile, 'utf8');
    assert.ok(original.includes(marker));
    // Simulate the preceding worker: it supports existing configuration messages,
    // but does not know the new command used by the popup in version 1.0.3.
    fs.writeFileSync(workerFile, original.replace(marker, marker + '\n  if (message?.type === "SET_PLAYER_COMPATIBILITY") return;'));
    context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
      ...(process.env.CLIQUE_LIMPO_BROWSER ? { executablePath: process.env.CLIQUE_LIMPO_BROWSER } : { channel: 'msedge' }),
      headless: true, ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--host-resolver-rules=MAP exemplo.test 127.0.0.1']
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).hostname;
    const page = await context.newPage();
    const address = `http://exemplo.test:${server.address().port}/`;
    await page.goto(address);
    const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url).id, address);
    await worker.evaluate(async tabId => {
      const frame = await currentPage(tabId);
      await enqueue(() => setPageEnabled({ tabId, documentId: frame.documentId, pageUrl: frame.url, enabled: true }));
      await chrome.storage.local.set({ 'help:welcomeSeen': true, 'site:exemplo.test': { antiTraps: false } });
    }, tabId);
    const popup = await context.newPage();
    await page.bringToFront();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForFunction(() => !document.getElementById('compatibility').disabled);
    const before = await worker.evaluate(tabId => currentPage(tabId), tabId);
    await popup.locator('.tracking .option-label').click();
    await popup.waitForFunction(() => !document.getElementById('compatibility').disabled);
    assert.doesNotMatch(await popup.locator('#feedback').textContent(), /Não foi possível alterar|Reabra o painel/);
    assert.equal(await popup.locator('#compatibility').isChecked(), true);
    await page.waitForLoadState('load');
    assert.equal(requests, 2, 'Um único recarregamento ao ativar');
    const after = await worker.evaluate(tabId => currentPage(tabId), tabId);
    assert.notEqual(after.documentId, before.documentId);
    const saved = await worker.evaluate(async () => (await chrome.storage.local.get('site:exemplo.test'))['site:exemplo.test']);
    assert.equal(saved.compatibility, true);
    assert.equal(saved.antiTraps, false);
    assert.equal((await worker.evaluate(tabId => configForTab(tabId), tabId)).enabled, true);
    await popup.locator('#compatibility').uncheck();
    await popup.waitForFunction(() => !document.getElementById('compatibility').disabled);
    assert.equal(requests, 2, 'Desativar não recarrega');
    assert.equal(await popup.locator('#compatibility').isChecked(), false);
    await page.goto(address + '?next');
    await popup.locator('.tracking .option-label').click();
    await popup.waitForFunction(() => !document.getElementById('compatibility').disabled);
    assert.match(await popup.locator('#feedback').textContent(), /A página mudou/);
    assert.equal((await worker.evaluate(async () => chrome.storage.local.get('site:exemplo.test')))['site:exemplo.test'].compatibility, false, 'Painel antigo não modifica a página nova');
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    const relative = path.relative(os.tmpdir(), root);
    if (!relative.startsWith('clique-limpo-worker-') || relative.includes(path.sep) || path.isAbsolute(relative)) throw new Error('Perfil temporário fora do destino esperado');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

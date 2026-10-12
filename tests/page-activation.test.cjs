const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

test('Ativação manual acompanha o site em navegações e guias internas', { timeout: 60000 }, async t => {
  let probes = 0;
  let earlyProbes = 0;
  const server = http.createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 'no-store');
    if (request.url.startsWith('/probe')) { probes++; response.end('local'); return; }
    if (request.url.startsWith('/early-probe')) {
      earlyProbes++;
      response.setHeader('Content-Type', 'application/javascript');
      response.end('window.earlyAdRan=true;');
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(request.url === '/frame' ? '<!doctype html><button>Player</button>' :
      `<!doctype html><title>Ativação manual</title>${request.url.includes('early=1') ? `<script src="http://mrktmtrcs.net:${server.address().port}/early-probe"></script>` : ''}<button id="normal">Normal</button><a id="trap" href="#ad" style="position:fixed;inset:0;z-index:1000"></a><iframe src="/frame"></iframe>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const address = `http://exemplo.test:${port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clique-limpo-page-'));
  let context;
  try {
    const extension = path.resolve(__dirname, '../clique-limpo');
    context = await chromium.launchPersistentContext(profile, {
      ...(process.env.CLIQUE_LIMPO_BROWSER ? { executablePath: process.env.CLIQUE_LIMPO_BROWSER } : { channel: 'msedge' }),
      headless: true, ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--host-resolver-rules=MAP exemplo.test 127.0.0.1, MAP outro.test 127.0.0.1, MAP mrktmtrcs.net 127.0.0.1']
    });
    context.setDefaultTimeout(10000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const wait = async condition => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await condition()) return;
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error('Estado da página não confirmado');
    };
    const idForActiveTab = () => worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
    const status = id => worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'STATUS' }, { frameId: 0 }), id);
    const enable = async (id, enabled = true, expected) => {
      const state = expected || await status(id);
      const result = await worker.evaluate(message => enqueue(() => setPageEnabled(message)).catch(error => ({ ok: false, error: error.message })), {
        type: 'SET_PAGE_ENABLED', tabId: id, documentId: state.documentId, pageUrl: state.pageUrl, enabled
      });
      if (!expected) assert.equal(result.ok, true, result.error);
      return result;
    };
    const rules = () => worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
    const page = await context.newPage();
    await page.goto(`${address}/one`);
    const id = await idForActiveTab();

    await t.test('começa desligado e ignora a antiga ativação por domínio', async () => {
      await worker.evaluate(() => chrome.storage.local.set({ 'site:exemplo.test': { enabled: true, compatibility: false } }));
      await wait(async () => (await status(id)).ready);
      assert.equal((await status(id)).enabled, false);
      assert.notEqual(await page.locator('#trap').evaluate(el => getComputedStyle(el).display), 'none');
      assert.equal(await page.locator('html').getAttribute('data-clique-limpo-guard'), '0.7:paused:standard');
      assert.deepEqual(await rules(), []);
      assert.deepEqual(await worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules()), []);
      assert.equal(await page.evaluate(() => typeof window.canRunAds), 'undefined');
      const response = await page.evaluate(url => fetch(url).then(response => response.text()), `http://mrktmtrcs.net:${port}/probe?off`);
      assert.equal(response, 'local');
      assert.equal(probes, 1, 'Nenhum bloqueio global enquanto a proteção está desligada');
    });

    await t.test('ativar protege só a aba escolhida, incluindo frames e rede', async () => {
      await enable(id);
      await wait(async () => (await status(id)).enabled && (await status(id)).hidden === 1);
      const frame = page.frames().find(frame => frame.url().endsWith('/frame'));
      await wait(() => frame.locator('html').getAttribute('data-clique-limpo-guard').then(value => value === '0.7:active:embedded'));
      assert.equal(await frame.evaluate(() => window.open('https://asiafilm.org/local-test', '_blank')), null);
      assert.equal(await page.evaluate(() => window.canRunAds), true);
      assert.equal((await rules()).length, 6);
      assert.ok((await rules()).every(rule => JSON.stringify(rule.condition.tabIds) === JSON.stringify([id])));
      const failed = page.waitForEvent('requestfailed', { predicate: request => request.url().includes('/probe?on') });
      await page.evaluate(url => fetch(url).catch(() => null), `http://mrktmtrcs.net:${port}/probe?on`);
      assert.match((await failed).failure().errorText, /BLOCKED_BY_CLIENT/);
      assert.equal(probes, 1);
    });

    await t.test('trocar de aba pausa; voltar reativa sem outro clique', async () => {
      const second = await context.newPage();
      await second.goto(`${address}/one`);
      const secondId = await idForActiveTab();
      await wait(async () => (await status(secondId)).ready && !(await status(id)).enabled);
      assert.equal((await status(secondId)).enabled, false, 'Mesmo URL em outra aba começa desligado');
      assert.equal((await rules()).length, 6, 'A inspeção pausa, mas a contenção de rede permanece na origem');
      assert.notEqual(await page.locator('#trap').evaluate(el => getComputedStyle(el).display), 'none');
      assert.equal(await page.evaluate(() => typeof window.canRunAds), 'undefined');
      assert.match(await worker.evaluate(id => chrome.action.getTitle({ tabId: id }), id), /desativado/);
      await page.bringToFront();
      await wait(async () => (await status(id)).enabled && (await status(id)).hidden === 1);
      assert.ok((await rules()).every(rule => rule.condition.tabIds.includes(id)));
      assert.equal((await status(secondId)).enabled, false);
      await second.close();
    });

    await t.test('outra página no mesmo site mantém proteção inclusive durante o carregamento', async () => {
      const previous = await status(id);
      const failed = page.waitForEvent('requestfailed', { predicate: request => request.url().includes('/early-probe') });
      await page.goto(`${address}/two?early=1`);
      await wait(async () => (await status(id)).ready && (await status(id)).enabled && (await status(id)).hidden === 1);
      assert.match((await failed).failure().errorText, /BLOCKED_BY_CLIENT/);
      assert.equal(earlyProbes, 0, 'A nova página não pode abrir uma janela sem regras de rede');
      assert.equal(await page.evaluate(() => window.earlyAdRan), undefined);
      assert.equal((await rules()).length, 6);
      assert.equal((await enable(id, true, previous)).ok, false);
      assert.equal((await status(id)).enabled, true);
      await page.goBack();
      await wait(async () => (await status(id)).pageUrl === `${address}/one` && (await status(id)).enabled);
    });

    await t.test('recarregar preserva a proteção e rejeita comandos do documento anterior', async () => {
      await enable(id);
      await wait(async () => (await status(id)).enabled);
      const previous = await status(id);
      await page.reload();
      await wait(async () => (await status(id)).ready && (await status(id)).documentId !== previous.documentId);
      assert.equal((await status(id)).enabled, true);
      assert.equal((await rules()).length, 6);
      assert.equal((await enable(id, true, previous)).ok, false);
    });

    await t.test('rotas e fragmentos internos preservam a proteção', async () => {
      await enable(id);
      await wait(async () => (await status(id)).enabled);
      await page.evaluate(() => history.pushState({}, '', '/spa'));
      await wait(async () => (await status(id)).enabled && (await status(id)).pageUrl.endsWith('/spa'));
      assert.equal((await rules()).length, 6);
      await enable(id);
      await wait(async () => (await status(id)).enabled);
      await page.evaluate(() => location.hash = 'outro');
      await wait(async () => (await status(id)).enabled && (await status(id)).pageUrl.endsWith('#outro'));
      assert.equal((await rules()).length, 6);
    });

    await t.test('links internos em nova guia herdam proteção, inclusive sem opener', async () => {
      for (const rel of ['', 'noopener']) {
        await page.bringToFront();
        await wait(async () => (await status(id)).enabled);
        await page.evaluate(rel => {
          const link = document.createElement('a');
          link.id = 'film'; link.href = '/film?early=1'; link.target = '_blank'; link.rel = rel;
          link.textContent = 'Assistir filme'; document.body.append(link);
        }, rel);
        const opened = context.waitForEvent('page');
        await page.locator('#film').click();
        const child = await opened;
        // Protected links deliberately create a blank tab before navigating.
        try {
          await child.waitForURL(`${address}/film?early=1`);
          await child.waitForLoadState();
          await child.bringToFront();
          const childId = await idForActiveTab();
          await wait(async () => (await status(childId)).ready && (await status(childId)).enabled && (await status(childId)).hidden === 1);
          assert.equal(earlyProbes, 0, 'A guia interna deve bloquear os scripts de anúncio desde o carregamento');
          assert.equal(await child.evaluate(() => window.earlyAdRan), undefined);
          assert.ok((await rules()).every(rule => rule.condition.tabIds.includes(childId)));
          assert.equal((await status(id)).enabled, false, 'A origem pausa enquanto a guia filha está selecionada');
        } catch (error) {
          error.message += `; URL da guia filha: ${child.url()}`;
          throw error;
        } finally {
          await child.close();
          await page.bringToFront();
          await page.locator('#film').evaluate(el => el.remove());
        }
        await wait(async () => (await status(id)).enabled);
      }
    });

    await t.test('nova guia para outro site não herda a ativação', async () => {
      await page.evaluate(url => {
        const link = document.createElement('a'); link.id = 'other-site'; link.href = url;
        link.target = '_blank'; link.textContent = 'Outro site'; document.body.append(link);
      }, `http://outro.test:${port}/outside`);
      const opened = context.waitForEvent('page');
      await page.locator('#other-site').click();
      const child = await opened;
      await child.waitForURL(`http://outro.test:${port}/outside`);
      await child.waitForLoadState();
      await child.bringToFront();
      const childId = await idForActiveTab();
      await wait(async () => (await status(childId)).ready && !(await status(id)).enabled);
      assert.equal((await status(childId)).enabled, false);
      assert.equal((await rules()).length, 6, 'Abrir um link externo não libera a publicidade na origem');
      await child.close();
      await page.bringToFront();
      await wait(async () => (await status(id)).enabled);
    });

    await t.test('sair do site na mesma guia apaga ativação, sem reativar pelo histórico', async () => {
      await page.goto(`http://outro.test:${port}/outside`);
      await wait(async () => (await status(id)).ready && !(await status(id)).enabled);
      assert.deepEqual(await rules(), []);
      await page.goBack();
      await wait(async () => (await status(id)).host === 'exemplo.test' && !(await status(id)).enabled);
      assert.deepEqual(await rules(), []);
    });

    await t.test('pausar manualmente impede reativação ao voltar de outra aba', async () => {
      await enable(id);
      await wait(async () => (await status(id)).enabled);
      await enable(id, false);
      await wait(async () => !(await status(id)).enabled);
      const other = await context.newPage();
      await other.goto(`${address}/other`);
      await page.bringToFront();
      await wait(async () => !(await status(id)).enabled);
      assert.deepEqual(await rules(), []);
      await other.close();
      await page.close();
      await wait(async () => !(await worker.evaluate(id => chrome.storage.session.get(`page:${id}`), id))[`page:${id}`]);
    });
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    const relative = path.relative(os.tmpdir(), profile);
    if (!relative.startsWith('clique-limpo-page-') || relative.includes(path.sep) || path.isAbsolute(relative)) throw new Error('Perfil temporário fora do destino esperado');
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

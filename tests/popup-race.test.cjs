const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

test('TopFlix: frames síncronos, alvos externos e carregadores alternativos', { timeout: 120000 }, async t => {
  let adRequests = 0;
  let loaderRequests = 0;
  const formRequests = [];
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url.startsWith('/advert')) adRequests++;
    if (request.url.includes('filter.min.css') || request.url.includes('njson2csv.umd.min.js') || request.url === '/H/application.js') {
      loaderRequests++;
      response.setHeader('Content-Type', 'application/javascript');
      response.end('window.loaderRuns=(window.loaderRuns||0)+1;'); return;
    }
    if (request.url.startsWith('/form')) formRequests.push({ method: request.method, url: request.url });
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    const early = request.url === '/early' ? `<script>
      const frame=document.createElement('iframe');frame.style.display='none';frame.src='javascript:false';document.documentElement.append(frame);
      const popup=frame.contentWindow.open('about:blank','early-advert','width=240,height=160');window.earlyBlocked=popup===null;
      if(popup){try{popup.opener=null;popup.document.write('<meta http-equiv="refresh" content="0;url=http://outro.test:${server.address().port}/advert">');popup.document.close();}catch{}}
      frame.remove();
    </script>` : '';
    response.end(`<!doctype html><title>TopFlix simulado</title>${early}<button id="play">Reproduzir</button><p>Conteúdo normal</p>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const source = `http://tontonsfilmeurs.com:${port}`;
  const external = `http://outro.test:${port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clique-limpo-race-'));
  let context;
  try {
    const extension = path.resolve(process.env.CLIQUE_LIMPO_TEST_EXTENSION || path.join(__dirname, '../clique-limpo'));
    const hosts = ['tontonsfilmeurs.com', 'outro.test', 'mequyvgfqzj.com', 'zxggtzxmgijtea.com', 'c.adsco.re', 'd2klx87bgzngce.cloudfront.net', 'asiafilm.org'];
    context = await chromium.launchPersistentContext(profile, {
      ...(process.env.CLIQUE_LIMPO_BROWSER ? { executablePath: process.env.CLIQUE_LIMPO_BROWSER } : { channel: 'msedge' }),
      headless: true, ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--load-extension=${extension}`, `--disable-extensions-except=${extension}`, `--host-resolver-rules=${hosts.map(host => `MAP ${host} 127.0.0.1`).join(', ')}`]
    });
    context.setDefaultTimeout(10000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(() => {
      globalThis.testTargets = [];
      chrome.tabs.onCreated.addListener(tab => testTargets.push({ type: 'tab', id: tab.id, opener: tab.openerTabId, url: tab.url, pending: tab.pendingUrl }));
      chrome.webNavigation.onCreatedNavigationTarget.addListener(target => testTargets.push({ type: 'target', ...target }));
    });
    const page = await context.newPage();
    await page.goto(source);
    const id = await worker.evaluate(async source => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(source)).id, source);
    const wait = async condition => {
      for (let n = 0; n < 200; n++) {
        try { if (await condition()) return; }
        catch (error) { if (!/Receiving end does not exist|message port closed|Frame.*removed/i.test(error.message)) throw error; }
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error('Estado de proteção não confirmado: ' + JSON.stringify(await worker.evaluate(async id => ({ targets: testTargets, tabs: (await chrome.tabs.query({})).map(tab => ({ id: tab.id, url: tab.url, opener: tab.openerTabId })), config: await configForTab(id), session: await chrome.storage.session.get(null) }), id)));
    };
    const status = () => worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'STATUS' }, { frameId: 0 }), id);
    const enable = async enabled => {
      await wait(async () => (await status()).ready);
      const state = await status();
      await worker.evaluate(message => enqueue(() => setPageEnabled(message)), { tabId: id, documentId: state.documentId, pageUrl: state.pageUrl, enabled });
      await wait(async () => (await status()).enabled === enabled);
      await page.waitForFunction(enabled => document.documentElement.getAttribute('data-clique-limpo-guard').includes(enabled ? ':active:' : ':paused:'), enabled);
    };
    await wait(async () => (await status()).ready);
    await page.evaluate(() => {
      const frame = document.createElement('iframe'); frame.style.display = 'none'; document.body.append(frame);
      window.savedFrameWindow = frame.contentWindow;
      window.savedFrameOpen = frame.contentWindow.open;
    });
    await enable(true);
    async function installAttack(mode, forge = false) {
      await page.evaluate(({ mode, forge, ad }) => {
        if (forge) window.dispatchEvent(new CustomEvent('clique-limpo:config', { detail: JSON.stringify({ enabled: false, popupProtection: false }) }));
        document.getElementById('play').onclick = () => {
          const iframe = document.createElement('iframe'); iframe.src = 'javascript:false'; iframe.style.display = 'none'; document.body.append(iframe);
          let realm = mode === 'document' ? iframe.contentDocument.defaultView : iframe.contentWindow;
          if (mode === 'nested') {
            const nested = realm.document.createElement('iframe'); realm.document.body.append(nested); realm = nested.contentWindow;
          }
          const open = realm.open;
          const popup = Reflect.apply(open, realm, ['about:blank', `advert-${Date.now()}`, 'width=240,height=160']);
          window.attackBlocked = popup === null;
          if (popup) {
            try { popup.opener = null; popup.document.write(`<meta http-equiv="refresh" content="0;url=${ad}">`); popup.document.close(); } catch {}
          }
          window.playClicks = (window.playClicks || 0) + 1;
          iframe.remove();
        };
      }, { mode, forge, ad: `${external}/advert` });
    }
    await t.test('frame recém-inserido não abre janela antes da própria configuração', async () => {
      await installAttack('window');
      await page.locator('#play').click();
      assert.equal(await page.evaluate(() => window.attackBlocked), true, 'A chamada síncrona precisa devolver null antes de criar a janela');
      assert.equal(await page.evaluate(() => window.playClicks), 1, 'O clique legítimo continua funcionando');
      assert.equal(adRequests, 0);
    });
    if (process.env.CLIQUE_LIMPO_BASELINE) return;
    await t.test('função do iframe guardada antes da ativação também passa a bloquear', async () => {
      assert.equal(await page.evaluate(() => Reflect.apply(window.savedFrameOpen, window.savedFrameWindow, ['about:blank', 'cached-advert'])), null);
      assert.equal(adRequests, 0);
    });
    for (const mode of ['document', 'nested']) await t.test(`protege acesso por ${mode}, inclusive em compatibilidade`, async () => {
      await worker.evaluate(() => chrome.storage.local.set({ 'site:tontonsfilmeurs.com': { compatibility: true } }));
      await wait(async () => (await status()).compatibility);
      await installAttack(mode); await page.locator('#play').click();
      assert.equal(await page.evaluate(() => window.attackBlocked), true);
      assert.equal(adRequests, 0);
    });
    await t.test('worker contém janela vazia com opener removido mesmo após evento DOM falso', async () => {
      const before = (await status()).blockedPopups;
      await installAttack('window', true); await page.locator('#play').click();
      assert.equal(await page.evaluate(() => window.attackBlocked), false, 'Este caso força uma fuga do hook para testar a segunda defesa');
      await wait(async () => (await status()).blockedPopups > before);
      await wait(async () => (await worker.evaluate(() => chrome.tabs.query({}))).every(tab => !tab.url?.includes('/advert') && !tab.pendingUrl?.includes('/advert')));
      await worker.evaluate(id => notifyPage(id), id);
      await page.waitForFunction(() => document.documentElement.getAttribute('data-clique-limpo-guard').includes(':active:'));
    });
    await t.test('carregadores .css e fallback são bloqueados; outros arquivos do CDN continuam permitidos', async () => {
      const urls = [`http://mequyvgfqzj.com:${port}/esvg.filter.min.css`, `http://zxggtzxmgijtea.com:${port}/dXmm/njson2csv.umd.min.js`,
        `http://c.adsco.re:${port}/esvg.filter.min.css`, `http://d2klx87bgzngce.cloudfront.net:${port}/H/njson2csv.umd.min.js`];
      const load = urls => page.evaluate(urls => Promise.all(urls.map(src => new Promise(resolve => {
        const script = document.createElement('script'); script.src = src; script.onload = () => resolve(true); script.onerror = () => resolve(false); document.head.append(script);
      }))), urls);
      assert.deepEqual(await load(urls), [false, false, false, false]);
      assert.equal(loaderRequests, 0);
      assert.deepEqual(await load([`http://d2klx87bgzngce.cloudfront.net:${port}/H/application.js`]), [true]);
      assert.equal(loaderRequests, 1);
      const other = await context.newPage();
      await other.goto(external);
      await wait(async () => !(await status()).enabled);
      assert.equal(await worker.evaluate(async id => (await configForTab(id)).popupProtection, id), true);
      assert.deepEqual(await load(urls), [false, false, false, false], 'Mudar o foco não libera o carregador');
      await installAttack('window');
      await page.evaluate(() => document.getElementById('play').click());
      assert.equal(await page.evaluate(() => window.attackBlocked), true, 'O hook continua contendo aberturas no segundo plano');
      await worker.evaluate(() => initialize());
      assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 6, 'Reinicialização recupera as regras da sessão');
      await other.close(); await page.bringToFront(); await wait(async () => (await status()).enabled);
    });
    await t.test('desvio da própria aba para anunciante conhecido mantém proteção e volta ao site', async () => {
      const previous = await status();
      const requests = adRequests;
      await page.evaluate(url => { location.href = url; }, `http://asiafilm.org:${port}/advert`);
      await wait(async () => { const state = await status(); return state.ready && state.enabled && state.documentId !== previous.documentId && state.pageUrl.startsWith(source); });
      assert.equal(adRequests, requests, 'O destino conhecido não recebe a navegação');
      assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 6);
    });
    for (const mode of ['normal', 'ctrl', 'middle', 'named', 'shift', 'base']) await t.test(`link externo legítimo: ${mode}`, async () => {
      await page.evaluate(({ url, mode }) => {
        const link = document.createElement('a'); link.id = 'external'; link.href = url; link.textContent = 'Site externo';
        link.target = mode === 'named' ? 'destino-legitimo' : mode === 'base' ? '' : '_blank'; link.rel = 'noopener'; document.body.append(link);
        if (mode === 'base') { const base = document.createElement('base'); base.target = '_blank'; document.head.append(base); }
      }, { url: `${external}/outside?mode=${mode}`, mode });
      const opened = context.waitForEvent('page');
      await page.locator('#external').click(mode === 'ctrl' ? { modifiers: ['Control'] } : mode === 'middle' ? { button: 'middle' } : mode === 'shift' ? { modifiers: ['Shift'] } : {});
      const child = await opened;
      try {
        await child.waitForURL(`${external}/outside?mode=${mode}`);
        await child.waitForLoadState(); assert.equal(child.isClosed(), false);
      } finally { await child.close(); await page.bringToFront(); await page.locator('#external').evaluate(el => el.remove()); await page.locator('base').evaluateAll(elements => elements.forEach(el => el.remove())); }
      await wait(async () => (await status()).enabled);
    });
    await t.test('requestSubmit em formulário oculto não aproveita o clique no player', async () => {
      const before = formRequests.length;
      await page.evaluate(action => {
        const form = document.createElement('form'); form.id = 'fake-form'; form.action = action; form.target = '_blank'; form.style.display = 'none'; document.body.append(form);
        form.requestSubmit();
        document.getElementById('play').onclick = () => form.requestSubmit();
      }, `${external}/form?unwanted=1`);
      await page.locator('#play').click();
      await page.waitForTimeout(150);
      assert.equal(formRequests.length, before, 'Nenhuma navegação foi autorizada para o formulário invisível');
      await page.locator('#fake-form').evaluate(el => el.remove());
    });
    for (const mode of ['get', 'post', 'enter']) await t.test(`formulário ${mode} autorizado para nova aba`, async () => {
      const method = mode === 'enter' ? 'get' : mode;
      await page.evaluate(({ action, method }) => {
        const form = document.createElement('form'); form.id = 'form'; form.action = action; form.method = method; form.target = '_blank';
        form.innerHTML = '<input name="q" value="hello world"><button id="submit" type="submit">Enviar</button>'; document.body.append(form);
      }, { action: `${external}/form`, method });
      const opened = context.waitForEvent('page');
      if (mode === 'enter') await page.locator('#form input').press('Enter'); else await page.locator('#submit').click();
      const child = await opened;
      try { await child.waitForURL(url => url.pathname === '/form'); await child.waitForLoadState(); assert.equal(child.isClosed(), false); }
      finally { await child.close(); await page.bringToFront(); await page.locator('#form').evaluate(el => el.remove()); }
      assert.equal(formRequests.at(-1).method, method.toUpperCase());
      await wait(async () => (await status()).enabled);
    });
    await t.test('abertura inline antes da configuração é bloqueada ou contida após recarregar', async () => {
      const previous = await status();
      await page.goto(`${source}/early`);
      await wait(async () => { const state = await status(); return state.ready && state.enabled && state.documentId !== previous.documentId; });
      if (!await page.evaluate(() => window.earlyBlocked)) await wait(async () => (await status()).blockedPopups > 0);
      await wait(async () => (await worker.evaluate(() => chrome.tabs.query({}))).every(tab => !tab.url?.includes('/advert') && !tab.pendingUrl?.includes('/advert')));
      assert.equal(await page.evaluate(() => typeof window.earlyBlocked), 'boolean');
    });
    await t.test('desativar remove todas as regras e libera novamente os carregadores', async () => {
      await enable(false);
      assert.deepEqual(await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules()), []);
      const loaded = await page.evaluate(src => new Promise(resolve => {
        const script = document.createElement('script'); script.src = src; script.onload = () => resolve(true); script.onerror = () => resolve(false); document.head.append(script);
      }), `http://mequyvgfqzj.com:${port}/esvg.filter.min.css`);
      assert.equal(loaded, true); assert.equal(loaderRequests, 2);
      await installAttack('window');
      const opened = context.waitForEvent('page'); await page.locator('#play').click(); const child = await opened;
      try { await child.waitForURL(`${external}/advert`); assert.equal(await page.evaluate(() => window.attackBlocked), false); }
      finally { await child.close(); }
    });
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    const relative = path.relative(os.tmpdir(), profile);
    if (!relative.startsWith('clique-limpo-race-') || relative.includes(path.sep) || path.isAbsolute(relative)) throw new Error('Perfil fora do destino de teste');
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

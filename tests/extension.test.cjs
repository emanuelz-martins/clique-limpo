const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

test('Extensão real no Chromium', { timeout: 120000 }, async t => {
  let body = '';
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/pick-focus-frame')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><input id="frame-input"><script>window.frameEscapes=0;window.addEventListener("keydown",event=>{if(event.key==="Escape"){window.frameEscapes++;event.stopImmediatePropagation();}},true);</script>');
      return;
    }
    if (request.url.startsWith('/audio-choice-frame')) {
      response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' });
      response.end(`<!doctype html><button id="english">English</button><button id="portuguese">Portuguese</button><button id="play">Play</button><button id="pause">Pause</button><output id="selected">English</output><script>
        var currentAudioTrack=0;const listeners={};let selected=0;window.resumes=0;
        const instance={setup(){return this;},on(name,fn){(listeners[name]||=[]).push(fn);return this;},getCurrentAudioTrack(){return selected;},setCurrentAudioTrack(index){selected=index;document.getElementById('selected').textContent=index===1?'Portuguese':'English';for(const fn of listeners.audioTrackChanged||[])fn({currentTrack:index});}};
        window.jwplayer=()=>instance;const player=jwplayer('player').setup({file:'/episode.m3u8'});
        player.on('play',()=>{if(currentAudioTrack>=0&&player.getCurrentAudioTrack()!==currentAudioTrack)player.setCurrentAudioTrack(currentAudioTrack);});
        document.getElementById('english').onclick=()=>player.setCurrentAudioTrack(0);
        document.getElementById('portuguese').onclick=()=>player.setCurrentAudioTrack(1);
        document.getElementById('play').onclick=()=>{window.resumes++;for(const fn of listeners.play||[])fn();};
        document.getElementById('pause').onclick=()=>{};
      </script>`);
      return;
    }
    if (request.url.startsWith('/pause-mask-frame')) {
      const wav = Buffer.alloc(44 + 8000 * 2 * 5);
      wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
      wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
      wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
      wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
      response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' });
      response.end(`<!doctype html><audio id="media" src="data:audio/wav;base64,${wav.toString('base64')}"></audio><button id="play">Play</button><button id="pause">Pause</button><div class="sb-ad-mask" style="position:fixed;inset:0;z-index:1000;opacity:.01"></div><script>
        window.adClicks=0;const media=document.getElementById('media');const mask=document.querySelector('.sb-ad-mask');
        const stop=event=>{const target=event.target;if(typeof target.pause==='function')target.pause();};
        document.addEventListener('play',stop,true);
        mask.onclick=()=>{window.adClicks++;mask.remove();document.removeEventListener('play',stop,true);};
        document.getElementById('play').onclick=()=>media.play().catch(()=>{});
        document.getElementById('pause').onclick=()=>media.pause();
      </script>`);
      return;
    }
    if (request.url.startsWith('/jw-frame')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><button id="play">Play</button><script>
        window.adRequests=0;window.playClicks=0;window.lastSetup=null;
        const instance={setup(options){window.lastSetup=options;if(options.advertising){window.adRequests++;fetch('/ad-script.js');}return this;}};
        window.jwplayer=function(){return instance;};window.jwplayer.version='fixture';
        window.configure=()=>jwplayer('media').setup({file:'/episode.mp4',tracks:[{file:'/captions.vtt'}],advertising:{client:'vast',schedule:[{offset:'pre',tag:'/preroll'}]}});
        configure();document.getElementById('play').onclick=()=>window.playClicks++;
      </script>`);
      return;
    }
    if (request.url.startsWith('/nested-frame')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<iframe src="http://unknown-media.test:${server.address().port}/media-frame" style="width:700px;height:450px"></iframe>`);
      return;
    }
    if (request.url.startsWith('/media-frame')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><button id="play">Play</button><script>window.mediaClicks=0;window.popupResult="unset";document.addEventListener("click",()=>{window.popupResult=window.open("", "_blank");},true);document.getElementById("play").onclick=()=>window.mediaClicks++;</script>');
      return;
    }
    if (request.url.startsWith('/ad-script.js')) {
      response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
      response.end('window.sourceRan = (window.sourceRan || 0) + 1;');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(`<!doctype html><html><head><style>body{margin:0}button{margin:20px;padding:15px}</style></head><body>${body}</body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clique-limpo-test-'));
  const extension = path.resolve(__dirname, '../clique-limpo');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      ...(process.env.CLIQUE_LIMPO_BROWSER ? { executablePath: process.env.CLIQUE_LIMPO_BROWSER } : { channel: 'chromium' }),
      ignoreDefaultArgs: ['--disable-extensions'], headless: true, viewport: { width: 1000, height: 800 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--host-resolver-rules=MAP www.pobreflixtvhub.com 127.0.0.1, MAP acscdn.com 127.0.0.1, MAP llvpn.com 127.0.0.1, MAP superflixapi.quest 127.0.0.1, MAP unknown-media.test 127.0.0.1, MAP streambetter.shop 127.0.0.1, MAP xn--tckasiu6cvova0eb5fua2449g98vg.best 127.0.0.1']
    });
    context.setDefaultTimeout(10000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const tabId = async () => worker.evaluate(async address => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(address)).id, address);
    const message = async type => worker.evaluate(async ({ id, type }) => chrome.tabs.sendMessage(id, { type }, { frameId: 0 }), { id: await tabId(), type });
    const status = () => message('STATUS');
    const setEnabled = async (target, enabled) => {
      if (enabled) await target.bringToFront();
      const result = await worker.evaluate(async ({ url, enabled }) => {
        const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
        const frame = await chrome.webNavigation.getFrame({ tabId: tab.id, frameId: 0 });
        return enqueue(() => setPageEnabled({ tabId: tab.id, documentId: frame.documentId, pageUrl: frame.url, enabled }));
      }, { url: target.url(), enabled });
      assert.equal(result.ok, true, result.error);
    };
    const wait = async condition => {
      for (let i = 0; i < 80; i++) {
        if (await condition()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Condição não satisfeita em 4 segundos');
    };
    const visit = async html => {
      await worker.evaluate(() => chrome.storage.local.clear());
      await worker.evaluate(() => chrome.storage.session.clear());
      body = html;
      await page.bringToFront();
      await page.goto(address);
      await wait(async () => (await status()).ready && !(await status()).enabled);
      await setEnabled(page, true);
      await wait(async () => (await status()).ready && (await status()).enabled);
    };
    const layer = (tag = 'a', extra = '') => `<${tag} id="trap" ${tag === 'a' ? 'href="#ad"' : ''} style="position:fixed;inset:0;z-index:1000;${tag === 'iframe' ? 'width:100%;height:100%;' : ''}${extra}"></${tag}>`;

    await t.test('remove link transparente antes de clicar e mantém botão normal', async () => {
      await visit('<button id="normal">Normal</button>' + layer() + '<script>window.normal=0;document.getElementById("normal").onclick=()=>window.normal++;</script>');
      await wait(() => page.locator('#trap').evaluate(element => getComputedStyle(element).display === 'none'));
      await page.locator('#normal').click();
      assert.equal(await page.evaluate(() => window.normal), 1);
      assert.equal((await status()).hidden, 1);
    });
    await t.test('preserva texto, imagem, botão e modal legítimos', async () => {
      await visit('<a id="visible" href="#" style="position:fixed;inset:0;z-index:50">Link visível</a><div class="modal-backdrop" id="backdrop" style="position:fixed;inset:0;z-index:51"></div><div id="controls" style="position:fixed;inset:0;z-index:52"><button>Controle</button></div><div id="dialog-wrap" style="position:fixed;inset:0;z-index:53"><div role="dialog">Diálogo</div></div><a id="image-link" href="#" style="position:fixed;inset:0;z-index:54"><img alt="Imagem" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22/%3E"></a>');
      await page.waitForTimeout(200);
      assert.equal((await status()).hidden, 0);
      for (const id of ['visible', 'backdrop', 'controls', 'dialog-wrap', 'image-link']) assert.notEqual(await page.locator(`#${id}`).evaluate(element => getComputedStyle(element).display), 'none');
    });
    await t.test('preserva botão transparente e contêiner de iframe carregando', async () => {
      await visit('<div id="frame-shell" style="position:fixed;inset:0;z-index:50"><iframe id="media" src="about:blank"></iframe></div><div id="play" role="button" aria-label="Play" style="position:fixed;inset:0;z-index:60"></div><script>window.playClicks=0;document.getElementById("play").onclick=()=>window.playClicks++;</script>');
      await page.waitForTimeout(150);
      assert.equal((await status()).hidden, 0);
      await page.locator('#play').click();
      assert.equal(await page.evaluate(() => window.playClicks), 1);
      assert.notEqual(await page.locator('#frame-shell').evaluate(element => getComputedStyle(element).display), 'none');
    });
    await t.test('camada transparente de player mantém a reprodução de mídia', async () => {
      // Local PCM silence: exercises actual playback without external media.
      const wav = Buffer.alloc(44 + 8000 * 2 * 5);
      wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
      wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
      await visit(`<div class="jwplayer" style="position:relative;width:800px;height:500px"><audio id="media" src="data:audio/wav;base64,${wav.toString('base64')}"></audio><div id="play-surface" class="jw-display" style="position:absolute;inset:0;z-index:100"></div></div><script>document.getElementById('play-surface').onclick=()=>document.getElementById('media').play();</script>`);
      await page.locator('#play-surface').click();
      await wait(() => page.locator('#media').evaluate(element => !element.paused));
      assert.equal((await status()).hidden, 0);
      assert.equal((await status()).blocked, 0);
    });
    await t.test('não confunde contêiner com spinner visual com anúncio transparente', async () => {
      await visit('<div id="loading-shell" style="position:fixed;inset:0;z-index:100"><div style="width:60px;height:60px;border:5px solid green;border-radius:50%"></div></div>');
      await page.waitForTimeout(150);
      assert.equal((await status()).hidden, 0);
      assert.notEqual(await page.locator('#loading-shell').evaluate(element => getComputedStyle(element).display), 'none');
    });
    await t.test('restaura placeholder automático quando recebe um player assíncrono', async () => {
      await visit(layer('div'));
      await wait(async () => (await status()).hidden === 1);
      await page.locator('#trap').evaluate(element => { element.innerHTML = '<iframe src="about:blank"></iframe>'; });
      await wait(async () => (await status()).hidden === 0);
      assert.notEqual(await page.locator('#trap').evaluate(element => getComputedStyle(element).display), 'none');
      await message('PICK');
      await page.locator('#trap').click({ position: { x: 800, y: 500 } });
      await wait(async () => (await status()).hidden === 1);
      await page.locator('#trap').evaluate(element => element.insertAdjacentHTML('beforeend', '<button>Novo controle</button>'));
      await page.waitForTimeout(100);
      assert.equal((await status()).hidden, 1, 'A remoção manual não deve ser desfeita automaticamente');
    });
    await t.test('bloqueia destino publicitário conhecido e permite nova aba legítima', async () => {
      await visit('<button id="normal">Normal</button>');
      assert.equal(await page.evaluate(() => window.open('https://asiafilm.org/ad', '_blank')), null);
      assert.equal((await status()).blockedPopups, 1);
      const newPage = context.waitForEvent('page');
      await page.evaluate(() => window.open('about:blank', '_blank'));
      const allowed = await newPage;
      await allowed.close();
      await setEnabled(page, false);
      await wait(async () => !(await status()).enabled);
      // Pause must disable the page-world guard. Fulfill locally so no real
      // advertising code or network connection is involved in the allow check.
      await context.route('https://asiafilm.org/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Fixture local</p>' }));
      const pausedPage = context.waitForEvent('page');
      await page.evaluate(() => window.open('https://asiafilm.org/test', '_blank'));
      await (await pausedPage).close();
      await context.unroute('https://asiafilm.org/**');
    });
    await t.test('pop-up vazio em frame de mídia é bloqueado sem consumir clique de play', async () => {
      const port = server.address().port;
      await visit(`<iframe id="media" src="http://superflixapi.quest:${port}/media-frame" style="width:800px;height:500px"></iframe>`);
      const frame = page.frames().find(frame => frame.url().includes('superflixapi.quest'));
      assert.ok(frame);
      await frame.locator('#play').click();
      assert.equal(await frame.evaluate(() => window.popupResult), null);
      assert.equal(await frame.evaluate(() => window.mediaClicks), 1);
      await setEnabled(page, false);
      await wait(async () => !(await status()).enabled);
      // Frame configuration is asynchronous; wait for its known ad URL hook to
      // follow the actual preference using a harmless blank popup attempt.
      let allowed;
      for (let attempt = 0; attempt < 20 && !allowed; attempt++) {
        const before = context.pages().length;
        await frame.evaluate(() => window.open('', '_blank'));
        await page.waitForTimeout(30);
        allowed = context.pages().length > before ? context.pages().at(-1) : undefined;
      }
      assert.ok(allowed, 'A pausa do site principal deve permitir a abertura no frame');
      await allowed.close();
    });
    await t.test('protege provedor desconhecido em iframe aninhado e preserva links visíveis', async () => {
      await worker.evaluate(() => chrome.storage.local.clear());
      const port = server.address().port;
      body = `<iframe src="http://superflixapi.quest:${port}/nested-frame" style="width:800px;height:600px"></iframe>`;
      const knownPage = await context.newPage();
      await knownPage.goto(`http://www.pobreflixtvhub.com:${port}/test`);
      await setEnabled(knownPage, true);
      const frame = knownPage.frames().find(frame => frame.url().includes('unknown-media.test'));
      assert.ok(frame);
      await wait(() => frame.locator('html').getAttribute('data-clique-limpo-guard').then(value => value === '0.7:active:embedded'));
      const before = context.pages().length;
      await frame.locator('#play').click();
      assert.equal(await frame.evaluate(() => window.popupResult), null);
      assert.equal(await frame.evaluate(() => window.mediaClicks), 1);
      assert.equal(await frame.evaluate(url => window.open(url, 'advertising-tab'), `${address}/unknown-ad`), null);
      await frame.evaluate(url => {
        const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.hidden = true;
        document.body.append(link); link.click(); link.remove();
      }, `${address}/unknown-ad`);
      await knownPage.waitForTimeout(100);
      assert.equal(context.pages().length, before, 'Nenhuma aba de anúncio deve existir');
      await frame.evaluate(url => {
        const link = document.createElement('a'); link.id = 'legitimate'; link.href = url; link.target = '_blank'; link.textContent = 'Abrir ajuda'; document.body.append(link);
      }, `${address}/help`);
      const legitimatePage = context.waitForEvent('page');
      await frame.locator('#legitimate').click();
      await (await legitimatePage).close();
      await setEnabled(knownPage, false);
      await wait(() => frame.locator('html').getAttribute('data-clique-limpo-guard').then(value => value === '0.7:paused:embedded'));
      const pausedPage = context.waitForEvent('page');
      await frame.evaluate(() => window.open('', '_blank'));
      await (await pausedPage).close();
      await knownPage.close();
      // Other websites retain ordinary programmatic popups from unknown frames.
      await visit(`<iframe src="http://unknown-media.test:${port}/media-frame"></iframe>`);
      const otherFrame = page.frames().find(frame => frame.url().includes('unknown-media.test'));
      const otherPage = context.waitForEvent('page');
      await otherFrame.evaluate(() => window.open('', '_blank'));
      await (await otherPage).close();
    });
    await t.test('oculta iframe quase invisível, preserva iframe visível', async () => {
      await visit(layer('iframe', 'opacity:0.01') + '<iframe id="visible-frame" style="position:fixed;width:400px;height:300px;z-index:20"></iframe>');
      await wait(() => page.locator('#trap').evaluate(element => getComputedStyle(element).display === 'none'));
      assert.notEqual(await page.locator('#visible-frame').evaluate(element => getComputedStyle(element).display), 'none');
    });
    await t.test('remove preroll do JW no site protegido e mantém mídia, pausa e outros sites', async () => {
      await worker.evaluate(() => chrome.storage.local.clear());
      const port = server.address().port;
      body = `<iframe src="http://superflixapi.quest:${port}/jw-frame" style="width:800px;height:500px"></iframe>`;
      const knownPage = await context.newPage();
      await knownPage.goto(`http://www.pobreflixtvhub.com:${port}/test`);
      await setEnabled(knownPage, true);
      const frame = knownPage.frames().find(frame => frame.url().includes('/jw-frame'));
      assert.ok(frame);
      await wait(() => frame.locator('html').getAttribute('data-clique-limpo-guard').then(value => value === '0.7:active:embedded'));
      await frame.evaluate(() => { window.adRequests = 0; configure(); });
      await wait(() => frame.locator('html').getAttribute('data-clique-limpo-preroll').then(value => value === 'skipped'));
      assert.deepEqual(await frame.evaluate(() => ({setup:window.lastSetup,requests:window.adRequests,version:jwplayer.version})), {
        setup:{file:'/episode.mp4',tracks:[{file:'/captions.vtt'}]},requests:0,version:'fixture'
      });
      await frame.locator('#play').click();
      assert.equal(await frame.evaluate(() => window.playClicks), 1);
      assert.equal(await frame.evaluate(() => jwplayer('media') === jwplayer('media')), true);
      await worker.evaluate(() => chrome.storage.local.set({ 'site:www.pobreflixtvhub.com': { enabled: true, compatibility: true } }));
      await wait(() => frame.locator('html').getAttribute('data-clique-limpo-compatibility').then(value => value === 'on'));
      await frame.evaluate(() => configure());
      assert.equal(await frame.evaluate(() => window.adRequests), 1, 'Modo compatível mantém a configuração original do player');
      await setEnabled(knownPage, false);
      await wait(() => frame.locator('html').getAttribute('data-clique-limpo-guard').then(value => value === '0.7:paused:embedded'));
      await frame.evaluate(() => configure());
      assert.equal(await frame.evaluate(() => window.adRequests), 2);
      assert.equal(await frame.evaluate(() => window.lastSetup.advertising.client), 'vast');
      await knownPage.close();
      await visit(`<iframe src="http://superflixapi.quest:${port}/jw-frame"></iframe>`);
      const otherFrame = page.frames().find(frame => frame.url().includes('/jw-frame'));
      assert.equal(await otherFrame.evaluate(() => window.adRequests), 1);
      assert.equal(await otherFrame.evaluate(() => window.lastSetup.advertising.client), 'vast');
    });
    await t.test('Canal 3: máscara de anúncio oculta não pausa o vídeo nem exige clique publicitário', async () => {
      await worker.evaluate(() => chrome.storage.local.clear());
      const port=server.address().port;
      body=`<iframe src="http://streambetter.shop:${port}/pause-mask-frame" style="width:800px;height:500px"></iframe>`;
      const knownPage=await context.newPage();
      await knownPage.goto(`http://www.pobreflixtvhub.com:${port}/test`);
      await setEnabled(knownPage, true);
      const frame=knownPage.frames().find(frame=>frame.url().includes('/pause-mask-frame'));
      assert.ok(frame);
      await wait(()=>frame.locator('.sb-ad-mask').evaluate(el=>getComputedStyle(el).display==='none'));
      await frame.locator('#play').click();
      await wait(()=>frame.locator('#media').evaluate(el=>!el.paused&&el.currentTime>0));
      assert.equal(await frame.evaluate(()=>window.adClicks),0);
      await frame.locator('#pause').click();
      assert.equal(await frame.locator('#media').evaluate(el=>el.paused),true,'Pausa manual deve funcionar');
      await worker.evaluate(()=>chrome.storage.local.set({'site:www.pobreflixtvhub.com':{enabled:true,compatibility:true}}));
      await wait(()=>frame.locator('html').getAttribute('data-clique-limpo-compatibility').then(value=>value==='on'));
      assert.notEqual(await frame.locator('.sb-ad-mask').evaluate(el=>getComputedStyle(el).display),'none');
      await frame.evaluate(()=>document.getElementById('media').play().catch(()=>{}));
      assert.equal(await frame.locator('#media').evaluate(el=>el.paused),true,'Compatibilidade restaura comportamento original');
      assert.equal(await frame.evaluate(()=>window.open('', '_blank')),null,'Bloqueio de novas guias deve permanecer');
      await knownPage.close();
    });
    await t.test('preserva a faixa escolhida ao pausar e retomar sem impor português', async () => {
      await worker.evaluate(()=>chrome.storage.local.clear());
      const port=server.address().port;
      const audioUrl=`http://xn--tckasiu6cvova0eb5fua2449g98vg.best:${port}/audio-choice-frame`;
      body=`<iframe src="${audioUrl}" style="width:800px;height:500px"></iframe>`;
      const knownPage=await context.newPage();
      await knownPage.goto(`http://www.pobreflixtvhub.com:${port}/test`);
      await setEnabled(knownPage, true);
      const frame=knownPage.frames().find(frame=>frame.url().includes('/audio-choice-frame'));
      assert.ok(frame);
      await wait(()=>frame.locator('html').getAttribute('data-clique-limpo-guard').then(value=>value==='0.7:active:embedded'));
      await frame.locator('#portuguese').click();
      for(let cycle=0;cycle<3;cycle++) {
        await frame.locator('#pause').click();await frame.locator('#play').click();
        assert.equal(await frame.locator('#selected').textContent(),'Portuguese');
      }
      await frame.locator('#english').click();
      await frame.locator('#pause').click();await frame.locator('#play').click();
      assert.equal(await frame.locator('#selected').textContent(),'English');
      // Opting out must stop changing the provider's cache.
      await worker.evaluate(()=>chrome.storage.local.set({'site:www.pobreflixtvhub.com':{enabled:true,compatibility:true}}));
      await wait(()=>frame.locator('html').getAttribute('data-clique-limpo-compatibility').then(value=>value==='on'));
      await frame.locator('#portuguese').click();await frame.locator('#play').click();
      assert.equal(await frame.locator('#selected').textContent(),'English');
      await knownPage.close();
      // The same provider embedded by an unrelated site retains its own behavior.
      await visit(`<iframe src="${audioUrl}"></iframe>`);
      const otherFrame=page.frames().find(frame=>frame.url().includes('/audio-choice-frame'));
      await otherFrame.locator('#portuguese').click();await otherFrame.locator('#play').click();
      assert.equal(await otherFrame.locator('#selected').textContent(),'English');
    });
    await t.test('preserva iframe de player em fade e recupera iframe que fica visível', async () => {
      await visit('<div style="opacity:0.01"><iframe id="fade" allowfullscreen style="position:absolute;inset:0;z-index:1000;opacity:0"></iframe></div>' + layer('iframe', 'opacity:0.01'));
      await wait(async () => (await status()).hidden === 1);
      assert.notEqual(await page.locator('#fade').evaluate(element => getComputedStyle(element).display), 'none');
      await page.locator('#trap').evaluate(element => { element.style.opacity = '1'; });
      await wait(async () => (await status()).hidden === 0);
      assert.notEqual(await page.locator('#trap').evaluate(element => getComputedStyle(element).display), 'none');
    });
    await t.test('detecta camadas adicionadas e reapresentadas pelo site', async () => {
      await visit('<p>Conteúdo</p>');
      await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), layer());
      await wait(async () => (await status()).hidden === 1);
      await page.locator('#trap').evaluate(element => element.style.setProperty('display', 'block', 'important'));
      await wait(() => page.locator('#trap').evaluate(element => getComputedStyle(element).display === 'none'));
      assert.equal((await status()).automaticTotal, 1);
    });
    await t.test('observador do site que desfaz a ocultação não trava timers nem cliques', async () => {
      await visit('<button id="normal">Normal</button>' + layer('div') + `<script>
        window.ticks=0; window.normal=0; window.rewrites=0; window.maxGap=0;
        let last=performance.now();
        setInterval(()=>{const now=performance.now(); window.maxGap=Math.max(window.maxGap,now-last);last=now;window.ticks++;},20);
        document.getElementById('normal').onclick=()=>window.normal++;
        const trap=document.getElementById('trap');
        new MutationObserver(()=>{if(trap.style.display==='none'){window.rewrites++;trap.style.setProperty('display','block','important');}}).observe(trap,{attributes:true,attributeFilter:['style']});
      </script>`);
      await page.waitForTimeout(1000);
      const responsiveness = await page.evaluate(() => ({ ticks:window.ticks, gap:window.maxGap, rewrites:window.rewrites }));
      assert.ok(responsiveness.rewrites >= 2, 'O teste deve exercitar observadores concorrentes');
      assert.ok(responsiveness.ticks >= 15, 'Timers devem continuar funcionando durante o conflito');
      assert.ok(responsiveness.gap < 500, 'Nenhum ciclo deve monopolizar a página por meio segundo');
      await page.locator('#normal').click();
      assert.equal(await page.evaluate(() => window.normal), 1);
      assert.equal((await status()).hidden, 1);
      await setEnabled(page, false);
      await wait(async () => !(await status()).enabled);
    });
    await t.test('intercepta clique síncrono e eventos de uma mesma interação', async () => {
      await visit('<p>Conteúdo</p><script>window.adClicks=0;window.bodyClicks=0;document.body.addEventListener("click",()=>window.bodyClicks++);</script>');
      const prevented = await page.evaluate(html => {
        document.body.insertAdjacentHTML('beforeend', html);
        const trap = document.getElementById('trap');
        trap.addEventListener('pointerdown', () => window.adClicks++);
        const first = trap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        const second = document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        const third = document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return [first, second, third];
      }, layer());
      assert.deepEqual(prevented, [false, false, false]);
      assert.equal(await page.evaluate(() => window.adClicks + window.bodyClicks), 0);
      assert.equal((await status()).blocked, 1);
    });
    await t.test('restaura estilos originais e desativa nesta página', async () => {
      await visit(layer('a', 'display:block!important;visibility:visible;'));
      await wait(async () => (await status()).hidden === 1);
      await setEnabled(page, false);
      await wait(async () => !(await status()).enabled);
      assert.deepEqual(await page.locator('#trap').evaluate(element => [element.style.display, element.style.getPropertyPriority('display'), element.style.visibility, element.style.pointerEvents]), ['block', 'important', 'visible', '']);
      await page.reload();
      await wait(async () => (await status()).ready);
      assert.equal((await status()).enabled, false);
      assert.notEqual(await page.locator('#trap').evaluate(element => getComputedStyle(element).display), 'none');
      await setEnabled(page, true);
      await wait(async () => (await status()).hidden === 1);
    });
    await t.test('detecta armadilha em shadow DOM aberto', async () => {
      await visit('<div id="host"></div><script>document.getElementById("host").attachShadow({mode:"open"}).innerHTML=`<a href="#" id="shadow-trap" style="position:fixed;inset:0;z-index:100"></a>`;</script>');
      await wait(async () => (await status()).hidden === 1);
    });
    await t.test('seleção manual cancela e oculta sem disparar botão', async () => {
      await visit('<button id="normal">Normal</button><script>window.normal=0;document.getElementById("normal").onclick=()=>window.normal++;</script>');
      await message('PICK');
      await page.keyboard.press('Escape');
      assert.equal((await status()).picking, false);
      await message('PICK');
      await page.locator('#normal').click();
      assert.equal(await page.evaluate(() => window.normal), 0);
      assert.equal((await status()).manualTotal, 1);
      await setEnabled(page, false);
      await wait(() => page.locator('#normal').evaluate(element => getComputedStyle(element).display !== 'none'));
    });
    await t.test('Esc cancela mesmo com um ouvinte de teclado do site e restaura o foco', async () => {
      await visit('<input id="search"><script>window.siteEscapes=0;window.addEventListener("keydown",event=>{if(event.key==="Escape"){window.siteEscapes++;event.stopImmediatePropagation();}},true);</script>');
      await page.locator('#search').focus();
      await message('PICK');
      await page.keyboard.press('Escape');
      await wait(async () => !(await status()).picking);
      assert.equal(await page.locator('[data-clique-limpo-ui]').count(), 0);
      assert.equal(await page.evaluate(() => window.siteEscapes), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'search');
      assert.equal((await status()).manualTotal, 0);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.siteEscapes), 1, 'Fora da seleção, o site continua recebendo Esc');
    });
    await t.test('Esc cancela seleção com foco no player de outra origem', async () => {
      await visit(`<iframe id="player" src="http://unknown-media.test:${server.address().port}/pick-focus-frame" style="width:700px;height:400px"></iframe>`);
      const frame = page.frames().find(frame => frame.url().includes('/pick-focus-frame'));
      await frame.locator('#frame-input').focus();
      await message('PICK');
      await page.keyboard.press('Escape');
      await wait(async () => !(await status()).picking);
      assert.equal((await status()).manualTotal, 0);
      // The player can take focus back independently after the picker starts.
      await message('PICK');
      await frame.locator('#frame-input').focus();
      await page.keyboard.press('Escape');
      await wait(async () => !(await status()).picking);
      assert.equal(await page.locator('[data-clique-limpo-ui]').count(), 0);
    });
    await t.test('botão Cancelar funciona sem disparar o ouvinte de clique do site', async () => {
      await visit('<button id="normal">Normal</button><script>window.siteClicks=0;window.addEventListener("click",event=>{window.siteClicks++;event.stopImmediatePropagation();},true);</script>');
      await message('PICK');
      await page.keyboard.press('Enter');
      await wait(async () => !(await status()).picking);
      assert.equal(await page.evaluate(() => window.siteClicks), 0);
      assert.equal((await status()).manualTotal, 0);
      await message('PICK');
      await page.locator('#normal').click();
      assert.equal((await status()).manualTotal, 1);
      assert.equal(await page.evaluate(() => window.siteClicks), 0);
    });
    await t.test('bloqueia fontes de pop-up no site conhecido e respeita pausa', async () => {
      const knownPage = await context.newPage();
      const port = server.address().port;
      body = '<p>Fixture local do site conhecido</p>';
      await knownPage.goto(`http://www.pobreflixtvhub.com:${port}/test`);
      await setEnabled(knownPage, true);
      const knownTabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url).id, knownPage.url());
      const getRule = () => worker.evaluate(async id => (await chrome.declarativeNetRequest.getSessionRules()).find(rule => rule.id === 2000 && rule.condition.tabIds.includes(id)), knownTabId);
      await wait(async () => !!(await getRule()));
      for (const domain of ['acscdn.com', 'llvpn.com']) {
        const failed = knownPage.waitForEvent('requestfailed', { predicate: request => request.url().includes(domain) });
        await knownPage.evaluate(url => { const script = document.createElement('script'); script.src = url; document.body.append(script); }, `http://${domain}:${port}/ad-script.js`);
        assert.match((await failed).failure().errorText, /BLOCKED_BY_CLIENT/);
      }
      assert.equal(await knownPage.evaluate(() => window.sourceRan || 0), 0);
      await setEnabled(knownPage, false);
      await wait(async () => !(await getRule()));
      // The same hostname resolves to the local test server; no real ad code runs.
      await knownPage.evaluate(url => { const script = document.createElement('script'); script.src = url; document.body.append(script); }, `http://acscdn.com:${port}/ad-script.js?paused`);
      await wait(() => knownPage.evaluate(() => window.sourceRan === 1));
      // Requests from other sites remain allowed by this narrowly scoped rule.
      await page.evaluate(url => { const script = document.createElement('script'); script.src = url; document.body.append(script); }, `http://acscdn.com:${port}/ad-script.js?other`);
      await wait(() => page.evaluate(() => window.sourceRan === 1));
      await knownPage.close();
    });
    await t.test('popup controla proteções independentes e bloqueia rastreador na rede', async () => {
      await visit(layer());
      await wait(async () => (await status()).hidden === 1);
      const popup = await context.newPage();
      await page.bringToFront();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.locator('#enabled').waitFor({ state: 'attached' });
      await wait(() => popup.locator('#enabled').isEnabled());
      assert.equal(await popup.locator('#enabled').getAttribute('aria-pressed'), 'true');
      assert.equal(await popup.locator('#anti-traps').count(), 0, 'Popup deve exibir estritamente as 2 opções');
      assert.equal(await popup.locator('#compatibility').isChecked(),false);
      await popup.locator('#compatibility').check();
      await popup.waitForFunction(() => !document.getElementById('compatibility').disabled);
      await page.waitForLoadState('load');
      await wait(async()=>(await status()).compatibility===true);
      assert.equal((await status()).enabled,true);
      await wait(async () => (await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).some(rule => rule.id === 1000));
      const failed = page.waitForEvent('requestfailed', { predicate: request => request.url().includes('google-analytics.com') });
      await page.evaluate(() => fetch('https://www.google-analytics.com/g/collect?clique-limpo-test=1').catch(() => null));
      const request = await failed;
      assert.match(request.failure().errorText, /BLOCKED_BY_CLIENT/);
      const signalFailed = page.waitForEvent('requestfailed', { predicate: request => request.url().includes('/player/pop-signal') });
      await page.evaluate(() => fetch('https://superflixapi.quest/player/pop-signal?s=test').catch(() => null));
      assert.match((await signalFailed).failure().errorText, /BLOCKED_BY_CLIENT/);
      await popup.locator('#restore').click();
      await wait(async () => !(await status()).enabled);
      assert.equal((await status()).enabled, false);
      assert.equal((await status()).compatibility,true,'Pausar deve preservar preferência de compatibilidade');
      await popup.locator('#compatibility').uncheck();
      await wait(async()=>(await status()).compatibility===false);
      assert.equal((await status()).enabled,false,'Modo compatível não deve reativar proteção pausada');
      await wait(()=>popup.locator('#compatibility').isEnabled());
      assert.equal(await popup.locator('#compatibility').isChecked(),false,'Painel deve refletir a preferência confirmada');
      const pausedDocument = (await status()).documentId;
      await popup.locator('#compatibility').check();
      await popup.waitForFunction(() => !document.getElementById('compatibility').disabled);
      await page.waitForLoadState('load');
      assert.notEqual((await status()).documentId, pausedDocument);
      assert.equal((await status()).compatibility, true);
      assert.equal((await status()).enabled, false, 'Ativar a opção do player não ativa a proteção por conta própria');
      await popup.locator('main').evaluate(el=>{el.scrollTop=0;});
      await popup.locator('body').screenshot({ path: path.resolve(__dirname, '../test-results/popup.png') });
      await popup.close();
    });
    assert.deepEqual(errors, []);
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(profile));
    if (relative.includes(path.sep) || !relative.startsWith('clique-limpo-test-') || path.isAbsolute(relative)) throw new Error('Perfil temporário fora do diretório esperado');
    fs.rmSync(profile, { recursive: true, force: true });
  }
});




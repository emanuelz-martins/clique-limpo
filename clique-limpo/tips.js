/* Bounded, read-only hints while protection is off. No requests to ad services. */
(() => {
  "use strict";
  const topFrame = window === window.top;
  let config = {};
  let tipsEnabled = true;
  let stopped = false;
  let timer;
  let toast;
  let lastScan = 0;
  let scanning = false;
  let scanRevision = 0;
  let claimPending = false;
  let rescanNeeded = false;
  const detector = globalThis.CliqueLimpoDetector;
  const observer = new MutationObserver(() => {
    if (scanning) rescanNeeded = true;
    else schedule();
  });
  const face = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"3 -7.5 78 78\"><path fill=\"#171717\" d=\"M 72.488281 6.679688 C 75.371094 6.679688 77.707031 9.015625 77.707031 11.898438 L 77.707031 31.386719 C 77.707031 32.515625 77.339844 33.613281 76.664062 34.515625 L 61.527344 54.699219 C 60.542969 56.011719 58.992188 56.785156 57.351562 56.785156 L 27.078125 56.785156 C 25.4375 56.785156 23.890625 56.011719 22.902344 54.699219 L 7.769531 34.515625 C 7.089844 33.613281 6.726562 32.515625 6.726562 31.386719 L 6.726562 11.898438 C 6.726562 9.015625 9.0625 6.679688 11.945312 6.679688 Z M 11.109375 32.011719 C 10.972656 31.832031 10.898438 31.609375 10.898438 31.386719 L 10.898438 11.898438 C 10.898438 11.324219 11.367188 10.855469 11.945312 10.855469 L 72.488281 10.855469 C 73.0625 10.855469 73.53125 11.324219 73.53125 11.898438 L 73.53125 31.386719 C 73.53125 31.609375 73.457031 31.832031 73.320312 32.011719 L 58.1875 52.191406 L 58.148438 52.242188 C 57.964844 52.457031 57.699219 52.589844 57.414062 52.609375 L 27.019531 52.609375 C 26.710938 52.589844 26.429688 52.4375 26.246094 52.191406 Z M 11.109375 32.011719 \" fill-opacity=\"1\" fill-rule=\"evenodd\"/><path fill=\"#f7f7f7\" d=\"M 10.898438 31.386719 C 10.898438 31.609375 10.972656 31.832031 11.109375 32.011719 L 26.246094 52.191406 C 26.429688 52.4375 26.710938 52.589844 27.019531 52.609375 L 57.414062 52.609375 C 57.699219 52.589844 57.964844 52.457031 58.148438 52.242188 L 58.1875 52.191406 L 73.320312 32.011719 C 73.457031 31.832031 73.53125 31.609375 73.53125 31.386719 L 73.53125 11.898438 C 73.53125 11.324219 73.0625 10.855469 72.488281 10.855469 L 11.945312 10.855469 C 11.367188 10.855469 10.898438 11.324219 10.898438 11.898438 Z M 10.898438 31.386719 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/><path fill=\"#171717\" d=\"M 26.558594 20.25 C 26.558594 19.675781 27.023438 19.207031 27.601562 19.207031 L 29.6875 19.207031 C 30.265625 19.207031 30.734375 19.675781 30.734375 20.25 L 30.734375 30.6875 C 30.734375 31.265625 30.265625 31.734375 29.6875 31.734375 L 27.601562 31.734375 C 27.023438 31.734375 26.558594 31.265625 26.558594 30.6875 Z M 26.558594 20.25 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/><path fill=\"#171717\" d=\"M 53.699219 20.25 C 53.699219 19.675781 54.164062 19.207031 54.742188 19.207031 L 56.828125 19.207031 C 57.40625 19.207031 57.875 19.675781 57.875 20.25 L 57.875 30.6875 C 57.875 31.265625 57.40625 31.734375 56.828125 31.734375 L 54.742188 31.734375 C 54.164062 31.734375 53.699219 31.265625 53.699219 30.6875 Z M 53.699219 20.25 \" fill-opacity=\"1\" fill-rule=\"nonzero\"/><path d=\"M 34.4 44.7 L 38.3 39.8 H 46.1 L 50 44.7\" fill=\"none\" stroke=\"#171717\" stroke-width=\"4.175\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";

  function closeToast() {
    toast?.remove();
    toast = null;
  }
  function canScan() {
    return tipsEnabled && !stopped && config.documentId && !config.enabled && document.visibilityState === "visible";
  }
  function stop() {
    clearTimeout(timer);
    timer = null;
    observer.disconnect();
    scanRevision++;
    scanning = false;
    rescanNeeded = false;
  }
  function watch() {
    if (!canScan()) return;
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['style','class','href','onclick'] });
    schedule();
  }
  function schedule() {
    if (!canScan() || timer || scanning || claimPending || toast) return;
    timer = setTimeout(() => { timer = null; void scan(); }, Math.max(1800, 8000 - (Date.now() - lastScan)));
  }
  async function scan() {
    if (!canScan() || !document.body) return;
    // Skip hints during local media playback; leave the user's viewing uninterrupted.
    if ([...document.querySelectorAll('video,audio')].some(media => !media.paused)) return;
    lastScan = Date.now();
    scanning = true;
    rescanNeeded = false;
    const revision = ++scanRevision;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let remaining = 1800;
    while (canScan() && scanning && revision === scanRevision) {
      const deadline = performance.now() + 5;
      let batch = 80;
      while (batch-- > 0 && remaining-- > 0 && performance.now() < deadline) {
        const element = walker.nextNode();
        if (!element) {
          scanning = false;
          if (rescanNeeded) schedule();
          return;
        }
        const result = detector.inspect(element);
        if (result) {
          scanning = false;
          if (topFrame) await offerHint();
          else {
            stopped = true;
            stop();
            await chrome.runtime.sendMessage({ type: "HINT_CANDIDATE" }).catch(() => {});
          }
          return;
        }
      }
      // Yield more after each 1800 elements, then continue from this position.
      // Large documents and ordinary div overlays must not be silently skipped.
      const delay = remaining <= 0 ? 800 : 70;
      if (remaining <= 0) remaining = 1800;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    if (revision === scanRevision) scanning = false;
  }
  async function offerHint() {
    if (!topFrame || !canScan() || claimPending || toast) return;
    claimPending = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: "CLAIM_HINT", documentId: config.documentId });
      if (!result?.show) { stopped = true; stop(); return; }
      stopped = true;
      stop();
      if (!config.enabled && tipsEnabled && document.visibilityState === "visible") showToast();
    } catch { /* Missing permissions or an extension reload must not affect the page. */ }
    finally { claimPending = false; }
  }
  function showToast() {
    const host = document.createElement('div');
    host.setAttribute('data-clique-limpo-ui', 'hint');
    host.style.cssText = 'all:initial!important;position:fixed!important;bottom:20px!important;right:20px!important;width:342px!important;max-width:calc(100vw - 32px)!important;z-index:2147483647!important;display:block!important;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{color-scheme:dark}*{box-sizing:border-box}.tip{font:13px/1.45 "Segoe UI",Arial,sans-serif;color:#f4f2f1;background:#242222;border:1px solid #61504c;border-radius:18px;padding:17px;box-shadow:0 6px 24px #0004}
      .heading{display:flex;gap:10px;align-items:center}.face{width:35px;height:35px;flex:none}.face svg{width:100%;height:100%}h2{font-size:14px;margin:0;font-weight:600}.brand{color:#b9adaa;font-size:10px;margin:0 0 3px}p{margin:10px 0;color:#c9c0bd;font-size:12px}
      .actions{display:flex;gap:8px;margin-top:13px}button{font:600 12px "Segoe UI",Arial,sans-serif;cursor:pointer;border:0;border-radius:20px;min-height:34px;padding:8px 13px}.activate{background:#e24b4b;color:#fff}.later{background:#393232;color:#f4e9e5}button:focus-visible{outline:2px solid #ffb6b6;outline-offset:3px}button:disabled{opacity:.5;cursor:default}.mute{background:transparent;color:#b9adaa;font-size:10px;font-weight:400;padding:8px 0 0;min-height:26px}.error{color:#ffb6b6;margin:8px 0 0}[hidden]{display:none}
    </style><aside class="tip" role="status" aria-live="polite" aria-label="Dica do Clique Limpo">
      <div class="heading"><div class="face" aria-hidden="true">${face}</div><div><div class="brand">CLIQUE LIMPO · UMA DICA</div><h2>Proteja seus cliques aqui</h2></div></div>
      <p>Esta página pode ter anúncios invisíveis. Ao ativar a proteção, ela será recarregada.</p>
      <div class="actions"><button class="activate" data-action="activate">Ativar proteção</button><button class="later" data-action="later">Agora não</button></div>
      <button class="mute" data-action="mute">Não mostrar mais dicas</button><p class="error" hidden></p>
    </aside>`;
    document.documentElement.append(host);
    toast = host;
    setTimeout(() => { if (toast === host) closeToast(); }, 25000);
  }
  async function handleAction(action) {
    const host = toast;
    if (!host) return;
    if (action === 'later') { closeToast(); return; }
    if (action === 'mute') {
      tipsEnabled = false;
      closeToast();
      await chrome.storage.local.set({ 'help:enabled': false }).catch(() => {});
      return;
    }
    if (action !== 'activate') return;
    const button = host.shadowRoot.querySelector('.activate');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Ativando…';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'ACTIVATE_FROM_HINT', documentId: config.documentId, pageUrl: config.pageUrl });
      if (!result?.ok) throw new Error(result?.error || 'Não foi possível ativar. Abra o painel da extensão.');
      closeToast();
    } catch (error) {
      if (!host.isConnected) return;
      const message = host.shadowRoot.querySelector('.error');
      message.hidden = false;
      message.textContent = error.message;
      button.disabled = false;
      button.textContent = 'Tentar novamente';
    }
  }
  // Protect clicks on our own notice even while site protection is off.
  for (const type of ['pointerdown','pointerup','mousedown','mouseup','click','auxclick','touchstart','touchend','keydown','keyup']) {
    window.addEventListener(type, event => {
      if (!toast || !event.composedPath().includes(toast)) return;
      event.stopImmediatePropagation();
      if (type === 'click') {
        const button = event.composedPath().find(node => node instanceof Element && node.hasAttribute('data-action'));
        if (event.isTrusted && button) void handleAction(button.dataset.action);
      }
    }, true);
  }
  globalThis.CliqueLimpoTips = Object.freeze({
    update(next) {
      const wasEnabled = config.enabled;
      config = next;
      if (next.enabled || wasEnabled || !tipsEnabled) {
        if (wasEnabled && !next.enabled) stopped = true;
        closeToast(); stop();
      } else watch();
    },
    candidate(documentId) { if (config.documentId === documentId) void offerHint(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { stop(); closeToast(); }
    else watch();
  });
  // Playback can pause without changing the DOM. Retry when viewing stops.
  for (const type of ['pause', 'ended']) document.addEventListener(type, () => schedule(), true);
  window.addEventListener('resize', () => schedule());
  chrome.storage.local.get('help:enabled').then(stored => {
    tipsEnabled = stored['help:enabled'] !== false;
    if (!tipsEnabled) { stop(); closeToast(); } else watch();
  }).catch(() => { tipsEnabled = false; stop(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes['help:enabled']) return;
    tipsEnabled = changes['help:enabled'].newValue !== false;
    if (!tipsEnabled) { stop(); closeToast(); } else { stopped = false; watch(); }
  });
})();

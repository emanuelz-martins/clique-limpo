(() => {
  "use strict";
  const detector = globalThis.CliqueLimpoDetector;
  let enabled = false;
  let popupProtection = false;
  let compatibility = false;
  let strictPopups = false;
  const embedded = window !== window.top;
  const scanEnabled = () => enabled && !(compatibility && embedded);
  let host = "";
  let documentId;
  let pageUrl;
  let ready = false;
  let queued = false;
  let blocked = 0;
  let automaticTotal = 0;
  let manualTotal = 0;
  let blockedPopups = 0;
  let gestureUntil = 0;
  const hidden = new Map();
  const roots = new Set();
  const pending = new Map();
  const jobs = new Map();
  const recovery = new Set();
  const observed = new WeakSet();
  let picking = null;
  // Register at document start, before site shortcuts. Frame key events do not
  // bubble into the top document, so route their cancellation through the worker.
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (picking) {
      event.preventDefault();
      event.stopImmediatePropagation();
      stopPick();
    } else if (embedded && enabled && documentId) {
      void chrome.runtime.sendMessage({ type: "CANCEL_PICK", documentId }).catch(() => {});
    }
  }, true);
  const properties = ["display", "pointer-events", "visibility"];
  window.addEventListener("clique-limpo:popup-blocked", () => { if (enabled) blockedPopups++; });

  function hide(element, reason, manual = false) {
    if (hidden.has(element)) return false;
    // Keep undo storage bounded during long browsing sessions.
    for (const saved of hidden.keys()) if (!saved.isConnected) hidden.delete(saved);
    if (hidden.size >= 500) return false;
    const styles = properties.map(name => ({ name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) }));
    hidden.set(element, { styles, reason, manual });
    element.style.setProperty("display", "none", "important");
    element.style.setProperty("pointer-events", "none", "important");
    element.style.setProperty("visibility", "hidden", "important");
    if (manual) manualTotal++; else automaticTotal++;
    return true;
  }

  function unhide(element) {
    const saved = hidden.get(element);
    if (!saved) return;
    for (const { name, value, priority } of saved.styles) {
      if (value) element.style.setProperty(name, value, priority);
      else element.style.removeProperty(name);
    }
    hidden.delete(element);
  }

  function restore() {
    for (const element of hidden.keys()) unhide(element);
  }

  function inspect(element) {
    if (!scanEnabled() || !element.isConnected) return;
    const saved = hidden.get(element);
    if (saved) {
      if (!saved.manual && element.matches('iframe') && Number(getComputedStyle(element).opacity) > 0.05) unhide(element);
      else {
        const expected = ["none", "none", "hidden"];
        properties.forEach((property, index) => {
          if (element.style.getPropertyValue(property) !== expected[index] || element.style.getPropertyPriority(property) !== "important") {
            element.style.setProperty(property, expected[index], "important");
          }
        });
        return;
      }
    }
    const result = detector.inspect(element);
    if (result) {
      hide(element, result.reason);
      if (result.isFakePlayer) {
        const parentFake = element.closest('#fakeplayer, .fakeplayer, [class*="fakeplayer"]');
        if (parentFake && parentFake !== element) hide(parentFake, "Contêiner de Player Falso");
      }
      if (result.isFakeCaptcha) {
        for (const node of detector.ancestorChain(element)) {
          if (!node || node === document.body || node === document.documentElement) break;
          const nStyle = getComputedStyle(node);
          if (["fixed", "absolute"].includes(nStyle.position)) {
            hide(node, "Backdrop de Falso Captcha");
          }
        }
      }
    }
    if (element.shadowRoot) observeRoot(element.shadowRoot);
  }

  function queueFlush() {
    if (queued) return;
    queued = true;
    // Leave the observer microtask queue before changing styles. A competing
    // page observer must never create an endless synchronous style tug-of-war.
    setTimeout(() => requestAnimationFrame(flush), 50);
  }

  function schedule(root, subtree = true) {
    if (!scanEnabled() || !root) return;
    pending.set(root, subtree || pending.get(root) === true);
    if (pending.size > 128) {
      pending.clear();
      for (const observedRoot of roots) pending.set(observedRoot, true);
    }
    queueFlush();
  }

  function flush() {
    queued = false;
    if (!scanEnabled()) { pending.clear(); jobs.clear(); recovery.clear(); return; }
    const deadline = performance.now() + 6;
    let budget = 100;
    for (const element of recovery) {
      recovery.delete(element);
      const saved = hidden.get(element);
      if (saved && !saved.manual && element.querySelector('iframe,video,audio,button,input,select,textarea,[role="button"]')) unhide(element);
      if (--budget <= 0 || performance.now() >= deadline) break;
    }
    for (const [root, subtree] of pending) {
      if (budget <= 0 || performance.now() >= deadline) break;
      pending.delete(root);
      if (root instanceof Element) inspect(root);
      if (subtree && root.isConnected && !jobs.has(root)) {
        if (jobs.size < 32) jobs.set(root, document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT));
        else pending.set(document, true);
      }
      budget--;
    }
    for (const [root, walker] of jobs) {
      if (!root.isConnected) { jobs.delete(root); continue; }
      while (budget > 0 && performance.now() < deadline) {
        const element = walker.nextNode();
        if (!element) { jobs.delete(root); break; }
        inspect(element);
        budget--;
      }
      if (budget <= 0 || performance.now() >= deadline) break;
    }
    if (jobs.size || pending.size || recovery.size) queueFlush();
  }

  const observer = new MutationObserver(records => {
    if (!scanEnabled()) return;
    for (const record of records) {
      if (record.type === "attributes") {
        // Style/class changes in an animated player inspect only the changed
        // element, rather than continually enqueueing its whole subtree.
        schedule(record.target, false);
      } else {
        // A loading placeholder can become a real player after an async request.
        // Automatically recover a false positive; manual removals stay manual.
        if (hidden.size && record.target instanceof Element) {
          for (const element of detector.ancestorChain(record.target)) {
            if (hidden.has(element)) recovery.add(element);
          }
        }
        if (record.target instanceof Element) schedule(record.target, false);
        for (const node of record.addedNodes) if (node instanceof Element) schedule(node);
      }
    }
  });

  function observeRoot(root) {
    if (observed.has(root)) return;
    observed.add(root);
    roots.add(root);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden", "href", "onclick", "role", "aria-modal"] });
    schedule(root);
  }

  function guard(event) {
    if (picking) {
      if (event.type === "click") picking.choose(event);
      else if (["pointerdown", "mousedown"].includes(event.type)) picking.cancelDown(event);
      return;
    }
    if (!scanEnabled()) return;
    // Consume the rest of a blocked gesture after the overlay disappears.
    // Otherwise mouseup/click could reach an unrelated element below it.
    if (["pointerdown", "touchstart"].includes(event.type)) gestureUntil = 0;
    if (Date.now() < gestureUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (["click", "auxclick"].includes(event.type)) gestureUntil = 0;
      return;
    }
    for (const element of event.composedPath()) {
      if (!(element instanceof Element)) continue;
      const result = detector.inspect(element);
      if (!result) continue;
      event.preventDefault();
      event.stopImmediatePropagation();
      hide(element, result.reason);
      blocked++;
      if (!["click", "auxclick"].includes(event.type)) gestureUntil = Date.now() + 1500;
      break;
    }
  }

  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "auxclick", "touchstart", "touchend"]) {
    window.addEventListener(type, guard, { capture: true, passive: false });
  }

  const linkIntents = new WeakMap();
  const linkTarget = link => link.target || document.querySelector('base[target]')?.target || '_self';
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, event => {
    if (!strictPopups || !popupProtection || !event.isTrusted || event.defaultPrevented || type === 'keydown' && event.key !== 'Enter') return;
    const link = event.composedPath().find(node => node instanceof HTMLAnchorElement && node.href);
    if (!link) return;
    const intent = { url: link.href, target: linkTarget(link), expires: Date.now() + 5000 };
    linkIntents.set(link, intent);
    setTimeout(() => { if (linkIntents.get(link) === intent) linkIntents.delete(link); }, 5000);
  }, true);
  function openInternalTab(event) {
    if (!popupProtection || picking || !event.isTrusted || event.defaultPrevented || event.altKey) return;
    if (event.type === "click" && event.button !== 0 || event.type === "auxclick" && event.button !== 1) return;
    const link = event.composedPath().find(element => element instanceof HTMLAnchorElement && element.href);
    if (!link || link.hasAttribute("download")) return;
    const intent = linkIntents.get(link);
    linkIntents.delete(link);
    const saved = intent?.expires > Date.now() ? intent : null;
    const url = saved?.url || link.href;
    const rawTarget = saved?.target || linkTarget(link);
    const target = rawTarget.toLowerCase();
    const modified = event.ctrlKey || event.metaKey || event.type === "auxclick" && event.button === 1;
    const existingFrame = !['_self', '_parent', '_top', '_blank'].includes(target) && (Array.from(document.querySelectorAll('iframe[name],frame[name]')).some(frame => frame.name === rawTarget) || rawTarget === window.name);
    const newContext = modified || event.shiftKey || !existingFrame && !['_self', '_parent', '_top'].includes(target);
    try {
      const destination = new URL(url);
      if (!/^https?:$/.test(destination.protocol) || !strictPopups && destination.origin !== new URL(pageUrl).origin) return;
      if (!link.getClientRects().length || getComputedStyle(link).visibility !== 'visible') return;
    } catch { return; }
    if (!newContext) {
      if (saved && (link.href !== url || linkTarget(link) !== rawTarget)) {
        event.preventDefault(); event.stopImmediatePropagation();
        window.open(url, rawTarget);
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    void chrome.runtime.sendMessage({ type: "OPEN_PROTECTED_LINK", url, documentId, pageUrl, active: !modified, newWindow: event.shiftKey })
      .then(result => { if (!result?.ok) throw new Error(result?.error); })
      .catch(() => { if (!globalThis.CliqueLimpoPopupPolicy?.advertisement(url)) location.href = url; });
  }
  window.addEventListener("click", openInternalTab, true);
  window.addEventListener("auxclick", openInternalTab, true);
  const authorizedForms = new WeakSet();
  const formIntents = new WeakMap();
  const requestSubmit = HTMLFormElement.prototype.requestSubmit;
  function formDestination(form, submitter) {
    return {
      target: (submitter?.getAttribute('formtarget') || form.target || document.querySelector('base[target]')?.target || '_self').toLowerCase(),
      action: new URL(submitter?.getAttribute('formaction') || form.action, document.baseURI),
      method: (submitter?.getAttribute('formmethod') || form.method).toLowerCase()
    };
  }
  function recordFormIntent(event) {
    if (!strictPopups || !popupProtection || document.visibilityState !== 'visible' || !event.isTrusted || event.defaultPrevented) return;
    const control = event.composedPath().find(node => node instanceof HTMLButtonElement || node instanceof HTMLInputElement);
    if (!control?.form || !control.getClientRects().length || getComputedStyle(control).visibility !== 'visible') return;
    const submitter = ['submit', 'image'].includes(control.type) ? control : null;
    if (event.type === 'click' && !submitter || event.type === 'keydown' && event.key !== 'Enter') return;
    const form = control.form;
    const intent = formDestination(form, submitter);
    formIntents.set(form, intent);
    // Intent belongs to this specific form and interaction, never to arbitrary
    // requestSubmit calls made by another listener during a play-button click.
    setTimeout(() => { if (formIntents.get(form) === intent) formIntents.delete(form); }, 0);
  }
  window.addEventListener('click', recordFormIntent, true);
  window.addEventListener('keydown', recordFormIntent, true);
  window.addEventListener('submit', event => {
    const form = event.target;
    if (authorizedForms.has(form)) return;
    if (!strictPopups || !popupProtection || !event.isTrusted || event.defaultPrevented || !(form instanceof HTMLFormElement)) return;
    const submitter = event.submitter;
    const { target, action, method } = formDestination(form, submitter);
    if (['_self', '_parent', '_top'].includes(target)) return;
    if (!/^https?:$/.test(action.protocol) || method === 'dialog') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const intent = formIntents.get(form);
    formIntents.delete(form);
    // SubmitEvent.isTrusted also covers requestSubmit() called by site code.
    if (!intent || intent.action.href !== action.href || intent.method !== method || intent.target !== target) return;
    if (method === 'get') action.search = new URLSearchParams(new FormData(form, submitter || undefined)).toString();
    void chrome.runtime.sendMessage({ type: 'AUTHORIZE_FORM_TARGET', url: action.href, documentId, pageUrl }).then(result => {
      if (!result?.ok || !form.isConnected) return;
      authorizedForms.add(form);
      try { Reflect.apply(requestSubmit, form, submitter ? [submitter] : []); }
      finally { authorizedForms.delete(form); }
    }).catch(() => {});
  }, true);

  function stopPick() {
    if (!picking) return;
    const { ui, move, originalFocus } = picking;
    window.removeEventListener("pointermove", move, true);
    ui.remove();
    picking = null;
    if (originalFocus?.isConnected) originalFocus.focus({ preventScroll: true });
  }

  function startPick() {
    stopPick();
    const originalFocus = document.activeElement;
    const ui = document.createElement("div");
    ui.setAttribute("data-clique-limpo-ui", "");
    ui.style.cssText = "position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;display:block!important;";
    const shadow = ui.attachShadow({ mode: "closed" });
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;border:2px solid #e24b4b;background:rgba(226,75,75,.12);box-sizing:border-box;";
    const label = document.createElement("div");
    label.textContent = "Clique no elemento para ocultar · Esc cancela";
    label.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:10px 14px;background:#242222;color:#f4f2f1;border:1px solid #61504c;border-radius:12px;font:13px system-ui;box-shadow:0 4px 24px #0004;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    cancel.setAttribute("aria-label", "Cancelar seleção de elemento");
    cancel.style.cssText = "pointer-events:auto;border:0;border-radius:16px;padding:7px 12px;background:#e24b4b;color:white;font:600 12px system-ui;cursor:pointer;flex-shrink:0;";
    label.append(cancel);
    shadow.append(box, label);
    document.documentElement.append(ui);
    const targetOf = event => event.composedPath().find(node => node instanceof Element && node !== document.body && node !== document.documentElement && !node.hasAttribute("data-clique-limpo-ui"));
    const move = event => {
      const target = targetOf(event);
      if (!target) { box.style.display = "none"; return; }
      const rect = target.getBoundingClientRect();
      Object.assign(box.style, { display: "block", top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    };
    const cancelDown = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const choose = event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = targetOf(event);
      stopPick();
      if (target) hide(target, "Ocultado manualmente", true);
    };
    picking = { ui, move, choose, cancelDown, originalFocus };
    window.addEventListener("pointermove", move, true);
    window.focus();
    cancel.focus({ preventScroll: true });
  }

  async function refreshConfig() {
    try {
      const config = await chrome.runtime.sendMessage({ type: "GET_CONFIG" });
      host = config.host;
      documentId = config.documentId;
      pageUrl = config.pageUrl;
      enabled = config.enabled;
      popupProtection = config.popupProtection === true || config.popupProtection === undefined && enabled;
      compatibility = config.compatibility === true;
      strictPopups = config.strictPopups === true;
      ready = true;
      globalThis.CliqueLimpoTips?.update(config);
      window.dispatchEvent(new CustomEvent("clique-limpo:config", { detail: JSON.stringify({ enabled, popupProtection: config.popupProtection, host, compatibility, antiTraps: config.antiTraps !== false }) }));
      if (scanEnabled()) {
        observeRoot(document);
        for (const root of roots) schedule(root);
      } else {
        stopPick();
        gestureUntil = 0;
        for (const [element, saved] of hidden) if (!enabled || !saved.manual) unhide(element);
      }
    } catch {
      enabled = false;
      popupProtection = false;
      window.dispatchEvent(new CustomEvent("clique-limpo:config", { detail: "disabled" }));
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[`site:${host}`]) void refreshConfig();
  });

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "STATUS") {
      for (const element of hidden.keys()) if (!element.isConnected) hidden.delete(element);
      respond({ ready, enabled, compatibility, host, documentId, pageUrl, hidden: hidden.size, blocked, blockedPopups, automaticTotal, manualTotal, picking: !!picking });
    } else if (message?.type === "CONFIG_CHANGED") {
      void refreshConfig();
      respond({ ok: true });
    } else if (message?.type === 'POPUP_CONTAINED') {
      if (!documentId || message.documentId === documentId) blockedPopups++;
      respond({ ok: true });
    } else if (message?.type === "HINT_CANDIDATE") {
      globalThis.CliqueLimpoTips?.candidate(message.documentId);
      respond({ ok: true });
    } else if (message?.type === "SCAN") {
      for (const root of roots) schedule(root);
      respond({ ok: enabled });
    } else if (message?.type === "PICK") {
      if (enabled) startPick();
      respond({ ok: enabled });
    } else if (message?.type === "STOP_PICK") {
      const cancelled = !embedded && picking !== null && documentId === message.documentId;
      if (cancelled) stopPick();
      respond({ ok: cancelled });
    }
  });

  window.addEventListener("resize", () => { for (const root of roots) schedule(root); });
  window.addEventListener("pageshow", () => void refreshConfig());
  // Scroll changes which positioned elements intersect the viewport.
  window.addEventListener("scroll", () => schedule(document), { passive: true });
  void refreshConfig();
})();

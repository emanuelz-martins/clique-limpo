"use strict";
const $ = id => document.getElementById(id);
let tabId;
let host;
let state;
let busy = false;

function renderTips(enabled) {
  $("tips-toggle").setAttribute("aria-pressed", String(enabled));
  $("tips-toggle").textContent = "Dicas";
  $("tips-toggle").title = enabled ? "Dicas ativadas. Clique para desativar." : "Dicas desativadas. Clique para permitir novos avisos.";
}
$("welcome-dismiss").addEventListener("click", () => {
  $("welcome").hidden = true;
  void chrome.storage.local.set({ "help:welcomeSeen": true });
});
$("tips-toggle").addEventListener("click", async () => {
  const enabled = $("tips-toggle").getAttribute("aria-pressed") !== "true";
  $("tips-toggle").disabled = true;
  try {
    if (enabled) {
      await chrome.storage.local.remove('help:sites');
      await chrome.storage.session.remove('help:lastShown');
    }
    await chrome.storage.local.set({ "help:enabled": enabled });
    renderTips(enabled);
    $("feedback").textContent = enabled ? "Dicas ativadas. Os avisos aparecem apenas quando há uma camada suspeita." : "Dicas desativadas. Você ainda pode ativar a proteção pela carinha.";
  } catch { $("feedback").textContent = "Não foi possível salvar sua preferência de dicas."; }
  finally { $("tips-toggle").disabled = false; }
});
chrome.storage.local.get(["help:welcomeSeen", "help:enabled"]).then(stored => {
  $("welcome").hidden = stored["help:welcomeSeen"] === true;
  renderTips(stored["help:enabled"] !== false);
}).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes["help:enabled"]) renderTips(changes["help:enabled"].newValue !== false);
  if (changes["help:welcomeSeen"]?.newValue === true) $("welcome").hidden = true;
});

function render(next) {
  state = next;
  $("hostname").textContent = host;
  $("enabled").setAttribute("aria-pressed", String(next.enabled));
  $("enabled").setAttribute("aria-label", next.enabled ? "Desativar proteção nesta página" : "Ativar proteção nesta página");
  const face = `icons/face-${next.enabled ? "active" : "inactive"}.svg`;
  $("activation-face").src = face;
  $("brand-face").src = face;
  $("enabled").disabled = busy;
  $("compatibility").checked = next.compatibility === true;
  $("compatibility").disabled = busy;
  const pill = $("status-pill");
  if (pill) {
    pill.textContent = next.enabled ? "Ativo" : "Desativado";
    pill.className = `status-pill ${next.enabled ? "active" : "paused"}`;
  }
  $("hidden").textContent = next.hidden;
  $("blocked").textContent = next.blocked + (next.blockedPopups || 0);
  $("scan").disabled = busy || !next.enabled;
  $("pick").disabled = busy || !next.enabled;
  $("restore").disabled = busy || !next.enabled && !next.hidden;
}

async function readStatus() {
  const [next, page, tab, session] = await Promise.all([
    chrome.tabs.sendMessage(tabId, { type: "STATUS" }, { frameId: 0 }),
    chrome.webNavigation.getFrame({ tabId, frameId: 0 }),
    chrome.tabs.get(tabId),
    chrome.storage.session.get(`page:${tabId}`)
  ]);
  if (!next?.ready || next.documentId !== page?.documentId || next.pageUrl !== page?.url) throw new Error("A proteção ainda está iniciando. Reabra o painel em instantes.");
  const activation = session[`page:${tabId}`];
  // Content state may still reflect the previous focus while CONFIG_CHANGED is
  // queued. Use the trusted session/browser state for the popup's main button.
  const enabled = tab.active && activation?.enabled === true && activation.origin === new URL(page.url).origin;
  host = new URL(page.url).hostname;
  render({ ...next, enabled });
}

async function toggle(enabled) {
  const previousDocumentId = state.documentId;
  const result = await chrome.runtime.sendMessage({ type: "SET_PAGE_ENABLED", tabId, enabled, documentId: state.documentId, pageUrl: state.pageUrl });
  if (!result?.ok) throw new Error(result?.error || "Não foi possível alterar a proteção desta página.");
  for (let attempt = 0; attempt < (result.reloaded ? 60 : 15); attempt++) {
    await new Promise(resolve => setTimeout(resolve, result.reloaded ? 100 : 60));
    try {
      const next = await chrome.tabs.sendMessage(tabId, { type: "STATUS" }, { frameId: 0 });
      if (next?.ready && next.enabled === enabled && (!result.reloaded || next.documentId !== previousDocumentId)) { render(next); return; }
    } catch (error) { if (!result.reloaded) throw error; }
  }
  throw new Error("Reabra o painel para conferir a proteção desta página.");
}

async function act(work) {
  busy = true;
  render(state);
  try { await work(); } catch (error) { $("feedback").textContent = error.message; }
  finally { try { await readStatus(); } catch { /* Keep the last known state. */ } busy = false; render(state); }
}

$("enabled").addEventListener("click", () => {
  const enabled = !state.enabled;
  state = { ...state, enabled };
  void act(async () => { await toggle(enabled); $("feedback").textContent = enabled ? "Proteção ativada para navegar neste site nesta aba." : "Proteção desativada e elementos restaurados."; });
});
document.querySelector('.tracking').addEventListener('click', event => {
  // Keep the whole card clickable; its help button only explains the option.
  if (event.target.closest('button,input,label,.player-help')) return;
  if (!$("compatibility").disabled) $("compatibility").click();
});
$("compatibility").addEventListener("change", event => {
  const compatibility = event.target.checked;
  state = { ...state, compatibility };
  void act(async () => {
    const previousDocumentId = state.documentId;
    const result = await savePlayerOption(compatibility);
    if (!result?.ok) throw new Error(result?.error || "Não foi possível alterar a opção do player.");
    let confirmed = false;
    for (let attempt = 0; attempt < (result.reloaded ? 60 : 15); attempt++) {
      await new Promise(resolve => setTimeout(resolve, result.reloaded ? 100 : 60));
      try {
        const next = await chrome.tabs.sendMessage(tabId, { type: "STATUS" }, { frameId: 0 });
        if (next?.ready && next.compatibility === compatibility && (!result.reloaded || next.documentId !== previousDocumentId)) { render(next); confirmed = true; break; }
      } catch (error) { if (!result.reloaded) throw error; }
    }
    if (!confirmed) throw new Error("Reabra o painel para conferir a opção do player.");
    $("feedback").textContent = compatibility ? "Opção do player ativada. Página recarregada." : "Opção do player desativada.";
  });
});
async function savePlayerOption(compatibility) {
  // Unpacked updates can load the new popup while the preceding worker is still
  // running. Use stable browser APIs instead of requiring a new worker command.
  const page = await chrome.webNavigation.getFrame({ tabId, frameId: 0 });
  if (!page || page.documentId !== state.documentId || page.url !== state.pageUrl || !/^https?:/.test(page.url)) {
    throw new Error("A página mudou. Reabra o painel para ajustar o player.");
  }
  const key = `site:${new URL(page.url).hostname}`;
  const stored = await chrome.storage.local.get(key);
  const shouldReload = compatibility && stored[key]?.compatibility !== true;
  await chrome.storage.local.set({ [key]: { ...stored[key], compatibility } });
  if (shouldReload) {
    const current = await chrome.webNavigation.getFrame({ tabId, frameId: 0 });
    if (current?.documentId === page.documentId && current.url === page.url) {
      await chrome.tabs.reload(tabId);
      return { ok: true, reloaded: true };
    }
  }
  return { ok: true, reloaded: false };
}
$("scan").addEventListener("click", () => void act(async () => {
  await chrome.tabs.sendMessage(tabId, { type: "SCAN" }, { frameId: 0 });
  await new Promise(resolve => setTimeout(resolve, 300));
  await readStatus();
  $("feedback").textContent = "Verificação solicitada. Páginas maiores podem levar mais tempo.";
}));
$("pick").addEventListener("click", () => void act(async () => {
  await chrome.tabs.sendMessage(tabId, { type: "PICK" }, { frameId: 0 });
  window.close();
}));
$("restore").addEventListener("click", () => void act(async () => {
  await toggle(false);
  $("feedback").textContent = "Elementos restaurados. Proteção desativada nesta página.";
}));

(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https?:/.test(tab.url)) throw new Error("Abra um site HTTP ou HTTPS para usar a proteção.");
    tabId = tab.id;
    host = new URL(tab.url).hostname;
    for (let attempt = 0; attempt < 20; attempt++) {
      try { await readStatus(); break; }
      catch (error) {
        if (attempt === 19) throw error;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  } catch (error) {
    $("hostname").textContent = "Página indisponível";
    $("status-pill").textContent = "Indisponível";
    $("status-pill").className = "status-pill";
    $("feedback").textContent = error.message;
  }
})();

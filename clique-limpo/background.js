"use strict";

const pageKey = tabId => `page:${tabId}`;
const supported = url => /^https?:/.test(url || "");
const siteOrigin = url => { try { return supported(url) ? new URL(url).origin : ""; } catch { return ""; } };
const sameSite = (activation, url) => activation?.enabled === true && siteOrigin(url) !== "" && activation.origin === siteOrigin(url);
const pendingBlank = (activation, url) => activation?.pending === true && (!url || url === "about:blank");
const hostname = url => { try { return new URL(url).hostname; } catch { return ""; } };
const ruleIds = [1000, 1001, 2000];
let operations = Promise.resolve();
function enqueue(work) {
  const result = operations.then(work);
  operations = result.catch(error => console.warn("Clique Limpo:", error.message));
  return result;
}

async function currentPage(tabId) {
  return chrome.webNavigation.getFrame({ tabId, frameId: 0 }).catch(() => null);
}
async function configForTab(tabId) {
  const page = await currentPage(tabId);
  const host = hostname(page?.url);
  const key = pageKey(tabId);
  const [session, stored, tab] = await Promise.all([
    chrome.storage.session.get(key), chrome.storage.local.get(`site:${host}`), chrome.tabs.get(tabId).catch(() => null)
  ]);
  const activation = session[key];
  return {
    host, documentId: page?.documentId, pageUrl: page?.url,
    enabled: tab?.active === true && sameSite(activation, page?.url),
    compatibility: stored[`site:${host}`]?.compatibility === true,
    antiTraps: stored[`site:${host}`]?.antiTraps !== false
  };
}
async function updateIcon(tabId) {
  const config = await configForTab(tabId);
  const folder = config.enabled ? "active" : "inactive";
  await Promise.all([
    chrome.action.setIcon({ tabId, path: { 16: `icons/${folder}/16.png`, 32: `icons/${folder}/32.png` } }),
    chrome.action.setTitle({ tabId, title: supported(config.pageUrl) ? `Clique Limpo — ${config.enabled ? "ativo nesta página" : "desativado"} (${config.host})` : "Clique Limpo — abra um site para usar" })
  ]).catch(() => { /* The tab may have closed. */ });
}

let bundledRules;
async function syncNetworkRules() {
  bundledRules ||= Promise.all(["trackers.json", "ad-sources.json"].map(async file =>
    (await fetch(chrome.runtime.getURL(file))).json())).then(lists => lists.flat());
  const session = await chrome.storage.session.get(null);
  const tabs = await chrome.tabs.query({ active: true });
  const activePages = await Promise.all(tabs.map(async tab => {
    const activation = session[pageKey(tab.id)];
    if (!activation?.enabled) return null;
    const page = await currentPage(tab.id);
    return sameSite(activation, page?.url) || pendingBlank(activation, page?.url) ? tab.id : null;
  }));
  const tabIds = activePages.filter(Number.isInteger);
  const addRules = tabIds.length ? (await bundledRules).map(rule => ({
    ...rule, condition: { ...rule.condition, tabIds }
  })) : [];
  // Session rules can target individual tabs. No global blocking remains while off.
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ruleIds, addRules });
}
async function notifyPage(tabId) {
  await chrome.tabs.sendMessage(tabId, { type: "CONFIG_CHANGED" }).catch(() => {});
}
async function deactivatePage(tabId) {
  await chrome.storage.session.remove(pageKey(tabId));
  await syncNetworkRules();
  await Promise.all([notifyPage(tabId), updateIcon(tabId)]);
}

async function initialize() {
  // Migrate previous releases, whose rules and enabled preferences were global.
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
  const session = await chrome.storage.session.get(null);
  for (const [key, value] of Object.entries(session)) {
    if (!key.startsWith("page:")) continue;
    const page = await currentPage(Number(key.slice(5)));
    if (!sameSite(value, page?.url) && !pendingBlank(value, page?.url)) await chrome.storage.session.remove(key);
  }
  await syncNetworkRules();
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => updateIcon(tab.id)));
}
void enqueue(initialize);

chrome.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId !== 0) return;
  void enqueue(async () => {
    const key = pageKey(details.tabId);
    const stored = await chrome.storage.session.get(key);
    // Keep the existing network rules throughout navigation inside the chosen site.
    if (stored[key] && !sameSite(stored[key], details.url) && !pendingBlank(stored[key], details.url)) await deactivatePage(details.tabId);
  });
});
for (const event of [chrome.webNavigation.onCommitted, chrome.webNavigation.onHistoryStateUpdated, chrome.webNavigation.onReferenceFragmentUpdated]) {
  event.addListener(details => {
    if (details.frameId !== 0) return;
    void enqueue(async () => {
      const key = pageKey(details.tabId);
      const stored = await chrome.storage.session.get(key);
      if (stored[key] && !sameSite(stored[key], details.url) && !pendingBlank(stored[key], details.url)) {
        await deactivatePage(details.tabId);
      } else {
        if (stored[key]?.pending && sameSite(stored[key], details.url)) {
          await chrome.storage.session.set({ [key]: { enabled: true, origin: stored[key].origin } });
        }
        await syncNetworkRules();
        await Promise.all([notifyPage(details.tabId), updateIcon(details.tabId)]);
      }
    });
  });
}
async function inheritSite(sourceTabId, tabId, url) {
  const sourceKey = pageKey(sourceTabId);
  const stored = await chrome.storage.session.get(sourceKey);
  const activation = stored[sourceKey];
  const source = await currentPage(sourceTabId);
  if (!sameSite(activation, source?.url)) return;
  const blank = !url || url === "about:blank";
  if (!blank && !sameSite(activation, url)) return;
  const targetKey = pageKey(tabId);
  if ((await chrome.storage.session.get(targetKey))[targetKey]) return;
  await chrome.storage.session.set({ [pageKey(tabId)]: { enabled: true, origin: activation.origin, pending: blank } });
  await syncNetworkRules();
  await Promise.all([notifyPage(tabId), updateIcon(tabId)]);
}
async function openProtectedLink(message, sender) {
  const sourceId = sender.tab?.id;
  const source = await configForTab(sourceId);
  if (!source.enabled || source.documentId !== message.documentId || source.pageUrl !== message.pageUrl || siteOrigin(message.url) !== siteOrigin(source.pageUrl)) {
    throw new Error("A página de origem mudou ou a proteção foi desativada.");
  }
  // Install tab-scoped rules on a blank tab before its first site resources load.
  const child = await chrome.tabs.create({ url: "about:blank", openerTabId: sourceId, active: message.active !== false });
  try {
    await chrome.storage.session.set({ [pageKey(child.id)]: { enabled: true, origin: siteOrigin(source.pageUrl), pending: true } });
    await syncNetworkRules();
    await chrome.tabs.update(child.id, { url: message.url });
    return { ok: true };
  } catch (error) {
    await chrome.tabs.remove(child.id).catch(() => {});
    await chrome.storage.session.remove(pageKey(child.id));
    await syncNetworkRules();
    throw error;
  }
}
chrome.tabs.onCreated.addListener(tab => {
  if (Number.isInteger(tab.openerTabId)) void enqueue(() => inheritSite(tab.openerTabId, tab.id, tab.pendingUrl || tab.url));
});
chrome.webNavigation.onCreatedNavigationTarget.addListener(details => {
  void enqueue(() => inheritSite(details.sourceTabId, details.tabId, details.url));
});
chrome.tabs.onRemoved.addListener(tabId => void enqueue(async () => {
  await chrome.storage.session.remove(pageKey(tabId));
  await syncNetworkRules();
}));
chrome.tabs.onActivated.addListener(({ windowId }) => void enqueue(async () => {
  // Switching tabs suspends protection but keeps the chosen site in this tab.
  await syncNetworkRules();
  const tabs = await chrome.tabs.query({ windowId });
  await Promise.all(tabs.map(tab => Promise.all([notifyPage(tab.id), updateIcon(tab.id)])));
}));
chrome.tabs.onReplaced.addListener((_added, removed) => void enqueue(() => deactivatePage(removed)));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !Object.keys(changes).some(key => key.startsWith("site:"))) return;
  void enqueue(async () => {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.filter(tab => changes[`site:${hostname(tab.url)}`]).map(tab => notifyPage(tab.id)));
  });
});
async function setPageEnabled(message, { reloadOnActivation = false } = {}) {
  const page = await currentPage(message.tabId);
  if (!supported(page?.url) || !message.documentId || page.documentId !== message.documentId || page.url !== message.pageUrl) {
    throw new Error("A página mudou. Reabra o painel para ativar a página atual.");
  }
  const key = pageKey(message.tabId);
  const previous = await chrome.storage.session.get(key);
  const shouldReload = reloadOnActivation && message.enabled === true && !sameSite(previous[key], page.url);
  if (message.enabled === true) {
    await chrome.storage.session.set({ [pageKey(message.tabId)]: { enabled: true, origin: siteOrigin(page.url) } });
  } else {
    await chrome.storage.session.remove(pageKey(message.tabId));
  }
  await syncNetworkRules();
  await Promise.all([notifyPage(message.tabId), updateIcon(message.tabId)]);
  if (shouldReload) {
    const current = await currentPage(message.tabId);
    // A fresh internal navigation already loads with protection; do not reload it again.
    if (current?.documentId === page.documentId && current.url === page.url) {
      await chrome.tabs.reload(message.tabId);
      return { ok: true, reloaded: true };
    }
  }
  return { ok: true, reloaded: false };
}
async function claimHint(message, sender) {
  if (sender.frameId !== 0) return { show: false };
  const config = await configForTab(sender.tab.id);
  const tab = await chrome.tabs.get(sender.tab.id);
  if (!tab.active || config.enabled || config.documentId !== message.documentId) return { show: false };
  const origin = siteOrigin(config.pageUrl);
  const [local, session] = await Promise.all([
    chrome.storage.local.get(['help:enabled', 'help:sites']), chrome.storage.session.get('help:lastShown')
  ]);
  const now = Date.now();
  if (!origin || local['help:enabled'] === false || now - (session['help:lastShown'] || 0) < 10 * 60 * 1000 ||
      now - (local['help:sites']?.[origin] || 0) < 7 * 24 * 60 * 60 * 1000) return { show: false };
  const sites = Object.fromEntries(Object.entries({ ...local['help:sites'], [origin]: now }).sort((a, b) => b[1] - a[1]).slice(0, 64));
  await chrome.storage.local.set({ 'help:sites': sites });
  await chrome.storage.session.set({ 'help:lastShown': now });
  return { show: true };
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (Number.isInteger(sender.tab?.id) && message?.type === 'CLAIM_HINT') {
    void enqueue(() => claimHint(message, sender)).then(respond, () => respond({ show: false }));
    return true;
  }
  if (Number.isInteger(sender.tab?.id) && message?.type === 'HINT_CANDIDATE' && sender.frameId !== 0) {
    void enqueue(async () => {
      const config = await configForTab(sender.tab.id);
      if (!config.enabled) await chrome.tabs.sendMessage(sender.tab.id, { type: 'HINT_CANDIDATE', documentId: config.documentId }, { frameId: 0 }).catch(() => {});
      return { ok: true };
    }).then(respond, () => respond({ ok: false }));
    return true;
  }
  if (Number.isInteger(sender.tab?.id) && sender.frameId === 0 && message?.type === 'ACTIVATE_FROM_HINT') {
    void enqueue(async () => {
      const result = await setPageEnabled({ ...message, tabId: sender.tab.id, enabled: true }, { reloadOnActivation: true });
      await chrome.storage.local.set({ 'help:welcomeSeen': true });
      return result;
    }).then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "GET_CONFIG" && Number.isInteger(sender.tab?.id)) {
    void enqueue(() => configForTab(sender.tab.id)).then(respond, () => respond({ enabled: false, host: "" }));
    return true;
  }
  if (message?.type === "OPEN_PROTECTED_LINK" && Number.isInteger(sender.tab?.id)) {
    void enqueue(() => openProtectedLink(message, sender)).then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type !== "SET_PAGE_ENABLED") return;
  void enqueue(() => setPageEnabled(message, { reloadOnActivation: true })).then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});

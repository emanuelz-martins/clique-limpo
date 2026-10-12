/* Shared local policy in the worker and isolated content world. */
(() => {
  "use strict";
  const strictHosts = ['tontonsfilmeurs.com'];
  const adHosts = ['asiafilm.org', 'budgetezy.org', 'spartanamicus.com', 'linkonclick.com', 'ay267.com',
    'mequyvgfqzj.com', 'zxggtzxmgijtea.com', 'adsco.re', 'intelligenceadx.com', 'tagivi.com', 'createlouisville.org'];
  const matches = (host, list) => list.some(domain => host === domain || host.endsWith(`.${domain}`));
  globalThis.CliqueLimpoPopupPolicy = Object.freeze({
    strict(url) { try { return matches(new URL(url).hostname, strictHosts); } catch { return false; } },
    advertisement(url) { try { return matches(new URL(url).hostname, adHosts); } catch { return false; } }
  });
})();

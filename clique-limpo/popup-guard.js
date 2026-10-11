/* Page-world hook: inline advertising code can run inside nested media frames. */
(() => {
  "use strict";
  const adHosts = ["asiafilm.org", "budgetezy.org", "spartanamicus.com", "linkonclick.com", "ay267.com"];
  const mediaHosts = ["plenoflu.com", "superflixapi.quest", "vaiquecol.com"];
  const protectedSites = ["pobreflixtvhub.com"];
  let enabled = false;
  let compatibility = false;
  const nativeOpen = window.open;
  const nativeDispatch = window.dispatchEvent.bind(window);
  const NativeEvent = CustomEvent;
  const matchesHost = (host, domains) => domains.some(domain => host === domain || host.endsWith(`.${domain}`));
  const embedded = window !== window.top;
  const isProtectedHost = (host) => {
    if (!host) return false;
    if (host === "127.0.0.1" || host === "localhost") return false;
    return true;
  };

  const checkChain = () => {
    const ancestors = Array.from(location.ancestorOrigins || []);
    if (!ancestors.length) return matchesHost(location.hostname, protectedSites) || isProtectedHost(location.hostname);
    return ancestors.some(origin => {
      try {
        const host = new URL(origin).hostname;
        return matchesHost(host, protectedSites) || isProtectedHost(host);
      } catch { return false; }
    });
  };

  let protectedChain = checkChain();
  let visibleLink = null;
  const newWindow = target => !["_self", "_parent", "_top"].includes(String(target || "_blank").toLowerCase());
  const guardedFrame = () => embedded && (protectedChain || matchesHost(location.hostname, mediaHosts));
  let playerHookInstalled = false;
  const playerInstances = new WeakSet();
  const audioPlayers = new WeakSet();
  const factories = new WeakMap();

  function syncProviderAudioChoice(player) {
    if (!matchesHost(location.hostname, ["xn--tckasiu6cvova0eb5fua2449g98vg.best"]) ||
        !player || typeof player.on !== "function" || typeof player.getCurrentAudioTrack !== "function") return;
    const syncSelectedAudio = () => {
        if (!enabled || compatibility || !embedded || !protectedChain) return;
        try {
          const selected = player.getCurrentAudioTrack();
          if (Number.isInteger(selected) && selected >= 0 && typeof window.currentAudioTrack === "number") window.currentAudioTrack = selected;
        } catch { /* Keep playback working if the provider changes its API. */ }
      };
    try {
      if (!audioPlayers.has(player)) {
        player.on("audioTrackChanged", syncSelectedAudio);
        audioPlayers.add(player);
      }
      syncSelectedAudio();
    } catch { /* Other JW API versions remain unchanged. */ }
  }

  function wrapFactory(factory) {
    if (typeof factory !== "function") return factory;
    if (factories.has(factory)) return factories.get(factory);
    const wrapped = new Proxy(factory, {
      apply(target, thisArg, args) {
        const player = Reflect.apply(target, thisArg, args);
        syncProviderAudioChoice(player);
        if (player && typeof player.setup === "function" && !playerInstances.has(player)) {
          const nativeSetup = player.setup;
          try {
            player.setup = function(options, ...rest) {
              if (enabled && !compatibility && embedded && protectedChain && options && typeof options === "object" && !Array.isArray(options) && options.advertising) {
                // Keep the media URL, playlist, captions and controls intact.
                // Removing the ad setup prevents the player's preroll wait.
                const { advertising, ...mediaOptions } = options;
                document.documentElement?.setAttribute("data-clique-limpo-preroll", "skipped");
                return Reflect.apply(nativeSetup, this, [mediaOptions, ...rest]);
              }
              return Reflect.apply(nativeSetup, this, [options, ...rest]);
            };
            playerInstances.add(player);
          } catch { /* A read-only player instance remains untouched. */ }
        }
        return player;
      }
    });
    factories.set(factory, wrapped);
    return wrapped;
  }

  function installPlayerHook() {
    if (playerHookInstalled || !embedded || !protectedChain) return;
    const descriptor = Object.getOwnPropertyDescriptor(window, "jwplayer");
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) return;
    let library = descriptor?.value;
    try {
      Object.defineProperty(window, "jwplayer", {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() { return enabled && protectedChain ? wrapFactory(library) : library; },
        set(value) { library = value; }
      });
      playerHookInstalled = true;
    } catch { /* The page can define a non-configurable library global. */ }
  }
  installPlayerHook();

  // Universal media pause protection: intercept malicious listeners that immediately
  // pause a video on play event from document or window capture listeners.
  if (embedded) {
    const nativePause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function(...args) {
      const event = window.event;
      if (enabled && !compatibility && protectedChain && event?.type === "play" && event.target === this) {
        if (event.currentTarget === document || event.currentTarget === window || document.querySelector('.sb-ad-mask')) {
          return;
        }
      }
      return Reflect.apply(nativePause, this, args);
    };
  }

  // Defuse notification spam requests in media frames or protected streams
  if (typeof window.Notification === "function" && typeof window.Notification.requestPermission === "function") {
    const nativeReq = window.Notification.requestPermission;
    window.Notification.requestPermission = function(...args) {
      if (enabled && !compatibility && (embedded || protectedChain)) {
        report();
        return Promise.resolve("denied");
      }
      return Reflect.apply(nativeReq, this, args);
    };
  }

  // Prevent anti-inspection context menu blocks
  window.addEventListener("contextmenu", event => {
    if (enabled && !compatibility && protectedChain) {
      event.stopPropagation();
    }
  }, true);

  const adCheckOriginals = new Map();
  function syncAdCheckStubs() {
    for (const [name, value] of [["canRunAds", true], ["isAdBlockActive", false]]) {
      try {
        if (enabled) {
          if (!adCheckOriginals.has(name)) adCheckOriginals.set(name, Object.getOwnPropertyDescriptor(window, name));
          window[name] = value;
        } else if (adCheckOriginals.has(name)) {
          const original = adCheckOriginals.get(name);
          if (window[name] === value) {
            if (original) Object.defineProperty(window, name, original);
            else delete window[name];
          }
          adCheckOriginals.delete(name);
        }
      } catch { /* Respect globals that the site makes read-only. */ }
    }
  }

  function publish() {
    if (document.documentElement) {
      document.documentElement.setAttribute("data-clique-limpo-guard", `0.7:${enabled ? "active" : "paused"}:${guardedFrame() ? "embedded" : "standard"}`);
      document.documentElement.setAttribute("data-clique-limpo-compatibility", compatibility ? "on" : "off");
    }
  }
  if (document.documentElement) publish();
  else {
    const rootObserver = new MutationObserver(() => {
      if (document.documentElement) { rootObserver.disconnect(); publish(); }
    });
    rootObserver.observe(document, { childList: true });
  }

  const adPattern = /(?:asiafilm\.org|budgetezy\.org|spartanamicus\.com|linkonclick\.com|ay267\.com|popcash|adsterra|monetag|propellerads|clickadu|yllix|exoclick|tagivi|intelligenceadx|createlouisville|vpvlxuooad|hmxflflohzzd|mamshirt|portalfluently|uncoverrumour|interlinecustomroofing|adcash|hilltopads|trafficjunky|histats|acscdn|llvpn|traffic|doubleclick|adnxs|adform|popunder|onclickads|exdynsrv|syndication|creative|a-ads|bet365|1xbet|blaze|betano)/i;
  const redirectPattern = /(?:[/?&#](?:redirect|redir|popunder|pop-up|clk|click|track|out|goto)(?:\.php|\.html|\/|\?|$)|(?:\/r\.(?:php|html)))/i;
  const adParamPattern = /[?&](?:ad_id|zoneid|placement|campaign|popunder|subid|clickid|rdata|ibid|ifid|aff_id|pubid|bver|direct_link|token_hash)=/i;
  function adDestination(value) {
    if (typeof value !== "string" && !(value instanceof URL)) return false;
    try {
      const url = new URL(value, location.href);
      const host = url.hostname;
      if (matchesHost(host, adHosts) || adPattern.test(host)) return true;
      if (adParamPattern.test(url.search)) return true;
      if (redirectPattern.test(url.pathname + url.search)) return true;
      return false;
    } catch { return false; }
  }

  const dangerousExtRegex = /\.(exe|msi|apk|crx|iso|bat|vbs|cmd|dmg)(?:[?#]|$)/i;
  function isDangerousDownload(href) {
    if (typeof href !== "string") return false;
    try {
      const parsed = new URL(href, location.href);
      return dangerousExtRegex.test(parsed.pathname);
    } catch { return false; }
  }

  let antiTraps = true;
  window.addEventListener("clique-limpo:config", event => {
    if (event.detail === "enabled") enabled = true;
    if (event.detail === "disabled") enabled = false;
    try {
      const config = JSON.parse(event.detail);
      if (typeof config.enabled === "boolean") enabled = config.enabled;
      if (typeof config.compatibility === "boolean") compatibility = config.compatibility;
      if (typeof config.antiTraps === "boolean") antiTraps = config.antiTraps;
      if (typeof config.host === "string") {
        protectedChain = matchesHost(config.host, protectedSites) || isProtectedHost(config.host);
      }
    } catch { /* Older boolean messages are supported. */ }
    installPlayerHook();
    syncAdCheckStubs();
    if (enabled && embedded && protectedChain && typeof window.jwplayer === "function") {
      // Manual activation can happen after the provider has created its player.
      try { window.jwplayer(); } catch { /* A player may still be initializing. */ }
    }
    publish();
  });

  const isGuardedContext = () => {
    if (!enabled) return false;
    if (embedded) return guardedFrame();
    return isProtectedHost(location.hostname);
  };

  function report() { nativeDispatch(new NativeEvent("clique-limpo:popup-blocked")); }
  window.open = function(url, target, ...args) {
    // Observed flow: open('', '_blank'), then popup.location.replace(adUrl).
    const blank = url === undefined || url === null || url === "" || url === "about:blank";
    let requestedLink = false;
    try { requestedLink = visibleLink && new URL(url, location.href).href === visibleLink; } catch { /* Invalid URL. */ }
    
    // Intercept same-tab window.open redirection attempts (_self, _top, _parent)
    const selfNav = !newWindow(target);
    if (enabled && isGuardedContext() && selfNav && !blank && adDestination(url)) {
      report();
      return null;
    }

    const scriptedPopup = isGuardedContext() && newWindow(target) && (blank || !requestedLink);
    if (enabled && (adDestination(url) || scriptedPopup)) {
      report();
      return null;
    }
    return Reflect.apply(nativeOpen, this, [url, target, ...args]);
  };

  // Intercept location.assign and location.replace to prevent same-tab ad hijacking
  try {
    const nativeAssign = location.assign ? location.assign.bind(location) : null;
    const nativeReplace = location.replace ? location.replace.bind(location) : null;
    if (nativeAssign) {
      location.assign = function(url) {
        if (enabled && isGuardedContext() && adDestination(url)) {
          report();
          return;
        }
        return nativeAssign(url);
      };
    }
    if (nativeReplace) {
      location.replace = function(url) {
        if (enabled && isGuardedContext() && adDestination(url)) {
          report();
          return;
        }
        return nativeReplace(url);
      };
    }
  } catch {}

  // Intercept synthetic programmatic clicks on dynamically created ad anchor elements
  try {
    const nativeAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (enabled && isGuardedContext()) {
        if (adDestination(this.href) || isDangerousDownload(this.href)) {
          report();
          return;
        }
      }
      return Reflect.apply(nativeAnchorClick, this, []);
    };
  } catch {}

  // Suppress advertising links, fake player overlays, synthetic clicks, unprompted dangerous downloads, and clickjacking layers.
  window.addEventListener("click", event => {
    if (!enabled) return;

    // Check if clicking inside a fake player overlay or fake skip button with dollar sign
    const fakePlayerNode = event.composedPath().find(node =>
      node instanceof Element && (
        node.matches('#clickfakeplayer, #fakeplayer, .fakeplayer, [class*="fakeplayer"], [id*="fakeplayer"]') ||
        (node.matches('a[href]') && (
          node.querySelector?.('.fa-dollar-sign, [class*="dollar"]') ||
          /pular\s+an[úu]ncio|skip\s+ad/i.test(node.textContent || "")
        ))
      )
    );
    if (fakePlayerNode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      report();
      const fp = fakePlayerNode.closest('#fakeplayer, .fakeplayer, [class*="fakeplayer"]') || document.getElementById('fakeplayer');
      if (fp) fp.style.setProperty('display', 'none', 'important');
      return;
    }

    const link = event.composedPath().find(node => node instanceof Element && node.matches('a[href]'));
    if (link) {
      if (isDangerousDownload(link.href) && (!event.isTrusted || !link.textContent?.toLowerCase().includes("download"))) {
        event.preventDefault();
        event.stopImmediatePropagation();
        report();
        return;
      }
      if (adDestination(link.href)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        report();
        return;
      }
      if (newWindow(link.target) && (link.href === "about:blank" || link.getAttribute('href') === "about:blank" || !event.isTrusted)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        report();
        return;
      }
      const style = getComputedStyle(link);
      if (Number(style.opacity) <= 0.05 || style.visibility !== "visible" || style.display === "none") {
        event.preventDefault();
        event.stopImmediatePropagation();
        report();
        return;
      }
      if (event.isTrusted && link.getClientRects().length && style.visibility === "visible") {
        visibleLink = link.href;
        queueMicrotask(() => { visibleLink = null; });
      }
    }
  }, true);
})();

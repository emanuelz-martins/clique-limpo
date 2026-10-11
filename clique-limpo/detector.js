/* Pure DOM inspection. No ad lists, request interception, or remote code. */
(() => {
  "use strict";
  const protectedSelector = 'dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"],video,audio,canvas,svg';
  const interactiveSelector = 'button,input,select,textarea,[contenteditable="true"],[role="button"]';
  const meaningfulSelector = `${interactiveSelector},video,audio,canvas,svg,img,picture,iframe`;
  const mediaRootSelector = '.jwplayer,.video-js,.plyr,.shaka-video-container,.flowplayer,[data-media-player]';
  const mediaControlSelector = '.jw-display,.jw-display-container,.jw-display-icon-container,.jw-icon,.jw-controls,.jw-controlbar,.vjs-control,.vjs-big-play-button,.vjs-control-bar,.vjs-text-track-display,.plyr__control,.plyr__controls,.shaka-controls-container';
  const benignName = /(?:^|[\s_-])(backdrop|modal|dialog|tooltip|popover|lightbox|loading|spinner|skeleton|scrim)(?:$|[\s_-])/i;

  function ancestorChain(element) {
    const chain = [];
    for (let current = element; current && chain.length < 40;) {
      chain.push(current);
      current = current.parentElement || current.getRootNode()?.host;
    }
    return chain;
  }

  function inspect(element) {
    if (!(element instanceof Element) || !element.isConnected ||
        element === document.body || element === document.documentElement) return null;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility !== "visible" || style.pointerEvents === "none") return null;
    if (!["fixed", "absolute", "sticky"].includes(style.position)) return null;
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
    const height = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
    const coverage = width * height / Math.max(1, innerWidth * innerHeight);
    if (width < 80 || height < 40 || coverage < 0.015) return null;
    // Embedded players often fade in. Only treat an iframe itself as an overlay
    // when its own style has the full-screen, fixed, almost invisible shape.
    if (element.matches('iframe') && (style.position !== 'fixed' || Number(style.zIndex) < 1000 || Number(style.opacity) > 0.05 || coverage < 0.35 || element.hasAttribute('allowfullscreen'))) return null;

    const ancestors = ancestorChain(element);
    if (ancestors.some(node => node.hasAttribute("data-clique-limpo-ui"))) return null;

    const fakeCaptchaTerms = /(?:não\s+sou\s+um\s+rob[ôo]|not\s+a\s+robot|rob[ôo]|robot|human\s+verification|verificação\s+humana|verifique\s+que|confirme\s+que|clique\s+no\s+bot[ãa]o|click\s+allow|click\s+continue)/i;
    const officialCaptchaIframe = 'iframe[src*="google.com/recaptcha"],iframe[src*="recaptcha.net"],iframe[src*="challenges.cloudflare.com"],iframe[src*="hcaptcha.com"]';
    if (fakeCaptchaTerms.test(element.textContent || "")) {
      const isOfficial = element.querySelector(officialCaptchaIframe) || ancestors.some(node => node.querySelector?.(officialCaptchaIframe));
      const hasFixedOrAbsolute = ["fixed", "absolute"].includes(style.position) || ancestors.some(node => ["fixed", "absolute"].includes(getComputedStyle(node).position));
      if (!isOfficial && hasFixedOrAbsolute) {
        return { reason: "Falso Captcha detectado", isFakeCaptcha: true };
      }
    }

    // Fake Player overlay detection (e.g. Dooplay fakeplayer with dollar sign / fake "Pular anúncio")
    if (element.matches('#fakeplayer, .fakeplayer, [class*="fakeplayer"], [id*="fakeplayer"], #clickfakeplayer')) {
      return { reason: "Player falso com anúncio detectado", isFakePlayer: true };
    }
    if (element.matches('a[href]') && (
      element.querySelector('.fa-dollar-sign, [class*="dollar"]') ||
      /pular\s+an[úu]ncio|skip\s+ad/i.test(element.textContent || "")
    )) {
      return { reason: "Botão falso de pular anúncio com cifrão", isFakePlayer: true };
    }

    if (element.matches(interactiveSelector)) return null;
    if (ancestors.some(node => node.matches(protectedSelector))) return null;
    if (ancestors.some(node => benignName.test(`${node.id} ${node.getAttribute("class") || ""}`))) return null;
    // Avoid hiding containers with a visible dialog or interactive page content.
    if (element.querySelector(protectedSelector)) return null;
    // A transparent wrapper around a real embedded player is not a click trap.
    if (element.querySelector('iframe')) return null;
    // Named media controls are intentionally transparent so the video remains visible.
    const mediaRoot = ancestors.find(node => node.matches(mediaRootSelector));
    if (mediaRoot?.querySelector('video,audio') && ancestors.some(node => node.matches(mediaControlSelector))) return null;
    if (element.shadowRoot?.childElementCount) return null;
    const stacking = ancestors.some(node => Number(getComputedStyle(node).zIndex) >= 10);
    if (!stacking) return null;
    const explicitClickTarget = element.matches('a[href],iframe,[onclick],[role="link"]');
    if (!explicitClickTarget && coverage < 0.12) return null;

    const opacity = ancestors.reduce((value, node) => value * Number(getComputedStyle(node).opacity), 1);
    if (opacity <= 0.05) return { reason: "Camada quase transparente sobre o conteúdo" };
    if (element.matches("iframe,img,picture,canvas,svg")) return null;
    if (element.querySelector(meaningfulSelector)) return null;
    if ((element.textContent || "").trim()) return null;
    // Empty text does not mean an invisible subtree: a child can paint a spinner.
    // Inspect each child separately rather than hiding its opaque parent, unless all children are empty click links.
    if (element.childElementCount > 0) {
      if (element.querySelector(meaningfulSelector)) return null;
      const hasVisualChild = Array.from(element.querySelectorAll('*')).some(child => {
        const cStyle = getComputedStyle(child);
        const hasBorder = [cStyle.borderTopWidth, cStyle.borderRightWidth, cStyle.borderBottomWidth, cStyle.borderLeftWidth].some(v => parseFloat(v) > 0);
        const hasBg = cStyle.backgroundColor !== "transparent" && !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(cStyle.backgroundColor);
        const hasImg = cStyle.backgroundImage !== "none";
        const hasText = (child.textContent || "").trim().length > 0;
        return hasBorder || hasBg || hasImg || hasText;
      });
      if (hasVisualChild) return null;
      if (!explicitClickTarget && !element.querySelector('a[href]')) return null;
    }
    // Pseudo-elements may supply the visible content of an otherwise empty link.
    for (const pseudo of ["::before", "::after"]) {
      const visual = getComputedStyle(element, pseudo);
      if (visual.content && !["none", "normal", '""', "''"].includes(visual.content)) return null;
      if (visual.backgroundImage !== "none") return null;
    }
    if (style.backgroundImage !== "none" || style.boxShadow !== "none" || style.filter !== "none" ||
        style.backdropFilter && style.backdropFilter !== "none") return null;
    if ([style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
      .some(value => parseFloat(value) > 0)) return null;
    const color = style.backgroundColor;
    const transparent = color === "transparent" || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color);
    if (!transparent) return null;
    if (!explicitClickTarget && coverage < 0.35) return null;
    return { reason: "Camada vazia e transparente acima da página" };
  }
  globalThis.CliqueLimpoDetector = Object.freeze({ inspect, ancestorChain });
})();

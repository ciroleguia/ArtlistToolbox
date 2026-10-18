/*
 * Pre-render hero guard.
 *
 * Runs at document_start, before the page is painted. chrome.storage is
 * async, so waiting for it would let the server-rendered promo banner appear
 * for a moment. content.js caches the last known effective value of the
 * "Hide promo banner" tweak in localStorage; when it is enabled this guard
 * flips the attribute synchronously so the CSS in styles.css (injected at
 * document_start too) hides the banner from the very first paint.
 *
 * The async storage read in content.js remains the source of truth and will
 * correct the attribute if the setting changed while no Artlist tab was open.
 */
(() => {
  const HIDE_HERO_ATTR = "data-artlist-toolbox-hide-hero";
  const HIDE_HERO_CACHE_KEY = "artlistToolbox:hideHeroBanner";

  let cached;
  try {
    cached = window.localStorage.getItem(HIDE_HERO_CACHE_KEY);
  } catch (error) {
    return; // localStorage unavailable: fall back to the async path in content.js
  }

  if (cached !== "1") {
    return;
  }

  const root = document.documentElement;
  if (root) {
    root.setAttribute(HIDE_HERO_ATTR, "");
  }
})();

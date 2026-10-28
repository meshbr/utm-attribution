/* Cross-page attribution capture for Gravity Forms. Shares logic and cookie
   format with webflow/utm-attribution/utm-attributions.js. Config is supplied
   by the plugin via window.UTMAttributionConfig. */
(function () {
  'use strict';

  var CONFIG = window.UTMAttributionConfig || {};
  CONFIG.key = CONFIG.key || 'pc_attribution';
  CONFIG.days = CONFIG.days || 90;
  CONFIG.mode = CONFIG.mode || 'last';
  CONFIG.cookieDomain = CONFIG.cookieDomain || '';
  CONFIG.params = CONFIG.params || [];
  CONFIG.contextFields = CONFIG.contextFields || [];

  // ---------------- STORAGE ----------------------------------------
  function registrableDomain() {
    if (CONFIG.cookieDomain) return CONFIG.cookieDomain;
    var host = window.location.hostname;
    if (/^[\d.]+$/.test(host) || host.indexOf('.') === -1) return '';
    return '.' + host.split('.').slice(-2).join('.');
  }

  function readCookie() {
    var m = document.cookie.match(
      new RegExp('(?:^|; )' + CONFIG.key.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '=([^;]*)')
    );
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
  }

  function writeCookie(obj) {
    var expires = new Date(Date.now() + CONFIG.days * 864e5).toUTCString();
    var domain = registrableDomain();
    var secure = window.location.protocol === 'https:' ? ';Secure' : '';
    document.cookie =
      CONFIG.key + '=' + encodeURIComponent(JSON.stringify(obj)) +
      ';expires=' + expires + ';path=/' +
      (domain ? ';domain=' + domain : '') +
      ';SameSite=Lax' + secure;
  }

  function readLocal() {
    try {
      var raw = window.localStorage.getItem(CONFIG.key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed.__exp && Date.now() > parsed.__exp) {
        window.localStorage.removeItem(CONFIG.key);
        return null;
      }
      delete parsed.__exp;
      return parsed;
    } catch (e) { return null; }
  }

  function writeLocal(obj) {
    try {
      var copy = JSON.parse(JSON.stringify(obj));
      copy.__exp = Date.now() + CONFIG.days * 864e5;
      window.localStorage.setItem(CONFIG.key, JSON.stringify(copy));
    } catch (e) { /* private mode, quota, etc. */ }
  }

  function load() { return readCookie() || readLocal() || {}; }
  function save(obj) { writeCookie(obj); writeLocal(obj); }

  // ---------------- CAPTURE ----------------------------------------
  function capture() {
    var stored = load();
    var query;
    try { query = new URLSearchParams(window.location.search); }
    catch (e) { return stored; }

    var incoming = {};
    CONFIG.params.forEach(function (name) {
      var value = query.get(name);
      if (value !== null && value !== '') incoming[name] = value;
    });

    if (!Object.keys(incoming).length) return stored;
    if (CONFIG.mode === 'first' && Object.keys(stored).length) return stored;

    incoming.landing_page = window.location.href;
    incoming.landing_path = window.location.pathname;
    incoming.referrer = document.referrer || '';
    incoming.first_seen = (stored && stored.first_seen) || new Date().toISOString();

    save(incoming);
    return incoming;
  }

  var attribution = capture();
  window.__attribution = attribution;

  if (CONFIG.pushToDataLayer && Object.keys(attribution).length) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'attribution_ready', attribution: attribution });
  }

  // ---------------- GRAVITY FORMS POPULATION -------------------------
  // The plugin tags hidden fields with .uagf-field--{name}. Only empty
  // inputs are filled, so server-side values are never clobbered.
  function populate() {
    var names = CONFIG.params.concat(CONFIG.contextFields);
    names.forEach(function (name) {
      if (!attribution[name]) return;
      var inputs = document.querySelectorAll('.uagf-field--' + name + ' input');
      for (var i = 0; i < inputs.length; i++) {
        if (!inputs[i].value) inputs[i].value = attribution[name];
      }
    });
  }

  populate();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populate);
  }
  window.addEventListener('load', populate);

  // gform_post_render fires on initial render, AJAX submit validation
  // errors, and multi-page step changes (jQuery event, so use jQuery if present).
  if (window.jQuery) window.jQuery(document).on('gform_post_render', populate);

  if (window.MutationObserver) {
    var pending = null;
    new MutationObserver(function () {
      if (pending) return;
      pending = window.setTimeout(function () { pending = null; populate(); }, 100);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.__attributionRefresh = populate;
})();

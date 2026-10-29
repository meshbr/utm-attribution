/* ------------------------------------------------------------------
   Cross-page attribution capture for Webflow
   v1.3.0

   Captures campaign parameters on entry, persists them, and injects
   them as hidden fields into every form on the site.

   ------------------------------------------------------------------ */
(function () {
  'use strict';

  // ---------------- CONFIG -----------------------------------------
  var CONFIG = {
    // Storage key. Change per site or keep shared across a brand family.
    key: 'form_attribution',

    // Older keys to carry over once into `key`, then delete.
    legacyKeys: ['pc_attribution'],

    // Attribution window, in days.
    days: 90,

    // 'last' = most recent campaign wins. 'first' = keep the original touch.
    mode: 'last',

    // With no campaign parameters, record search engine visits as
    // organic and other external sites as referral. Tagged campaigns
    // always win over these. Set false to record organic search only.
    referrals: true,

    // Leave '' to auto-derive (example.com from www.example.com).
    // Set explicitly for multi-part TLDs, e.g. '.example.co.uk'.
    cookieDomain: '',

    // Forms to decorate. 'form' covers Webflow native and third-party.
    formSelector: 'form',

    // Forms that should use the Basin AJAX handler. Set to null to disable.
    basinSelector: "form[action*='usebasin.com']",

    // Push the captured values into dataLayer for GTM.
    pushToDataLayer: true,

    // Parameters to capture from the URL.
    params: [
      'utm_source', 'utm_medium', 'utm_campaign',
      'utm_term', 'utm_content', 'utm_id',
      'gclid', 'gbraid', 'wbraid',
      'fbclid', 'msclkid', 'ttclid', 'li_fat_id'
    ],

    // Extra context fields written alongside the parameters.
    contextFields: ['landing_page', 'landing_path', 'referrer', 'first_seen']
  };

  // ---------------- STORAGE ----------------------------------------
  function registrableDomain() {
    if (CONFIG.cookieDomain) return CONFIG.cookieDomain;
    var host = window.location.hostname;
    if (/^[\d.]+$/.test(host) || host.indexOf('.') === -1) return ''; // IP or localhost
    var parts = host.split('.');
    if (parts.length < 2) return '';
    return '.' + parts.slice(-2).join('.');
  }

  function readCookie(key) {
    key = key || CONFIG.key;
    var m = document.cookie.match(
      new RegExp('(?:^|; )' + key.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '=([^;]*)')
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
      ';expires=' + expires +
      ';path=/' +
      (domain ? ';domain=' + domain : '') +
      ';SameSite=Lax' + secure;
  }

  function readLocal(key) {
    key = key || CONFIG.key;
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed.__exp && Date.now() > parsed.__exp) {
        window.localStorage.removeItem(key);
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

  function removeStored(key) {
    var domain = registrableDomain();
    var expired = '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    document.cookie = key + expired + (domain ? ';domain=' + domain : '');
    document.cookie = key + expired; // host-only copy, if one was written
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // Carry attribution stored under an old key over to CONFIG.key, once.
  function migrateLegacy() {
    var found = null;
    (CONFIG.legacyKeys || []).forEach(function (key) {
      if (key === CONFIG.key) return;
      var value = readCookie(key) || readLocal(key);
      if (value && !found) found = value;
      if (value) removeStored(key);
    });
    if (found) save(found);
    return found;
  }

  function load() { return readCookie() || readLocal() || migrateLegacy() || {}; }

  function save(obj) { writeCookie(obj); writeLocal(obj); }

  // Search engines whose visits count as organic. Matched against the
  // referrer hostname with any leading "www." removed.
  var SEARCH_ENGINES = [
    [/^google\.[a-z.]+$/, 'google'],
    [/^(cn\.)?bing\.com$/, 'bing'],
    [/^(search\.)?yahoo\.[a-z.]+$/, 'yahoo'],
    [/^duckduckgo\.com$/, 'duckduckgo'],
    [/^ecosia\.org$/, 'ecosia'],
    [/^search\.brave\.com$/, 'brave'],
    [/^yandex\.[a-z.]+$/, 'yandex'],
    [/^baidu\.com$/, 'baidu'],
    [/^startpage\.com$/, 'startpage'],
    [/^search\.aol\.com$/, 'aol']
  ];

  // Source/medium for a visit with no campaign parameters, from the
  // referrer: organic for search engines, referral for other sites
  // (when CONFIG.referrals is on), nothing for direct or internal visits.
  function referrerSource() {
    var ref = document.referrer;
    if (!ref) return null;
    var host;
    try { host = new URL(ref).hostname.toLowerCase(); } catch (e) { return null; }

    var own = registrableDomain().replace(/^\./, '') || window.location.hostname;
    if (host === own || host.slice(-(own.length + 1)) === '.' + own) return null;

    var bare = host.replace(/^www\./, '');
    for (var i = 0; i < SEARCH_ENGINES.length; i++) {
      if (SEARCH_ENGINES[i][0].test(bare)) {
        return { utm_source: SEARCH_ENGINES[i][1], utm_medium: 'organic' };
      }
    }
    if (CONFIG.referrals === false) return null;
    return { utm_source: bare, utm_medium: 'referral' };
  }

  // ---------------- CAPTURE ----------------------------------------
  // Tagged campaigns (UTM or click-ID parameters) always win over organic
  // and referral visits, which are flagged __auto when stored.
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

    var hasStored = Object.keys(stored).length > 0;
    var storedIsCampaign = hasStored && !stored.__auto;

    if (Object.keys(incoming).length) {
      // First-touch keeps an earlier campaign, but never an organic/referral one.
      if (CONFIG.mode === 'first' && storedIsCampaign) return stored;
    } else {
      incoming = referrerSource();
      if (!incoming) return stored;
      if (storedIsCampaign) return stored;
      if (CONFIG.mode === 'first' && hasStored) return stored;
      incoming.__auto = true;
    }

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

  // ---------------- FORM DECORATION --------------------------------
  function fieldList() {
    var fields = [
      { name: 'submittedPageTitle', value: document.title },
      { name: 'submittedPageURL', value: window.location.pathname }
    ];
    CONFIG.params.concat(CONFIG.contextFields).forEach(function (name) {
      if (attribution[name]) fields.push({ name: name, value: attribution[name] });
    });
    return fields;
  }

  function decorate(form) {
    if (form.getAttribute('data-attribution-applied') === 'true') return;
    form.setAttribute('data-attribution-applied', 'true');

    var id = form.getAttribute('id');
    fieldList().forEach(function (field) {
      // If the Designer already defines this field, fill it instead of
      // appending a duplicate. Duplicate names are how attribution gets
      // silently overwritten — see the utmAutofill collision.
      var existing = form.querySelector('[name="' + field.name + '"]');
      if (existing) {
        if (!existing.value) existing.value = field.value;
        return;
      }
      var input = document.createElement('input');
      input.setAttribute('type', 'hidden');
      input.setAttribute('name', field.name);
      input.setAttribute('data-attribution-field', 'true');
      if (id) input.setAttribute('id', id + '-' + field.name);
      input.value = field.value;
      form.appendChild(input);
    });
  }

  function decorateAll() {
    var forms = document.querySelectorAll(CONFIG.formSelector);
    for (var i = 0; i < forms.length; i++) decorate(forms[i]);
  }

  // ---------------- BASIN AJAX (optional) ---------------------------
  function attachBasin(form) {
    if (form.getAttribute('data-basin-bound') === 'true') return;
    form.setAttribute('data-basin-bound', 'true');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var thisForm = event.currentTarget;
      var parent = thisForm.parentNode;
      var ok = parent && parent.querySelector('.form__success-div, .w-form-done');
      var bad = parent && parent.querySelector('.form__error-div, .w-form-fail');

      var xhr = new XMLHttpRequest();
      xhr.open('POST', thisForm.action, true);
      xhr.onload = function () {
        var success = xhr.status >= 200 && xhr.status < 300;
        var target = success ? ok : bad;
        if (target) {
          thisForm.style.display = 'none';
          target.style.display = 'block';
        } else {
          thisForm.textContent = success
            ? 'Submitted!'
            : 'There was an error in your submission.';
          thisForm.style.textAlign = 'center';
          thisForm.style.padding = '2em';
          thisForm.style.fontSize = '1.5rem';
        }
        if (!success) {
          try { console.error('Form submission error', JSON.parse(xhr.response)); }
          catch (e) { console.error('Form submission error', xhr.status); }
        }
      };
      xhr.send(new FormData(thisForm));
    });
  }

  function bindBasinForms() {
    if (!CONFIG.basinSelector) return;
    var forms = document.querySelectorAll(CONFIG.basinSelector);
    for (var i = 0; i < forms.length; i++) attachBasin(forms[i]);
  }

  // ---------------- LIFECYCLE ---------------------------------------
  function run() {
    decorateAll();
    bindBasinForms();
  }

  run();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  }
  window.addEventListener('load', run);

  // Webflow re-renders forms after submit, and interactions/tabs/modals
  // can inject forms long after load. Watch for them.
  if (window.MutationObserver) {
    var pending = null;
    new MutationObserver(function () {
      if (pending) return;
      pending = window.setTimeout(function () { pending = null; run(); }, 100);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Expose for debugging: window.__attributionRefresh()
  window.__attributionRefresh = run;
})();

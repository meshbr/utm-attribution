/* ------------------------------------------------------------------
   Cross-page attribution capture for Webflow
   v1.1.0

   Captures campaign parameters on entry, persists them, and injects
   them as hidden fields into every form on the site.

   Changes from the Performance Contractors original:
     - decorates ALL forms, not only Basin forms
     - re-runs when forms appear later in the page lifecycle
     - never writes duplicate hidden fields
     - cookie is written at the registrable domain so apex/www share it
     - localStorage fallback when cookies are unavailable
     - wider parameter list (paid social + Google auto-tagging)
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  // ---------------- CONFIG -----------------------------------------
  var CONFIG = {
    // Storage key. Change per site or keep shared across a brand family.
    key: 'pc_attribution',

    // Attribution window, in days.
    days: 90,

    // 'last' = most recent campaign wins. 'first' = keep the original touch.
    mode: 'last',

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
      ';expires=' + expires +
      ';path=/' +
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

    var hasIncoming = Object.keys(incoming).length > 0;
    var hasStored = Object.keys(stored).length > 0;

    // First-touch mode keeps whatever landed first.
    if (!hasIncoming) return stored;
    if (CONFIG.mode === 'first' && hasStored) return stored;

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
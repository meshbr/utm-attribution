# utm-attribution.js

Cross-page campaign attribution capture for Webflow sites.

Captures UTM and click-ID parameters when a visitor first arrives, persists them
for the length of the attribution window, and injects them as hidden fields into
every form on the site — so a visitor who lands on a page with no form and
converts three pages later still carries their original campaign data.

Works with Basin, Webflow native forms, and anything else that submits a
standard `<form>`.

---

## Requirements

- A Webflow site on a paid site plan (site-wide custom code requires one)
- Nothing else — no GTM, no dependencies, no build step

---

## Installation

### Option A — hosted script (recommended)

Add one line to **Site Settings → Custom Code → Footer Code**, then publish.

```html
<script src="https://cdn.jsdelivr.net/gh/meshbr/utm-attribution@v1.1.0/webflow/utm-attribution/utm-attributions.js"></script>
```

**Pin to a tag, never a branch.** Referencing `@main` means every push rewrites
the script on every site using it, with no staging step and no way to roll back.
jsDelivr also caches branch refs for roughly 12 hours, so you get uncontrolled
changes *and* unpredictable propagation. Tag your releases.

> jsDelivr only serves **public** repositories. `meshbr/utm-attribution` is
> public, so the URL above works as-is. If the repo is ever made private, host
> the file on Cloudflare Pages, Render, or any static host and swap the URL —
> everything below applies unchanged.

### Option B — inline

Paste the contents of `utm-attributions.js` into **Site Settings → Custom Code →
Footer Code**, wrapped in `<script>` tags. Simpler to start, but you now maintain
a separate copy per site. Fine for one site; painful across five.

### Option C — Webflow Custom Code API

For programmatic rollout across many sites. Requires a Webflow **Data Client App
with OAuth** — site tokens are rejected with a 401 on these endpoints.

1. Register the script to the site (`POST /sites/{site_id}/registered_scripts/hosted`)
   with `hostedLocation`, `integrityHash`, `version`, and `displayName`.
2. Apply it to the site (`PUT /sites/{site_id}/custom_code`).
3. Publish the site.

Generate the integrity hash from the exact tagged URL:

```bash
curl -s https://cdn.jsdelivr.net/gh/meshbr/utm-attribution@v1.1.0/webflow/utm-attribution/utm-attributions.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

Prefix the output with `sha384-` when you pass it to Webflow.

Notes that catch people out:

- **Registrations are immutable.** To ship a change you register a new version;
  you cannot edit an existing one. Each `displayName` + `version` pair must be unique.
- **The apply endpoint is full-replacement.** Send your complete script list on
  every call or you will silently remove the others.
- Scopes needed: `custom_code:read`, `custom_code:write`, plus `sites:read` and
  `sites:write`.
- Limits: 800 registered scripts per site; 60 requests/min on Starter and Basic
  plans, 120/min on CMS, eCommerce, and Business.
- `canCopy` controls whether the script survives site duplication and transfer.

---

## Configuration

Edit the `CONFIG` block at the top of the file.

| Key | Default | What it does |
|---|---|---|
| `key` | `pc_attribution` | Cookie and localStorage key. Change per site, or share across a brand family to carry attribution between domains you control. |
| `days` | `90` | Attribution window. |
| `mode` | `'last'` | `'last'` — newest campaign wins. `'first'` — keep the original touch. |
| `cookieDomain` | `''` | Auto-derives `.example.com` from `www.example.com`. Set explicitly for multi-part TLDs, e.g. `.example.co.uk`. |
| `formSelector` | `'form'` | Which forms to decorate. |
| `basinSelector` | `form[action*='usebasin.com']` | Forms that get the Basin AJAX handler. **Set to `null` on sites without Basin.** |
| `pushToDataLayer` | `true` | Pushes an `attribution_ready` event to `dataLayer` for GTM. Harmless when GTM isn't present. |
| `params` | see file | Parameters captured from the URL. |

### Per-site quick reference

**Basin site:** leave defaults as they are.

**Webflow native forms only:** set `basinSelector: null`.

**Site with no GTM:** leave `pushToDataLayer` on or off — it no-ops safely either way.

---

## Captured fields

Injected into every form as hidden inputs:

| Field | Source |
|---|---|
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id` | URL at first touch |
| `gclid`, `gbraid`, `wbraid` | Google Ads auto-tagging |
| `fbclid`, `msclkid`, `ttclid`, `li_fat_id` | Meta, Microsoft, TikTok, LinkedIn |
| `landing_page` | Full URL of the entry page, query string included |
| `landing_path` | Path only |
| `referrer` | `document.referrer` at entry |
| `first_seen` | ISO timestamp of first touch |
| `submittedPageTitle`, `submittedPageURL` | The page the form was actually submitted from |

Only parameters actually present in the URL are stored and injected. Empty
values are skipped rather than written as blanks.

---

## Designer-built hidden fields

The script creates any field that doesn't already exist. It will also **fill an
existing empty field** with a matching `name`, rather than appending a duplicate.

For any form feeding a downstream mapping — n8n into Pipedrive, Mailchimp merge
tags, a CRM field map — build the hidden fields in the Designer anyway and let
the script populate them. A field that only exists when JavaScript succeeds is a
field that silently disappears when it doesn't, and you get a submission with no
attribution and no error. Real fields give you a stable schema and a visible
empty value instead.

Name them exactly as listed above.

---

## Migrating from the old `utmAutofill` script

**Remove the old script before installing this one.** Do not run both.

The v1.0 `utmAutofill` script (ported from `meshbr/civix`) appends its own hidden
inputs using the same field names, sourced from its own separate cookies. When
both run, each form ends up with two inputs named `utm_source`, and whichever
lands last wins. Because `utmAutofill` was only ever installed on individual
pages, its cookies are only set when a visitor lands directly on one of those
pages — so on any other entry path it appends an **empty** field last and blanks
out the value this script just captured.

The symptom is distinctive: `landing_page` arrives populated and correct, sitting
next to blank `utm_*` fields, and attribution only works when the visitor lands
directly on the form page.

Check page-level custom code, not just site-wide. On Performance Contractors it
was in the page **head** on `/careers` and `/corpus-careers` only.

---

## Cookie consent

The script writes a first-party cookie for marketing attribution. Under GDPR
that is non-essential and requires opt-in. Most US state privacy laws treat
first-party attribution as opt-out. Confirm the requirement per client — this is
a policy decision, not a technical one.

If a consent platform is in use, the hosted-script install is the easy case:
CMPs block by `src`, so tag the one script tag with a category and you're done.
An inline install has to be rewritten as `type="text/plain"` with a category
attribute for the CMP to re-enable it, which is a reason to prefer Option A on
any site with a CMP.

---

## Debugging

Open the console on a page with a form:

```js
window.__attribution        // the stored attribution object
window.__attributionRefresh()  // re-run capture and form decoration
document.cookie             // confirm the cookie exists and is scoped correctly
```

To verify end to end:

1. Visit any page **without** a form, with parameters appended:
   `?utm_source=test&utm_medium=test&utm_campaign=readme`
2. Confirm `window.__attribution` is populated.
3. Navigate to a form page through normal site navigation — do not re-enter the URL.
4. Inspect the form. The hidden inputs should be present and populated.
5. Submit and confirm the values reached the destination.

Step 3 is the one that matters. Entering the form page URL directly will pass
even when cross-page persistence is broken.

### Common issues

| Symptom | Cause |
|---|---|
| Fields blank on cross-page visits, populated on direct landing | A second script appending duplicate field names. See the migration section. |
| Nothing captured at all | Cookie blocked, or a CMP suppressing the script. Check `window.__attribution`. |
| Attribution lost between `example.com` and `www.example.com` | `cookieDomain` failed to derive. Set it explicitly. |
| Attribution lost between two different domains | Expected — cookies cannot span registrable domains. Pass values in the link query string. |
| Fields missing on forms inside tabs or modals | Should not happen; a MutationObserver re-runs decoration. Confirm the script version. |

---

## Versioning

Tag every release. Sites reference tags, so an untagged change ships nowhere —
which is the point.

```bash
git tag v1.1.0
git push origin v1.1.0
```

Then update the `@version` in each site's script tag when you want that site to
take the change. Roll sites forward one at a time; the whole reason for pinning
is that you get to choose when each client moves.

---

## Changelog

**v1.1.0**
- Decorates all forms, not only Basin forms
- Re-runs when forms appear later via MutationObserver
- Fills existing empty fields instead of appending duplicates
- Cookie written at the registrable domain so apex and `www` share it
- localStorage fallback when cookies are unavailable
- Added `utm_id`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`
- Added `landing_path` and `first_seen`
- Optional `dataLayer` push

**v1.0.0**
- Initial Performance Contractors implementation

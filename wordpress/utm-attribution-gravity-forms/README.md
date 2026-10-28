# UTM Attribution for Gravity Forms

WordPress plugin that gives Gravity Forms the same cross-page attribution as the
[Webflow script](../../webflow/utm-attribution/README.md): capture UTM and click
IDs on entry, persist them for the attribution window, and fill form fields on
whatever page the visitor converts on.

## How it differs from the Webflow script

Gravity Forms **discards submitted inputs that aren't defined fields**, so
injecting hidden inputs with JavaScript would save nothing. Instead you add real
Hidden fields to the form, and the plugin populates them three ways:

1. **Server-side** via `gform_field_value_{name}` from the first-party cookie (works with JS blocked).
2. **Client-side** by the capture script, for cached pages and AJAX / multi-page re-renders.
3. **At submission** (`gform_pre_submission`) from the cookie sent with the POST, as a safety net for page caches.

Cookie name, format, and localStorage fallback are identical to the Webflow script,
so attribution carries between Webflow and WordPress sites on the same domain.

## Install

1. Copy `utm-attribution-gravity-forms/` into `wp-content/plugins/` (or zip it and upload), then activate.
2. In each form, add a **Hidden** field per value you want to store.
3. For each, open **Advanced → Allow field to be populated dynamically** and set **Parameter Name** to exactly one of:

`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`,
`gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`,
`landing_page`, `landing_path`, `referrer`, `first_seen`

Values then appear in the entry, notifications (`{admin label}` merge tags), and
any add-on feed (n8n/webhooks, Pipedrive, Mailchimp, etc.).

## Configuration

Override defaults with the `uagf_config` filter:

```php
add_filter( 'uagf_config', function ( $c ) {
	$c['days'] = 30;
	$c['mode'] = 'first';          // keep original touch
	$c['cookieDomain'] = '.example.co.uk';
	return $c;
} );
```

## Verify

1. Visit a page **without** a form at `?utm_source=test&utm_medium=test&utm_campaign=readme`.
2. Check `window.__attribution` in the console.
3. Navigate (don't re-enter the URL) to a form page.
4. Inspect the hidden fields, submit, and confirm the entry shows the values.

## Notes

- Caching plugins: step 3 of population covers fully cached pages; no exclusion rules needed.
- Consent: same policy considerations as the Webflow script. If a CMP is in use, gate the `uagf` script handle by category.
- Don't run alongside another UTM-to-GF plugin that writes the same fields.

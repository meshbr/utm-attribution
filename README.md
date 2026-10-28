# utm-attribution

Cross-page campaign attribution for Webflow sites.

A visitor lands on a blog post with `?utm_source=…`, browses for a while, and
converts three pages later on a form that never saw the original URL. Without
persistence, that conversion is attributed to nothing. This repo holds the
script that fixes it: capture campaign parameters on entry, store them for the
attribution window, and inject them as hidden fields into every form on the
site.

No dependencies, no build step, no tag manager required.

## Contents

| Path | What it is |
|---|---|
| [webflow/utm-attribution/utm-attributions.js](webflow/utm-attribution/utm-attributions.js) | The script. Drop-in, self-contained IIFE. |
| [webflow/utm-attribution/README.md](webflow/utm-attribution/README.md) | Install, configuration, captured fields, debugging, migration notes. |

## Quick start

Add one line to **Site Settings → Custom Code → Footer Code** and publish:

```html
<script src="https://cdn.jsdelivr.net/gh/meshbr/utm-attribution@v1.2.0/webflow/utm-attribution/utm-attributions.js"></script>
```

Pin to a tag, never a branch — a branch ref rewrites the script on every site
using it, with no staging step and no rollback. Inline and Webflow Custom Code
API installs are covered in the
[script README](webflow/utm-attribution/README.md#installation).

To have the browser reject a tampered file, add the subresource integrity hash
for the release:

```html
<script src="https://cdn.jsdelivr.net/gh/meshbr/utm-attribution@v1.2.0/webflow/utm-attribution/utm-attributions.js"
        integrity="sha384-ShIjT8G53UA00K8MJXAmSztGBgem+RxBPnuVzwPeoxHb83dx21N0dpP3ML7Rup3W"
        crossorigin="anonymous"></script>
```

Then verify: load any page **without** a form at
`?utm_source=test&utm_medium=test&utm_campaign=readme`, navigate to a form page
through normal site links, and check that the hidden inputs are populated.
Navigating rather than re-entering the URL is the part that actually tests
cross-page persistence.

## What gets captured

UTM parameters (`utm_source` through `utm_id`), click IDs from Google, Meta,
Microsoft, TikTok, and LinkedIn, plus landing page, referrer, and first-touch
timestamp. Full table in the
[script README](webflow/utm-attribution/README.md#captured-fields).

Storage is a first-party cookie at the registrable domain, with a localStorage
fallback. Under GDPR this is non-essential and needs opt-in; most US state
privacy laws treat first-party attribution as opt-out. Confirm per client.

## Versioning

Sites reference tags, so releases are cut with tags and each site moves forward
when you choose:

```bash
git tag v1.2.0
git push origin v1.2.0
```

## License

[MIT](LICENSE).

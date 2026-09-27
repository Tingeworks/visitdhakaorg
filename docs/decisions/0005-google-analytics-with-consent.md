# 0005: Google Analytics 4 through Tag Manager, loaded only after consent

- Status: Accepted, implemented
- Date: 2026-09-27

## Context

The README planned Cloudflare Web Analytics, which sets no cookies and needs no consent banner. The team chose Google
Analytics 4 instead, managed through Google Tag Manager (container `GTM-57LQWQ8W`, GA4 measurement ID `G-8CB1F6DDKX`).
GA4 sets cookies, and many readers are tourists from the EU and UK, where analytics cookies need prior consent.

## Decision

- Tag Manager is loaded by `src/components/Head.astro`, but only after the visitor clicks "Accept" in the banner
  (`src/components/CookieConsent.astro`). Before that, nothing is requested from Google Tag Manager or Analytics.
- Google consent mode defaults are still set: `analytics_storage` is granted on accept, and the three ad signals are
  always denied because the site shows no ads.
- The choice is saved in `localStorage` (`vd-consent`) and asked again after 12 months. "Cookie settings" in the footer
  reopens the banner. Rejecting after accepting sets consent to denied and deletes the `_ga` cookies.
- There is no `<noscript>` GTM iframe, since consent can't be given without JavaScript.
- GTM loads only on `visitdhaka.org` (and its subdomains). On localhost and preview URLs the banner works, but nothing is
  sent, so testing doesn't pollute the GA4 property.
- Accept and Reject have equal weight in the banner. There is no cookie wall.

Loading GTM only after consent, rather than relying on consent mode alone, keeps the privacy policy true whatever tags are
added to the container later.

## Consequences

- Visitors who reject or ignore the banner aren't counted, so GA4 undercounts traffic. There is no consent-mode modelling.
- GA4's "Test installation" and Tag Assistant only see the tag after consent has been given in that browser, and only
  on the live site.
- Any new tag added in Tag Manager also runs only after consent. A tag with a new purpose (such as advertising) needs the
  banner text and `/privacy/` updated first.
- `/privacy/` describes this setup. Update it whenever the tags, cookies or storage keys change.

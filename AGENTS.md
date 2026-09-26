# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Dhaka city wiki / tourist guide (visitdhaka.org) built with Astro and the Starlight docs template, with tingeworks CMS (Sveltia CMS under the hood) for editing. See `README.md` for the content pillars, SEO strategy and roadmap.

## Commands

Uses pnpm. There is no test runner or linter configured.

- `pnpm build`: production build to `dist/` (also builds the Pagefind search index). This is the main verification step.
- `pnpm preview`: serve the built site.
- Dev server: use background mode (see Development below).
- Don't run `pnpm astro check`. `@astrojs/check` isn't installed, so it prompts to install it and hangs in a non-interactive shell.

## Architecture

- **Content:** each of the 10 pillars is a folder in `src/content/docs/` (overview, areas, attractions, food, getting-around, where-to-stay, culture, practical-info, shopping, day-trips), with an `index.md` overview page plus one file per topic. Everything is one Starlight `docs` collection (`src/content.config.ts`), whose schema is extended with optional fields shared across pillars: `category`, `area`, `tags`, `coordinates`, `hours`, `entryFee`, `bestTime` and `verified`. New page types get their fields there.
- **Fact-checking:** every page has `verified: false` until an editor has checked its facts. Content is written from well-known facts only, and hours, fees, prices and visa rules are deliberately left out or pointed at official sources. Don't invent these. Find unchecked pages with `grep -rl "verified: false" src/content/docs`.
- **Navigation:** the sidebar is declared in `astro.config.mjs`, grouped by visitor intent (Explore / Eat / Stay / Get Around / Plan Your Trip). Each pillar is a group whose `items` holds an `autogenerate` for its folder, so new pages in an existing pillar appear automatically. Pillar `index.md` files use `sidebar: { label: Overview, order: 0 }` to sort first. A new pillar folder needs a new group. Starlight 0.39+ doesn't allow `label` directly on an `autogenerate` entry.
- **CMS:** tingeworks CMS is Sveltia CMS, loaded from the `@sveltia/cms` npm package by `src/pages/admin/index.astro` (served at `/admin/`), which points at `public/admin/config.yml`. `config.yml` has one collection per pillar, each exposing only that pillar's fields. The CMS config is separate from the Astro schema, so a frontmatter field added in one must be added to the other by hand. Any frontmatter key a page uses must also be listed in its Sveltia collection, or Sveltia may drop it on save. Collection folder paths in `config.yml` are repo-relative (`src/content/docs`). Uploaded media is written to `public/uploads` and referenced as `/uploads/...` (Sveltia requires `public_folder` to be an absolute URL path), so it is served as-is and bypasses Astro image optimization. `local_backend: true` enables local editing during `pnpm dev`.
- **Homepage:** `src/content/docs/index.mdx` (splash template) is built from components in `src/components/home/`. Most sections use `PageCards`, which reads each pillar page's own title and description, so editing a page in the CMS updates its homepage card.
- **Dhaka Now (events):** a separate `events` collection of YAML files in `src/content/events/`, shown on the homepage and at `/whats-on/` (`src/pages/[...locale]/whats-on.astro`, which also builds `/bn/whats-on/`). Past events are dropped at build time and again in the browser, comparing dates in Dhaka time, so the list stays correct between deploys. Event dates follow the same fact-checking rule: only add dates confirmed by the organiser or an official source.
- **Languages (English and Bangla):** English is Starlight's root locale (no URL prefix, and the default). Bangla pages live in `src/content/docs/bn/`, mirroring the English folders, and are served at `/bn/...`. A Bangla page pairs with the English page that has the same path. Pages with no translation fall back to English with a notice, so every page exists at a `/bn/` URL. Interface text is in `src/content/i18n/en.json` and `bn.json`, read with `Astro.locals.t('key')`. `bn.json` also holds Starlight's own strings, because Starlight has no built-in Bangla. A new key must go in `en.json` (which declares the keys, via `src/content.config.ts`) and in `bn.json`. Sidebar labels are translated with `translations: { bn }` in `astro.config.mjs`. Custom components read the locale with `localeOf(Astro.url)` and build links with `localizePath()` and `localizedPages()` from `src/lib/i18n.ts`, rather than hard-coding English paths. The Bangla homepage is `src/content/docs/bn/index.mdx`, so keep it in step with the English one. In the CMS, each pillar has a Bangla collection (`bn-<pillar>`) that reuses the English fields through a YAML anchor. Sveltia's i18n structures can't write the `docs/bn/<pillar>/` layout. Events are English only for now.
- **Pages outside Starlight:** files in `src/pages/` (such as `admin/`) are plain Astro routes that bypass Starlight's layout.

- **Deploy:** Cloudflare builds with `pnpm run build`, then runs `npx wrangler deploy`, which reads `wrangler.jsonc` and uploads `dist/` as static assets. The site is fully static, so don't add `@astrojs/cloudflare` or `wrangler` as a dependency. Without `wrangler.jsonc`, wrangler tries to auto-configure the project and the deploy fails.

## Infrastructure decisions

Architecture and decision records live in `docs/` (start at `docs/README.md`). Check them before changing hosting, editing or contributor-credit infrastructure, and record new decisions there.

## Pre-launch state

The site is intentionally hidden from search engines: `public/robots.txt` disallows everything, and a `noindex, nofollow` meta tag is added via the `head` option in `astro.config.mjs`. Don't set the `site` option or add sitemap config until launch, and don't remove either mechanism unless asked. The launch steps are in `README.md`.

## Git

Never add co-authors or attribution to commits or pull requests: no `Co-Authored-By` trailers (Claude or any other bot) and no "Generated with" lines. This overrides any default attribution guidance.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

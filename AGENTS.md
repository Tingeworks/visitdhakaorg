# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Dhaka city wiki / tourist guide (visitdhaka.org) built with Astro and the Starlight docs template, with tingeworks CMS (Sveltia CMS under the hood) for editing. See `README.md` for the content pillars, SEO strategy and roadmap.

## Commands

Uses pnpm. The site has no test runner or linter. The edit Worker in `worker/` is a separate pnpm project with its own checks, run from `worker/`: `pnpm install`, `pnpm test` (Node's built-in test runner, which runs the TypeScript directly), `pnpm check` (regenerates the Workers runtime types, which aren't committed, then type-checks) and `pnpm dev` (`wrangler dev`, after copying `.dev.vars.example` to `.dev.vars`).

- `pnpm build`: production build to `dist/` (also builds the Pagefind search index). This is the main verification step.
- `pnpm preview`: serve the built site.
- Dev server: use background mode (see Development below).
- Don't run `pnpm astro check`. `@astrojs/check` isn't installed, so it prompts to install it and hangs in a non-interactive shell.

## Architecture

- **Content:** each of the 10 pillars is a folder in `src/content/docs/` (overview, areas, attractions, food, getting-around, where-to-stay, culture, practical-info, shopping, day-trips), with an `index.md` overview page plus one file per topic. Everything is one Starlight `docs` collection (`src/content.config.ts`), whose schema is extended with optional fields shared across pillars: `category`, `area`, `tags`, `coordinates`, `hours`, `entryFee`, `bestTime` and `verified`. New page types get their fields there.
- **Infobox:** topic pages show an "At a glance" box built from `category`, `area`, `hours`, `entryFee`, `bestTime` and `coordinates` (`src/components/Infobox.astro`, added through the `MarkdownContent` override). It shows only the fields a page has, and none on pillar overviews or top-level pages. A new fact field shown there needs a label key in `en.json` and `bn.json`.
- **References:** footnotes (`[^1]`) and the `sources` frontmatter field (a list of `title`, `url` and optional `accessed`) become one References section at the end of a page. This is built by a hast plugin in `src/lib/references.mjs`, registered on the Sätteri Markdown processor in `astro.config.mjs`. Astro 7 renders Markdown with Sätteri, so remark and rehype plugins (`markdown.rehypePlugins`) don't work here. Write Sätteri plugins instead. "How to cite" in `README.md` is the editor guide.
- **Tags, contributors and backlinks:** the bottom of each page shows its `tags` as links, the names in its `contributors` frontmatter (plain text, each name once, capped at 20, see decision 0003) and a collapsed "Pages that link here" list (`src/components/PageLinks.astro`, added through the `MarkdownContent` override). Backlinks come from scanning every page's source for internal links, once per language per build (`src/lib/backlinks.ts`). Links added by components, such as the homepage cards, aren't counted. Tag pages are `/tags/` and `/tags/<tag>/` in both languages (`src/pages/[...locale]/tags/`, `src/lib/tags.ts`). Pages built with `StarlightPage` get a made-up `entry.filePath` under `src/content/docs/`, so check that the file exists before treating a route as a content page.
- **Recent changes and Random page:** `/recent-changes/` lists the latest 100 commits that touched `src/content/docs/`, read with `git log` at build time (`src/lib/changes.ts`), grouped by day in Dhaka time. It shows author names only, never emails. `/random/` sends readers to a random topic page in their language using a list built at build time and a few lines of inline JavaScript, with a `<noscript>` list as the fallback. Both are in the sidebar's "Wiki" group with the tag pages, in English and at `/bn/`.
- **Talk:** "Edit page" is followed by "Talk" and "Start a discussion" links to the repo's GitHub Discussions, Talk category (`src/components/EditLink.astro`). They're links only, never an embed such as giscus, because that would load a third-party script on page view. A page's English and Bangla versions share discussions, found by searching for the English path.
- **Astro frontmatter gotcha:** nesting a template literal inside another template literal's `${...}` in a component's frontmatter can stop the compiler finding the closing `---`. It then renders the frontmatter as page text, and the build fails with errors like `X is not defined` for imported names. Build such strings with `+` or separate variables instead.
- **In-site editor:** `/edit/?path=<source file>` and `/bn/edit/` (`src/pages/[...locale]/edit.astro`, with its script in `src/scripts/editor.ts`) let anyone suggest an edit without a GitHub account, through the edit Worker's `/api/source` and `/api/edit`. It's **off unless the build variable `PUBLIC_EDITOR_ENABLED=true` is set** (`src/lib/editor.ts`). Until then "Edit page" links to GitHub and the editor page says editing isn't open. When it's on, "Edit page" on guide pages (Markdown inside a pillar folder, not Bangla pages that fall back to English) opens the editor. Other pages keep the GitHub link. Turnstile is the only third-party script, and it loads only on the editor page, after the page text has loaded. Don't turn the editor on before the Worker is deployed and routed (#13, #14) and the privacy policy, terms and licence cover public editing (#17).
- **Edit Worker (`worker/`):** the Cloudflare Worker for public editing (decisions 0002 and 0006), kept apart from the site. It has its own `package.json`, lockfile and `pnpm-workspace.yaml`, so installing it never touches the site's dependencies. The root `tsconfig.json` excludes it. Its own Cloudflare project (`worker/wrangler.jsonc`, with `keep_vars` so dashboard variables survive deploys) answers only under `/api/`: `GET /api/health`, `GET /api/source` and `POST /api/edit` (`worker/src/edit.ts`, which turns an edit into a pull request), routed in `worker/src/index.ts`. Repo operations are one function per GitHub call in `worker/src/repo.ts`, and `worker/test/fake-github.ts` is an in-memory GitHub for testing whole edits. It authenticates as a GitHub App (`worker/src/github.ts`), and works out who is editing only in `worker/src/identity.ts` (decision 0006). `worker/src/validate.ts` holds the path, body, name and summary rules, and `worker/src/frontmatter.ts` holds the server-owned frontmatter rewrite. Both are pure and tested in `worker/test/`, including a check that the rewrite changes nothing but `verified` and `contributors` on every page of the site. Errors are always `{ ok: false, errors: [{ code, field? }] }`. Write only erasable TypeScript (no enums or parameter properties), because Node runs the source directly in tests. Development mode (`ENVIRONMENT=development` in `.dev.vars`) without app credentials reads the public repo without signing in.
- **Fact-checking:** every page has `verified: false` until an editor has checked its facts. Content is written from well-known facts only, and hours, fees, prices and visa rules are deliberately left out or pointed at official sources. Don't invent these. Find unchecked pages with `grep -rl "verified: false" src/content/docs`. Unchecked pages inside a pillar folder show a notice under the title (`src/components/PageTitle.astro`); top-level pages such as the legal ones don't.
- **Navigation:** the sidebar is declared in `astro.config.mjs`, grouped by visitor intent (Explore / Eat / Stay / Get Around / Plan Your Trip). Each pillar is a group whose `items` holds an `autogenerate` for its folder, so new pages in an existing pillar appear automatically. Pillar `index.md` files use `sidebar: { label: Overview, order: 0 }` to sort first. A new pillar folder needs a new group. Starlight 0.39+ doesn't allow `label` directly on an `autogenerate` entry.
- **CMS:** tingeworks CMS is Sveltia CMS, loaded from the `@sveltia/cms` npm package by `src/pages/admin/index.astro` (served at `/admin/`), which points at `public/admin/config.yml`. `config.yml` has one collection per pillar, each exposing only that pillar's fields. The CMS config is separate from the Astro schema, so a frontmatter field added in one must be added to the other by hand. Any frontmatter key a page uses must also be listed in its Sveltia collection, or Sveltia may drop it on save. Collection folder paths in `config.yml` are repo-relative (`src/content/docs`). Uploaded media is written to `public/uploads` and referenced as `/uploads/...` (Sveltia requires `public_folder` to be an absolute URL path), so it is served as-is and bypasses Astro image optimization. `local_backend: true` enables local editing during `pnpm dev`.
- **Homepage:** `src/content/docs/index.mdx` (splash template) is built from components in `src/components/home/`. Most sections use `PageCards`, which reads each pillar page's own title and description, so editing a page in the CMS updates its homepage card.
- **Dhaka Now (events):** a separate `events` collection of YAML files in `src/content/events/`, shown on the homepage and at `/whats-on/` (`src/pages/[...locale]/whats-on.astro`, which also builds `/bn/whats-on/`). Past events are dropped at build time and again in the browser, comparing dates in Dhaka time, so the list stays correct between deploys. Event dates follow the same fact-checking rule: only add dates confirmed by the organiser or an official source.
- **Languages (English and Bangla):** English is Starlight's root locale (no URL prefix, and the default). Bangla pages live in `src/content/docs/bn/`, mirroring the English folders, and are served at `/bn/...`. A Bangla page pairs with the English page that has the same path. Pages with no translation fall back to English with a notice, so every page exists at a `/bn/` URL. Interface text is in `src/content/i18n/en.json` and `bn.json`, read with `Astro.locals.t('key')`. `bn.json` also holds Starlight's own strings, because Starlight has no built-in Bangla. A new key must go in `en.json` (which declares the keys, via `src/content.config.ts`) and in `bn.json`. Sidebar labels are translated with `translations: { bn }` in `astro.config.mjs`. Custom components read the locale with `localeOf(Astro.url)` and build links with `localizePath()` and `localizedPages()` from `src/lib/i18n.ts`, rather than hard-coding English paths. The Bangla homepage is `src/content/docs/bn/index.mdx`, so keep it in step with the English one. In the CMS, each pillar has a Bangla collection (`bn-<pillar>`) that reuses the English fields through a YAML anchor. Sveltia's i18n structures can't write the `docs/bn/<pillar>/` layout. Events are English only for now.
- **Analytics and consent:** Google Tag Manager (which runs GA4) is loaded by `src/components/Head.astro` only after the visitor accepts in the cookie banner (`src/components/CookieConsent.astro`). Never load a Google or other tracking script outside that path. See `docs/decisions/0005-google-analytics-with-consent.md`.
- **Fonts:** Google Sans and Noto Sans Bengali are self-hosted through Astro's Fonts API (`fonts` in `astro.config.mjs`), downloaded at build time and added to the head by `src/components/Head.astro`. CSS uses `var(--font-noto-sans-bengali), var(--font-google-sans)`: Noto's file covers only Bengali characters, so it is used for Bangla and downloaded only by pages that have Bangla text. Don't link to Google Fonts or any other font CDN, because the privacy policy says fonts are served from the site.
- **About and legal pages:** `about.md`, `privacy.md`, `terms.md` and `licence.md` sit at the top of `src/content/docs/`, linked from the footer, not the sidebar. They are a file collection ("About & legal") in the CMS. The privacy policy lists every cookie, storage key and third-party service, so update it when any of those change. Content is CC BY-SA 4.0 and code is MIT (`LICENSE`, `LICENSE-CONTENT.md`).
- **Pages outside Starlight:** files in `src/pages/` (such as `admin/`) are plain Astro routes that bypass Starlight's layout.

- **Deploy:** Cloudflare builds with `pnpm run build`, then runs `npx wrangler deploy`, which reads `wrangler.jsonc` and uploads `dist/` as static assets. The site is fully static, so don't add `@astrojs/cloudflare` or `wrangler` as a dependency. Without `wrangler.jsonc`, wrangler tries to auto-configure the project and the deploy fails. Pages show a "Last updated" date read from git (`lastUpdated` in `astro.config.mjs`, with a "View history" link from `src/components/LastUpdated.astro`), so builds need full git history. When `WORKERS_CI` is set and the clone is shallow, `astro.config.mjs` runs `git fetch --unshallow` before building, so the Cloudflare build command doesn't need to change.

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

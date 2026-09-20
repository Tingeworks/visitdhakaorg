# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Dhaka city wiki / tourist guide (visitdhaka.org) built with Astro and the Starlight docs template, with Sveltia CMS for editing. See `README.md` for the content pillars, SEO strategy and roadmap.

## Commands

Uses pnpm. There is no test runner or linter configured.

- `pnpm build`: production build to `dist/` (also builds the Pagefind search index). This is the main verification step.
- `pnpm preview`: serve the built site.
- Dev server: use background mode (see Development below).
- Don't run `pnpm astro check`. `@astrojs/check` isn't installed, so it prompts to install it and hangs in a non-interactive shell.

## Architecture

- **Content:** wiki pages are Markdown/MDX in `src/content/docs/`, exposed as routes by path. `src/content.config.ts` defines the single `docs` collection using Starlight's `docsLoader()` and `docsSchema()`, so frontmatter is limited to Starlight's schema until custom collections or fields are added.
- **Navigation:** the sidebar is declared manually in the `starlight({ sidebar })` option in `astro.config.mjs`, not derived from the file tree, except for `autogenerate` groups. New pages need a sidebar entry to appear.
- **CMS:** Sveltia CMS is loaded from the `@sveltia/cms` npm package by `src/pages/admin/index.astro` (served at `/admin/`), which points at `public/admin/config.yml`. The CMS config is separate from the Astro collection schema, so a frontmatter field added in one must be added to the other by hand. Collection folder paths in `config.yml` are repo-relative (`src/content/docs`). Uploaded media is written to `public/uploads` and referenced as `/uploads/...` (Sveltia requires `public_folder` to be an absolute URL path), so it is served as-is and bypasses Astro image optimization. `local_backend: true` enables local editing during `pnpm dev`.
- **Pages outside Starlight:** files in `src/pages/` (such as `admin/`) are plain Astro routes that bypass Starlight's layout.

- **Deploy:** Cloudflare builds with `pnpm run build`, then runs `npx wrangler deploy`, which reads `wrangler.jsonc` and uploads `dist/` as static assets. The site is fully static, so don't add `@astrojs/cloudflare` or `wrangler` as a dependency. Without `wrangler.jsonc`, wrangler tries to auto-configure the project and the deploy fails.

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

# 0001: "Edit page" link to GitHub

- Status: Accepted, implemented
- Date: 2026-09-20

## Context

The site is a wiki, but it is static (Astro + Starlight on Cloudflare) and edited through a git-backed CMS. Readers have no way to propose a correction. The goal is community editing, and the cheapest first step is one that needs no new infrastructure.

## Decision

Enable Starlight's `editLink` in `astro.config.mjs`, pointing at `https://github.com/Tingeworks/visitdhakaorg/edit/main/`. Every docs page then links to its source file on GitHub, where a reader can fork and open a pull request.

## Consequences

- Zero infrastructure and zero maintenance. History, review and revert come from git and GitHub.
- Readers need a GitHub account, and the repo must be public for outsiders to use the link. This is a strong filter: it suits developers, not the general public.
- It does not deliver open editing. It is the fallback that stays in place under any later design (see 0002).

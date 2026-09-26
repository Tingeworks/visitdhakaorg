# 0003: How contributors are credited

- Status: Proposed
- Date: 2026-09-20

## Context

Contributors should be credited on the page and in the permanent record. Edits arrive as pull requests opened by a bot, so git's default attribution would credit the bot. Contributors may be anonymous, so names cannot be trusted.

## Decision

Credit is recorded in three places, in this order of reliability:

1. **Page frontmatter.** The Worker adds the contributor's display name to a `contributors:` list in the same pull request. It survives any merge style and any host. The site renders it as a "Contributors" footer on each page and can total it on a site-wide page.
2. **Commit author.** The commit on the pull request branch has the contributor's display name as author and the bot as committer. The email is always the placeholder `anonymous@visitdhaka.org`, never a user-supplied address, because GitHub links commit emails to accounts and a typed email would let someone be credited as another person.
3. **Commit message and pull request description.** A line `Edited-by: <name> (unverified)` keeps the name searchable with `git log --grep`.

Merge strategy: use "Create a merge commit" or "Rebase and merge". A squash merge may replace the author with the pull request opener. Verify this on the first real pull request and record the result here.

Names are unverified until sign-in exists. They are shown with no profile link, length-limited and stripped of markup, and they can be edited out by a maintainer. If GitHub sign-in is added later, a signed-in contributor's verified `<id>+<username>@users.noreply.github.com` address can be used as the author email, which links to their real profile and cannot be spoofed.

## Consequences

- Rejected edits earn no credit, because credit is only in a merged file.
- `contributors` must be added to the Astro schema in `src/content.config.ts` and to the Sveltia collections in `public/admin/config.yml`. Per `CLAUDE.md`, a key missing from a collection may be dropped when an editor saves through the CMS, which would silently erase credits. This needs an explicit test.
- Concurrent edits to one page both touch the `contributors` list and will conflict on merge. The Worker uses one open branch per page to avoid this (0002).
- The list grows without bound on busy pages. Store only unique names and cap the rendered list.

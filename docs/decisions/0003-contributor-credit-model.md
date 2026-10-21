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
- Sign-in is planned for phase 3, with Google first (0006). Signed-in edits will use a pseudonymous author email such as `user-<id>@visitdhaka.org`, never the person's Google email. That will be recorded as an update to this decision.

## Update (decision 0006, #58)

Optional Google sign-in is built (epic #54). A signed-in edit is credited like this:

- **Frontmatter:** the account's display name is added to `contributors`, as for any name. A `name` sent with a
  signed-in edit is ignored.
- **Commit author:** the display name, with the pseudonymous email `user-<id>@visitdhaka.org`, where `<id>` is the
  account's public ID in the D1 `users` table. Nothing from the Google account is ever written to git: no email,
  Google ID or profile data. GitHub doesn't link these addresses to anyone's GitHub account.
- **Commit message and pull request:** `Edited-by: <name> (account <id>)`, in place of `(unverified)`. The pull request
  says `Contributor | <name> (account <id>)`.

The address and the `(account <id>)` line link one account's edits to each other, publicly and permanently. That is the
point, and the privacy policy says so. The display name itself is still chosen by the person, not checked. Anonymous
edits are unchanged: `anonymous@visitdhaka.org` and `Edited-by: <name> (unverified)`.

### Contributor profiles (#62)

Each signed-in editor with a published edit has a profile page, `/contributors/<id>/` (and `/bn/contributors/<id>/`),
listing their published edits under their current display name. Profiles are static and built from git, like Recent
changes: the build finds commits whose author email is `user-<id>@visitdhaka.org`. These are the only emails ever read
from git, and no email is shown. Only merged edits are in the history the site builds from, so pending and declined
edits never appear, in keeping with credit for merged edits only.

The build also asks the edit Worker (`GET /api/users`) for each account's current name and which accounts still exist.
A rename shows on the profile from the next deploy, and a deleted account's profile is gone from the next deploy, while
its past edits stay in git and in pages' `contributors` lists under the name used at the time. If the Worker can't be
reached, the build makes no profile pages rather than rebuilding them from git alone. Recent changes links a signed-in
edit's author to the profile. Names in pages' "Contributors" lists stay plain text for now, because linking them needs
the account ID in `contributors`.

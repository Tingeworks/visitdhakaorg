# 0006: Anonymous editing first, optional Google sign-in later

- Status: Accepted
- Date: 2026-10-21

## Context

Phase 1 of open editing (0002, [open editing architecture](../architecture/open-editing.md)) lets anyone suggest an edit
without an account. They give an optional display name, which is unverified (0003). Phase 3 planned optional GitHub
sign-in.

Two questions came up before phase 1 was built:

- Should editing require an account, so every edit is tied to a person?
- Should sign-in use Google rather than GitHub? Most readers and local contributors in Bangladesh have a Google account,
  and few have a GitHub one.

Requiring sign-in from the start would change phase 1 a lot. It would need a users table in D1 (deferred by 0004),
sessions, account deletion and new privacy wording. It would also drop the anonymous name field and lean less on
Turnstile. Adding sign-in after phase 1 changes almost nothing that phase 1 builds: the Worker, the GitHub App,
validation, the editor and the review process are all needed either way.

## Decision

- **Editing never requires an account.** Anyone can suggest an edit with an optional display name, and every edit is
  reviewed before it is published (0002). For a travel guide that relies on casual visitors' local knowledge, a sign-in
  wall would stop most small fixes. Review, not identity, is what protects the content.
- **Phase 1 ships as planned:** anonymous, with an optional name, Turnstile and rate limits.
- **Sign-in comes later, is optional, and Google is the first provider.** It is planned as the start of phase 3, in its
  own epic. Signing in adds accountability (bans and rate limits per account), credit tied to an account, and the basis
  for trust levels and auto-merge. Anonymous editing stays available after it ships.
- **How Google sign-in will work, so phase 1 doesn't block it:**
  - Server-side OpenID Connect redirect flow in the edit Worker (`/api/auth/*`), with only the `openid`, `email` and
    `profile` scopes.
  - No Google Identity Services script or button on the site. Nothing is loaded from Google until the person clicks
    "Sign in", which keeps to the rule in 0005 that Google scripts load only after consent.
  - A signed, `HttpOnly`, first-party session cookie. This works because the Worker is served on `visitdhaka.org/api/*`,
    the same origin as the site (0002).
  - A D1 `users` table holding a stable user ID, display name, join date and a ban flag.
  - The Google email is never written to git, because commit history is public and permanent. Signed-in edits use the
    display name and a pseudonymous author email such as `user-<id>@visitdhaka.org`, so one person's edits can be linked
    without exposing their address. 0003 is updated when this is built.
  - The sign-in layer is written so that GitHub can be added as a second provider later. GitHub's verified noreply email
    can link commits to a real GitHub profile.
- **No hosted auth service** (Clerk, Auth0, Firebase Auth and similar). Each would add a third-party script and another
  data processor, against the privacy policy's aim of collecting as little as possible.

## What phase 1 does now to keep sign-in cheap

- The Worker works out who is editing in one place, a single function that returns an anonymous identity with the
  optional name for now (#13). `/api/edit` uses that identity for the commit author, the `Edited-by` line and
  `contributors` (#15), so a session check can be added there later without touching the rest.
- `/api/*` stays on the site's own origin (#14). Phase 1 sets no cookies.
- `contributors` stays a plain list of names, rendered as text with no profile links (#11).
- The editor leaves room for a later "Signed in as…" line or a "Sign in with Google" option, and never loads a Google
  script (#16).
- The privacy and terms changes describe anonymous editing without promising that the site will never have accounts
  (#17).

## Consequences

- Phase 1 keeps every abuse control that anonymous editing needs: Turnstile, per-IP rate limits, the daily cap and
  review.
- Google sign-in is a separate, later epic of roughly five or six issues: sign-in and sessions, the D1 users table,
  editor sign-in state, the credit update to 0003, privacy, terms and account deletion, and an end-to-end test. It
  brings D1 forward from phase 2 (0004) for users, though not necessarily for contribution records.
- Setting up Google sign-in needs a Google Cloud OAuth client and consent screen, with the verified domain and the
  privacy policy URL. With only basic scopes, Google's app review shouldn't be needed. Check this, and the current
  rules for showing a logo on the consent screen, when the work starts.
- Until sign-in exists, all credit stays unverified, as 0003 describes.

# 0008: Launch optional Google sign-in

- Status: Proposed
- Date: 2026-10-21

## Context

Optional Google sign-in for editors (0006, epic #54) is built and merged into `epic/sign-in`:

- the D1 `users` table and its queries (#56)
- the OpenID Connect redirect flow, signed session cookies and `identify()` reading the session (#57)
- credit to `user-<id>@visitdhaka.org` and `Edited-by: <name> (account <id>)`, and bans (#58)
- sign-in state, choosing a name and renaming in the editor (#59)
- account deletion, and the privacy policy and terms (#60)
- contributor profile pages built from git and `GET /api/users` (#62)

It's switched off in two places: the edit Worker's dashboard variable `SIGN_IN_ENABLED`, and the site's build variable
`PUBLIC_SIGN_IN_ENABLED`. Anonymous editing isn't affected either way.

## Evidence so far

The Worker's tests cover every route, the ID token checks, tampered and expired cookies, crediting, bans, deletion and
the off switch. A local run covered every editor state in English and Bangla, a signed-in edit, profile pages and
deletion ([test record](../reviews/sign-in-test-2026-10-21.md)). Nothing has run against Google's real sign-in page or
in production yet.

## Conditions

Accept this decision, and so switch sign-in on, when all of these hold:

1. The setup in #55 is done: the consent screen and client exist, the client ID and the verification and logo answers
   are recorded in the [architecture](../architecture/open-editing.md#google-sign-in-setup), the D1 migration is applied
   in production, and the secrets are set.
2. Public editing has launched (0007), so sign-in doesn't change phase 1 while it's being tested.
3. Every step of the production test in the test record has passed, from at least two people's accounts.
4. The profile page checks have passed across real deploys: a merged edit appears, and a rename and a deletion show up
   on the next deploy.
5. The privacy policy and terms, as changed in #60, are live before `SIGN_IN_ENABLED` is set to `true` for anyone
   outside the team.

## Decision

To be completed when the conditions are met: switch sign-in on as built, or record what has to change first. Set
`SIGN_IN_ENABLED` and `PUBLIC_SIGN_IN_ENABLED` to match.

## Consequences

- Once on, editors can sign in or stay anonymous. Reviewers see `(account <id>)` on signed-in edits and can ban an
  account with the [moderation runbook](../architecture/moderation.md).
- Switching it off again is a dashboard change: any value but `true` for `SIGN_IN_ENABLED` stops sign-in at once, and
  sessions are ignored, so every edit is anonymous. Profile pages keep building while `PUBLIC_SIGN_IN_ENABLED` is on.
- The D1 database becomes personal data to look after: back it up, and keep it to the columns listed in the privacy
  policy.

# Google sign-in end-to-end test: planned 21 October 2026

Scope: [issue #61](https://github.com/Tingeworks/visitdhakaorg/issues/61), the production test of optional Google
sign-in (epic [#54](https://github.com/Tingeworks/visitdhakaorg/issues/54)), like #18 for anonymous editing.
Status: **not started on production.** It needs the setup in #55 first: the Google OAuth client, the `visitdhaka-edit`
D1 database with its migration applied, and the Worker secrets. Sign-in stays off (`SIGN_IN_ENABLED` unset on the
Worker, `PUBLIC_SIGN_IN_ENABLED` unset on the site) until the go-live decision, [0008](../decisions/0008-launch-google-sign-in.md).

Fill in the tables as you go. Never record credentials, tokens, cookies, Google IDs or anyone's email address. Record
accounts by their account number only.

## Local run (21 October 2026)

Run before the production test, with the site built with `PUBLIC_EDITOR_ENABLED=true PUBLIC_SIGN_IN_ENABLED=true
PUBLIC_EDIT_API_URL=http://localhost:8787`, the Worker under `wrangler dev` with `SIGN_IN_ENABLED=true`, a local D1
database and the fake GitHub. Google's own sign-in page wasn't part of it: the sign-up and session cookies were made
with the local session secret, so this checks everything after Google's redirect back. The Worker's tests cover the
redirect, the callback and the ID token checks against a fake token endpoint.

| Check | Result |
| :--- | :--- |
| Signed out, English and Bangla | Name field plus a plain "Sign in with Google" link to `/api/auth/login`. No request to a Google domain on the editor page |
| Login redirect | `/api/auth/login` redirects to `accounts.google.com` with `scope=openid profile`, PKCE (`S256`) and `redirect_uri=http://localhost:8787/api/auth/callback` |
| First sign-in, `/bn/edit/` | "Choose your display name" shown first, form hidden. An email address was refused with the Bangla message, and `করিম` was accepted |
| Signed in after a reload | "Editing as করিম", name field hidden, contributor page note shown |
| Rename | Renamed to `Karim` from "Change your name" |
| Signed-in edit | Fake PR from `edit/areas/gulshan`: author `Karim <user-2@visitdhaka.org>`, `Edited-by: Karim (account 2)`, `contributors: [Karim]`, and `` `Karim` (account 2) `` in the pull request |
| Sign out | Back to the name field. `/api/auth/me` returned `user: null` |
| Profile pages | With throwaway commits, `/contributors/1/`, `/contributors/2/` and their `/bn/` versions were built with the current names, and Recent changes linked a signed-in author. There was no page for an account missing from `/api/users`, and no commit email appeared anywhere in `dist/` |
| Worker unreachable during the build | The build passed with a warning and built no profile pages |
| Delete account | Row deleted, signed out, `/api/users` no longer listed it |

## Production test

With `SIGN_IN_ENABLED=true` on the Worker and the site built with `PUBLIC_SIGN_IN_ENABLED=true`. Use at least two
people's Google accounts.

| Step | Expected | Result |
| :--- | :--- | :--- |
| 1. Before signing in, open an article page and `/edit/?path=…` | No request to any Google domain (network panel) | |
| 2. First sign-in | Google asks only for basic profile, then "Choose your display name" | |
| 3. Choose a name | Signed in, "Editing as <name>" | |
| 4. Signed-in edit | Pull request says `<name> (account <id>)`. The commit author is `<name> <user-<id>@visitdhaka.org>` and ends `Edited-by: <name> (account <id>)` | |
| 5. Second edit to the same page | Added to the same pull request, with a comment naming the account | |
| 6. Merge edit 4 with a merge commit, wait for the deploy | The edit is on `/contributors/<id>/` and `/bn/contributors/<id>/`. Recent changes links the name | |
| 7. Sign out, then sign in again | Straight back in, no name step | |
| 8. Ban the account (runbook) and try an edit | "This account can't make edits", no pull request | |
| 9. Unban and try again | The edit goes through | |
| 10. Rename, then wait for the next deploy | The profile shows the new name. Past commits keep the old one | |
| 11. Delete the account, then wait for the next deploy | `/contributors/<id>/` returns 404 in both languages. The edit stays in git and in the page's contributors | |
| 12. Edit with the deleted account's old cookie (copy it before deleting) | Treated as anonymous | |
| 13. `SIGN_IN_ENABLED` set to `false` | `/api/auth/*` says sign-in is off, and edits are anonymous even with a session | |
| 14. `/api/health` | Still never shows a secret | |

## Findings

None yet.

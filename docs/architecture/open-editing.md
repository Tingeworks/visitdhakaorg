# Open editing architecture

Status (2026-10-21): phase 1 is accepted (0002) and its validation, Worker, editor, policy and contributor-credit changes
are merged. Infrastructure setup and deployed integration tests
remain open. The editor is switched on in production for the end-to-end testing in #18, with `DAILY_EDIT_CAP=50` as the
only limit until the rate limiting rule exists. The go-live decision is still to be recorded (#18). Decisions 0003 and 0004 remain proposed;
0006 accepts anonymous editing first and optional sign-in later. See the [epic readiness review](../reviews/wiki-epic-readiness-2026-10-21.md).

## Goals and non-goals

Goals: let the public improve existing pages, keep full history and revert, credit contributors, cost close to nothing, and keep the static site as it is.

Non-goals for v1: instant publishing, new pages, renames, deletes, image uploads, MDX pages, frontmatter edits, real-time collaboration, user accounts. Editing never requires an account. Optional sign-in, with Google as the first provider, comes in phase 3 (0006).

## Components

```
Reader's browser
  |  1. "Edit" button on a docs page (Starlight component override)
  |  2. markdown editor with the page body, name field, licence notice, Turnstile
  v
Worker  (visitdhaka.org/api/*, separate Cloudflare project, folder worker/)
  |  3. verify Turnstile, rate limit, validate input
  |  4. authenticate as a GitHub App (short-lived installation token)
  v
GitHub repo Tingeworks/visitdhakaorg
  |  5. branch edit/<page-slug>, commit (author = contributor, committer = bot)
  |  6. pull request with contributor name and change summary
  v
Maintainer reviews the diff and merges  (merge commit or rebase, not squash)
  v
Cloudflare Workers Builds rebuilds the site from main and publishes
  (phase 2 only: GitHub webhook -> Worker -> D1 records the outcome)
```

The existing site (Astro + Starlight, `wrangler.jsonc` at the root, static assets from `dist/`) is not changed by the Worker. The only site changes are the editor component, the `contributors` field and the footer list.

## Edit request

`POST /api/edit`

| Field | Rules |
| :--- | :--- |
| `path` | Must match an existing `src/content/docs/**/*.md`. `.mdx`, other folders and paths with `..` are rejected. |
| `body` | Replacement markdown body. Frontmatter is never accepted from the client. |
| `baseSha` | Blob SHA of the file the editor loaded. Used to detect edits made on stale content. |
| `name` | Optional. 1 to 40 characters, plain text, no markup. Empty becomes "Anonymous". |
| `summary` | Optional short edit summary, length-limited, used in the pull request. |
| `turnstile` | Token, verified server side on every request. |
| `licence` | Must be true. Text: contributions are released under CC BY-SA 4.0. |

`GET /api/source?path=...` returns `{ ok, path, sha, title, body, pending }`: the current body and blob SHA for the editor. When the page already has a public edit waiting for review, it returns that edit's branch version instead, with `pending: { prUrl }`, so the next edit builds on it and joins the same pull request (like Wikipedia's pending changes). Otherwise `pending` is `null`. Responses are cached at the edge for 60 seconds to avoid spending GitHub API calls on reads. `GET /api/health` says whether the Worker can mint a GitHub token, and never returns a secret. Errors are always `{ ok: false, errors: [{ code, field? }] }`. Any other path under `/api/` returns 404.

### Responses from `POST /api/edit`

Checks run in this order, and nothing is written to GitHub until all of them pass.

| Status | Code (`errors[].code`) | Meaning |
| :--- | :--- | :--- |
| 201 | | New pull request: `{ ok, prUrl, prNumber, updated: false }` |
| 200 | | Added to the page's open pull request: `{ ok, prUrl, prNumber, updated: true }` |
| 400 | `invalid_json` | The request isn't a JSON object |
| 403 | `origin_not_allowed`, `turnstile_failed` | Wrong origin, or Turnstile rejected the token |
| 404 | `not_found` | The page doesn't exist |
| 409 | `stale` | The page changed since the editor loaded it. Reload and edit again |
| 409 | `conflict` | Another edit to the same page started at the same moment. Try again |
| 413 | `request_too_large` | Over 200 KB |
| 422 | Field codes from `worker/src/validate.ts`, plus `licence_required`, `base_sha_invalid`, `no_change` | Every invalid field is listed, each with its `field` |
| 429 | `daily_cap_reached` | The site-wide daily cap is reached, or editing is turned off (`DAILY_EDIT_CAP=0`) |
| 503 | `not_configured` | A secret or variable is missing (#10) |

Each page has one branch, `edit/<path in the docs folder>`, such as `edit/bn/attractions/lalbagh-fort`. A first edit costs 8 GitHub API calls and a second edit to the same page 6, plus one Turnstile check and an installation token about once an hour.

### Sign-in

Optional Google sign-in (0006, #57) is a server-side OpenID Connect redirect with PKCE, in `worker/src/auth.ts`. Nothing
loads from Google until someone follows "Sign in with Google".

| Route | What it does |
| :--- | :--- |
| `GET /api/auth/login?return=<path>` | Sends the browser to Google with `scope=openid profile`. `state`, `nonce`, the PKCE verifier and the return path (a same-site path, never a full URL) go in a signed 10-minute `__Host-signin` cookie |
| `GET /api/auth/callback` | Checks `state`, exchanges the code with the verifier, and checks the ID token's `iss`, `aud`, `exp` and `nonce`. An existing account gets a session. A new one gets a signed 10-minute `__Host-signup` cookie holding only Google's `sub`, and no account is made until it chooses a name |
| `POST /api/auth/name` | `{ name }`: creates the account from the sign-up cookie and signs it in, or renames the signed-in account. Same rules as the anonymous name, but required and never an email address |
| `POST /api/auth/logout` | Clears the session |
| `GET /api/auth/me` | `{ ok, user: { id, name } \| null }`, plus `pendingName: true` between Google and choosing a name. Never cached |

Every route returns 403 `sign_in_disabled` unless `SIGN_IN_ENABLED` is `true`, and 503 `not_configured` while a secret
or the database is missing. Callback failures are 400 `sign_in_expired`, `state_invalid`, `code_invalid` or
`token_invalid`, and 502 `google_error`.

The session is `__Host-session` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30 days), holding only the user ID and
its expiry, signed with HMAC-SHA256 from `SESSION_SECRET`. There's no session table: `identify()` in
`worker/src/identity.ts`, the only code that reads the cookie, reads the account's row on every request, so a ban or a
deleted account takes effect at once. While sign-in is off, sessions are ignored and every edit is anonymous. The ID
token comes straight from Google's token endpoint over TLS, so its signature isn't checked again, as OpenID Connect
allows.

To try it locally, put the client ID and secret, a session secret and `SIGN_IN_ENABLED=true` in `worker/.dev.vars`,
apply the migrations with `--local`, and sign in on `http://localhost:8787`. `__Host-` cookies need a secure context,
which Chrome and Firefox give `localhost` and Safari doesn't.

### The editor

The editor is a page, `/edit/?path=<source file>` (and `/bn/edit/`), rather than a dialog. Article pages load no extra JavaScript, Turnstile loads only when someone opens the editor, and phones get a full-width form. It's a plain `<textarea>` with no preview, which keeps it light and avoids rendering untrusted Markdown in the browser. It's switched on by site build variables, set on the existing site project in Cloudflare (or in `.env` locally):

| Variable | Value |
| :--- | :--- |
| `PUBLIC_EDITOR_ENABLED` | `true` to send "Edit page" to the editor. Leave unset until the Worker is deployed and routed (#13, #14) and #17 is merged |
| `PUBLIC_TURNSTILE_SITE_KEY` | The Turnstile site key (#10). Without it, the editor stays off in production |
| `PUBLIC_EDIT_API_URL` | Leave unset in production, where the Worker is on the same origin. Locally, the `wrangler dev` address, such as `http://localhost:8787` |

To try it locally, run the Worker with `pnpm dev` in `worker/`, with `ALLOWED_ORIGIN` set to the site's local origin in `worker/.dev.vars`. Then build or run the site with `PUBLIC_EDITOR_ENABLED=true PUBLIC_EDIT_API_URL=http://localhost:8787`. Without app credentials, the Worker can load pages but not write edits.

## Validation and abuse controls

These matter more than the hosting choice.

- **Frontmatter is server-owned.** The Worker parses the existing file, replaces only the body, and rewrites frontmatter itself. On any edit it sets `verified: false` and appends the contributor to `contributors:`. A client can never set `verified: true`.
- **Reject executable and unsafe content.** No MDX, no `<script>`, `<iframe>`, event-handler attributes or `javascript:` links. Raw HTML in markdown is rejected in v1 rather than sanitised.
- **Link spam.** Edits that add external links are flagged in the pull request and never auto-merged. Rendered user-added links should carry `rel="nofollow ugc"`.
- **Size limits.** Cap body length and the size of the diff versus the base.
- **Turnstile** on every submit (free, no verification cap).
- **Rate limits.** Per-IP limit through a Cloudflare rate limiting rule, plus a global daily cap on pull requests as a circuit breaker. When the cap is hit, the editor asks the reader to try later. This also protects the GitHub secondary rate limit.
- **Name hygiene.** Names are stripped of markup and control characters and length-limited, and are reviewed as part of the pull request diff.
- **Branch hygiene.** One open branch per page (`edit/<slug>`). A second edit to the same page adds a commit to the existing pull request. Enable "automatically delete head branches" on the repo.

## Identity and secrets

- A GitHub App installed on this one repo with only Contents and Pull requests write. It produces short-lived installation tokens and is not tied to a person's account, which a personal access token would be.
- App private key and Turnstile secret are Worker secrets. Nothing secret is in the repo or the browser.
- Anonymous author email is always `anonymous@visitdhaka.org` (see 0003).
- The Worker works out who is editing in one place, which returns an anonymous identity with the optional name in phase 1. Phase 3 adds a session check there for signed-in editors, without changing the rest of `/api/edit` (0006).

### Secrets and variables

These names are the contract the Worker code reads (#10). Values are never written in the repo, issues or chat.

| Name | Kind | Where it lives |
| :--- | :--- | :--- |
| `GITHUB_APP_PRIVATE_KEY` | Secret | Edit Worker secret. The app's private key converted to PKCS#8, because Workers' WebCrypto can't read GitHub's PKCS#1 download. The original key is in the team password manager |
| `TURNSTILE_SECRET_KEY` | Secret | Edit Worker secret |
| `GITHUB_APP_ID` | Variable | Edit Worker dashboard |
| `GITHUB_INSTALLATION_ID` | Variable | Edit Worker dashboard |
| `DAILY_EDIT_CAP` | Variable | Edit Worker dashboard only, never `worker/wrangler.jsonc`, so the kill switch survives deploys (#35) |
| `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BASE_BRANCH`, `ALLOWED_ORIGIN` | Variable | `vars` in `worker/wrangler.jsonc` |
| `PUBLIC_TURNSTILE_SITE_KEY` | Build variable | Site project. Public by design: the `PUBLIC_` prefix puts it in the page |
| `PUBLIC_EDITOR_ENABLED` | Build variable | Site project. `true` makes "Edit page" open the in-site editor |
| `GOOGLE_CLIENT_SECRET` | Secret | Edit Worker secret, for Google sign-in (#55). The original is in the team password manager |
| `SESSION_SECRET` | Secret | Edit Worker secret: at least 32 random bytes (`openssl rand -base64 48`), which sign the session and sign-in cookies. Rotating it signs everyone out |
| `GOOGLE_CLIENT_ID` | Variable | Edit Worker dashboard, next to the secret. Not secret: it appears in the sign-in redirect |
| `SIGN_IN_ENABLED` | Variable | Edit Worker dashboard only, never `worker/wrangler.jsonc`. `true` allows sign-in. Missing or anything else means off, and existing sessions are ignored, so every edit is anonymous |
| `DB` | D1 binding | The `visitdhaka-edit` D1 database, bound in `worker/wrangler.jsonc`. Holds only the `users` table (0006) |
| `PUBLIC_SIGN_IN_ENABLED` | Build variable | Site project. `true` shows sign-in in the editor and builds contributor profile pages (#59, #62) |

`keep_vars: true` in `worker/wrangler.jsonc` stops deploys removing the dashboard variables. For local development,
`worker/.dev.vars.example` lists every Worker name with empty or test values, including Cloudflare's always-pass
Turnstile test secret. Anything that writes must point at a fork or test repo, never this one.

Admins of the Cloudflare account can change the Worker's secrets and variables. Owners of the Tingeworks GitHub
organisation can manage the GitHub App. To rotate:

- **GitHub App private key:** generate a new key in the app's settings, convert it to PKCS#8
  (`openssl pkcs8 -topk8 -nocrypt -in app.pem -out app-pkcs8.pem`), set it with `npx wrangler secret put
  GITHUB_APP_PRIVATE_KEY` from `worker/`, check that `/api/health` still reports `canMintToken: true`, then delete the
  old key in the app's settings. Keep the new original in the password manager and delete the local files.
- **Turnstile secret:** rotate it in the Turnstile widget's settings and set the new value with `npx wrangler secret put
  TURNSTILE_SECRET_KEY`. The site key stays the same unless the widget is replaced. If it is, update
  `PUBLIC_TURNSTILE_SITE_KEY` and rebuild the site.

### Google sign-in setup

Optional sign-in (0006) uses a Google OAuth client and a D1 database (#55). Owners of the Tingeworks Google Cloud project
can change the client. To set it up:

- **Consent screen:** app name "Visit Dhaka", user type External, the verified domain `visitdhaka.org`, the privacy
  policy (`https://visitdhaka.org/privacy/`) and terms (`https://visitdhaka.org/terms/`) URLs, and a shared support
  address rather than a person's.
- **Scopes:** `openid` and `profile` only, never `email`. Both are non-sensitive, so the sensitive and restricted scope
  verification doesn't apply. Google's help on [when verification is needed](https://support.google.com/cloud/answer/13464321)
  says every app still needs brand verification (verified domain, homepage and privacy policy), apart from some exempt
  cases. Whether that applies to this app, and whether adding a logo needs it, is shown in the console's "Verification
  centre" when the consent screen is set up: record what it says here.
- **Client:** type "Web application", with redirect URIs `https://visitdhaka.org/api/auth/callback` and
  `http://localhost:8787/api/auth/callback`. Record the client ID here once it exists (it isn't secret).
- **Database:** `npx wrangler d1 create visitdhaka-edit` from `worker/` (or let the first deploy create it), then
  `npx wrangler d1 migrations apply visitdhaka-edit --remote`.
- **Secrets:** `npx wrangler secret put GOOGLE_CLIENT_SECRET` and `npx wrangler secret put SESSION_SECRET` from
  `worker/`, and `GOOGLE_CLIENT_ID` and `SIGN_IN_ENABLED` as dashboard variables. None of these go in the site's build
  variables.

To rotate the client secret, add a new secret to the client in the console, set it with `wrangler secret put`, check a
sign-in, then delete the old one.

## Data model changes

- `src/content.config.ts`: add `contributors` (array of strings, optional) to the docs schema.
- `public/admin/config.yml`: add the same field to every pillar collection (schema and CMS config are separate, per `CLAUDE.md`), and test that saving a page in Sveltia keeps the list.
- Footer: a component (Starlight override) that renders the list under each page.

## Deployment topology

| Piece | Where | Deploys from |
| :--- | :--- | :--- |
| Static site | Existing Cloudflare project, `wrangler.jsonc` at repo root | `main`, root directory |
| Edit Worker | Its own Cloudflare project, `visitdhaka-edit`, `worker/wrangler.jsonc` | `main`, root directory `worker/` |
| Route | `visitdhaka.org/api/*` mapped to the Worker, declared in `worker/wrangler.jsonc` | The Worker's deploy |

### Settings

Platform and repository settings the edit flow relies on (#14), as of 21 October 2026:

- **Route:** `visitdhaka.org/api/*` goes to the edit Worker, which takes priority over the site for those paths. Every
  other path is served by the site. `www.visitdhaka.org` doesn't resolve, so `ALLOWED_ORIGIN=https://visitdhaka.org`
  covers every page. If `www` is added later, redirect it to the apex.
- **Branch protection on `main`:** a pull request with one approving review is required, and approvals are dismissed
  when new commits arrive. A second public edit added to an approved pull request therefore needs approving again.
  Force pushes and deletion are blocked, and code-owner reviews aren't required. "Include administrators" is off on
  purpose: every collaborator is an admin, and authors can't approve their own pull requests. The edit bot isn't an
  admin, so it can never write to `main`.
- **Merge methods:** merge commits and rebase are allowed. Squash is off until #18 records whether it keeps authorship.
- **Head branches** are deleted automatically after merging.
- **Labels:** `public-edit` and `links-added`.
- **Turnstile:** the widget's hostnames are `visitdhaka.org`, `localhost` and `127.0.0.1`. Development uses Cloudflare's
  always-pass test keys rather than this widget.
- **Edit Worker builds:** Workers Builds deploys `visitdhaka-edit` from `main` with root directory `worker/`, build
  command `pnpm test` (failing tests stop the deploy) and deploy command `npx wrangler deploy`. Its watch path is
  `worker/*`, so only changes to the Worker deploy it. Preview builds are off for the Worker.
- **Site preview builds:** still on for every branch, including `edit/*`. Workers Builds can only turn preview builds
  on or off for all branches, not exclude a pattern. Keeping them gives reviewers a preview link for each public edit.
  The daily cap limits public edits to about 50 builds a day, but builds run one at a time, so a burst can delay a
  production build. Revisit before launch (#18).
- **Rate limiting rule** "Public edit submissions (/api/edit)": requests whose path is `/api/edit` are counted per IP,
  and more than 3 in 10 seconds are blocked for 10 seconds. The zone is on the Free plan, which allows one rule, only
  10-second periods and blocks, and matching on path but not method. Turnstile and the daily cap remain the main limits.
- **Site build variables:** only `PUBLIC_EDITOR_ENABLED` and `PUBLIC_TURNSTILE_SITE_KEY`. The GitHub App's private key,
  App ID and installation ID live only on the edit Worker, because every branch build of the site can read the site's
  build variables.

`DAILY_EDIT_CAP` is a dashboard-managed runtime variable, deliberately absent from `worker/wrangler.jsonc`.
Set it to `50` during setup (#10), or `0` to stop edits. `keep_vars: true` preserves it across deploys (#35).
A missing or invalid cap keeps editing closed. Confirm preservation with a real redeploy before launch (#18).

## Phases

1. **Phase 1, MVP (no D1):** editor, Worker, GitHub App, Turnstile, rate limiting, frontmatter rules, `contributors` credit, one branch per page. Recommended to test the credit and merge behaviour with a handful of real pull requests before public launch.
2. **Phase 2, records:** D1 `contributions` table and webhook, reconcile job, recent-changes page.
3. **Phase 3, identity and trust:** optional sign-in, Google first and then GitHub, through a server-side redirect flow in the Worker with a first-party session cookie and a D1 `users` table. Also verified credit, per-user trust levels and auto-merge for trusted users. Anonymous editing stays available (0006).
4. **Later:** new-page creation, image uploads, a reviewer UI outside GitHub.

## Open questions

Status on 21 October 2026. Each is closed by the end-to-end test (#18, [test record](../reviews/public-editing-test-2026-10-21.md))
or carried forward in decision 0007.

- **Does a squash merge keep the commit author?** Open. Test it once on a throwaway public edit and record the answer
  in 0003. Squash stays off until then.
- **Does the free plan's CPU limit cover an edit?** Partly answered. The first real edit used 15 ms against 10 ms,
  mostly one-off costs in a fresh Worker instance, and #45 removed the largest of them. Measure the test edits before
  choosing between the free and paid plans.
- **Where does the editor read the source from?** Answered: from the Worker's `/api/source`, which reads GitHub's
  contents API (the page's open edit branch, otherwise `main`). Responses are cached for 60 seconds in each data centre,
  and an edit clears its page's entry in the data centre that handled it. So for up to a minute after a pull request is
  merged, the editor can still offer the pre-merge text. A submit then gets the "page changed" message, which also
  clears that cached copy, so "Reload the latest version" shows the merged text. The test checks this right after a
  merge.
- **Is GitHub's pull request view acceptable for reviewers?** Reviewers and turnaround are in the
  [moderation runbook](moderation.md). Whether the view works for them is checked in #18.
- **Licence, terms and takedown:** answered. The licence, terms and privacy pages cover public editing (#17), and the
  runbook has the takedown process. A lawyer's review is still on the roadmap in `README.md`.

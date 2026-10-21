# Public editing end-to-end test: started 21 October 2026

Scope: [issue #18](https://github.com/Tingeworks/visitdhakaorg/issues/18), the real-edit test of moderated public editing,
which also covers the live acceptance checks of #15 and #16 and the cap check moved from #35.
Status: **in progress.** The editor is on in production for this test (`PUBLIC_EDITOR_ENABLED=true`), with
`DAILY_EDIT_CAP=50` and the `/api/edit` rate limiting rule as limits. Public editing hasn't launched: the go-live
decision is recorded in `docs/decisions/` once the results below are in.

Fill in the tables as you go. Never record credentials, tokens, Turnstile responses or anyone's email address.

## Checked before the real edits (21 October 2026)

These were checked on production without submitting an edit:

- **Turnstile loads only on the editor page.** A fresh load of `/food/fuchka/` and `/bn/food/fuchka/` requests nothing
  from `challenges.cloudflare.com`. `/edit/?path=…` loads the Turnstile script only after the page text has loaded.
- **The editor works at 375 pixels** in English (`/edit/`) and Bangla (`/bn/edit/`), with no horizontal overflow.
  Every field is labelled, and the Bangla page uses the Bangla interface text.
- **The deployed Worker** reads page source through `/api/source`, and `/api/health` reports `canMintToken: true`.
- **Redeploying keeps the dashboard cap** (#35): a `wrangler deploy` from `main` kept `DAILY_EDIT_CAP=50`.
- **Settings** are listed in the [architecture](../architecture/open-editing.md#settings): Workers Builds, the rate
  limiting rule, branch protection and merge methods.

## Before you start

- **Bangla page:** `/bn/food/fuchka/` is translated (#43), and its "Edit page" opens the Bangla editor. Use it for
  the Bangla edit. Every other `/bn/` guide page still falls back to English and links to GitHub instead.
- **Two people**, each on their own device and network, so the per-IP rate limit and authorship are realistic.
- Merge with **"Create a merge commit"** or **"Rebase and merge"**, as the [runbook](../architecture/moderation.md#merging)
  says. Use squash only for the one throwaway test below.

## Edits

Make at least five edits through "Edit page" on the live site. Note each pull request.

| # | Who | Page and language | What it tests | Pull request | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Imtiaz | Mohammadpur, English | First edit opens a pull request (#15) | [#39](https://github.com/Tingeworks/visitdhakaorg/pull/39) | Passed all four checks below. Closed without merging on 21 October, so edit 2 needs a new first edit with its pull request left open |
| 2 | | Same page as 1 | A repeat edit adds a commit to the same pull request (#15) | | |
| 3 | | Bangla page | Bangla edit through `/bn/edit/` edits the Bangla file (#16) | | |
| 4 | | Any page | Adds an external link: the pull request is labelled `links-added` | | |
| 5 | | Any page | Stale edit: open the editor in two tabs, submit one, then the other. The second is rejected with the reload prompt (409) | | |

For each pull request, check:

- the commit author is the name given, with `anonymous@visitdhaka.org`, and the committer is the app
- the commit message ends with `Edited-by: <name> (unverified)`
- the frontmatter has `verified: false` and the name in `contributors`, and nothing else in it changed
- the pull request body has the name, summary, path, flags and reviewer checklist, and the `public-edit` label

## Questions to answer

| Question | How to test | Answer |
| :--- | :--- | :--- |
| Does a squash merge keep the contributor as author? | Turn squash on briefly, squash-merge one throwaway edit, check the commit on `main`, then turn squash off again. Record the answer in decision 0003 | |
| Does `/api/edit` stay within the free plan's 10 ms CPU per request? | Edit Worker → Observability, the `cpuTimeMs` of each `POST /api/edit` event. The median across all requests was 3.36 ms on 21 October, but that was only `/api/health` and `/api/source` | **Not on the first sample.** #39 used 15 ms of CPU (6.3 s wall time, mostly waiting for GitHub) and still succeeded. Check every edit in this test. If they stay over 10 ms, either move to the paid plan or cut the CPU, for example by caching the installation token instead of signing a new app token for every edit |
| Does the cached `/api/source` cause false 409s right after a merge? | Merge an edit, wait for the deploy, then edit the same page again straight away | |
| Does the CMS keep `contributors` after a public edit? | Save a merged, publicly edited page in the CMS and check `git diff` | |
| Does the credit show? | After the merge and deploy, the name appears under the page and on Recent changes | |
| Does the rate limit trigger? | Submit more than 3 times in 10 seconds from one IP. Cloudflare's block page or an error appears, and the editor shows the rate-limited message | |
| Does the daily cap stop edits? | Set `DAILY_EDIT_CAP` to `0` in the Worker dashboard, submit an edit and expect "try again tomorrow" (429 `daily_cap_reached`), then set it back to `50` (#35) | |

## When it's done

- Write the results here and rename the file to the date the test finished.
- Update decisions 0002 and 0003, and answer or carry forward the open questions in the
  [architecture](../architecture/open-editing.md#open-questions).
- Decide whether to keep previews on for `edit/*` branches (see the architecture's Settings).
- Record the go-live decision in `docs/decisions/`.

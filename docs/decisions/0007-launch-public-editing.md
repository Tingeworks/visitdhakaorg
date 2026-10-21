# 0007: Launch public editing

- Status: Proposed
- Date: 2026-10-21

## Context

Phase 1 of open editing (0002, 0006) is built: the edit Worker with GitHub App authentication, validation and
`POST /api/edit` (#12, #13, #15), the in-site editor in English and Bangla (#16), contributor credit (#11), the policy
pages (#17) and the moderation runbook (#9). The Worker is deployed on `visitdhaka.org/api/*` by Workers Builds, with
its secrets, a daily cap of 50 public edits, a per-IP rate limit and Turnstile (#10, #14, #35).

The editor has been switched on in production since 21 October 2026 so the end-to-end test (#18) can use real pages.
Until this decision is accepted, public editing hasn't launched: it isn't announced, and the test edits come from the
team. The epic (#1) is done when this decision is recorded.

This is separate from launching the site itself. The site stays hidden from search engines (`noindex` and
`robots.txt`) until the launch steps in `README.md`.

## Evidence so far

From the [test record](../reviews/public-editing-test-2026-10-21.md):

- **On production, without submitting:** Turnstile loads only on the editor page. The editor works at 375 pixels in both
  languages. A redeploy keeps the dashboard cap. Cloudflare Web Analytics is off, so no script runs before consent
  apart from Turnstile on the editor page.
- **Locally, end to end:** a first edit, a repeat edit to the same pull request, a Bangla edit, an added external link
  and a stale edit all behaved as specified. So did the daily cap at 0 and a failed security check.
- **First real edit (#39):** the commit, frontmatter and pull request were as specified. It used 15 ms of CPU against
  the free plan's 10 ms. #45 removed most of the cold-start cost, and the live effect is still to be measured.

## Conditions

Accept this decision, and so launch public editing, when all of these hold:

1. Every edit in the test record has passed on production, from at least two people, and has been merged with a merge
   commit or rebase.
2. After the merges deploy, the names show under the pages and on Recent changes, and saving a merged page in the CMS
   keeps `contributors`.
3. The squash-merge test is recorded in 0003, and the repository's merge settings match the result.
4. `/api/edit` stays within the Worker's CPU limit over the test edits, or the paid Workers plan is chosen instead.
5. The rate limit and the daily cap have both been triggered on production, and the cap is back at its launch value.
6. The reviewers in the [moderation runbook](../architecture/moderation.md) have reviewed the test pull requests and
   agree GitHub's pull request view works for them.
7. Previews for `edit/*` branches have been decided: kept for reviewers, or turned off to save build minutes (see the
   architecture's Settings).

## Decision

To be completed when the conditions are met: launch public editing as built, or record what has to change first.

## Consequences

- Once accepted, edits from anyone can arrive at up to the daily cap, and reviewers follow the runbook's turnaround.
- Turning editing off again stays a dashboard change: `DAILY_EDIT_CAP=0` stops new edits at once and survives deploys
  (#35). Switching `PUBLIC_EDITOR_ENABLED` off and rebuilding the site returns "Edit page" to GitHub.
- A lawyer's review of the policy pages remains on the roadmap in `README.md`. It doesn't block this decision, but
  their `verified` flags stay `false` until it happens.

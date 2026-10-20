# Wiki epic readiness: 21 October 2026

Scope: [issue #1](https://github.com/Tingeworks/visitdhakaorg/issues/1), Wikipedia-style pages and moderated public editing.
This is an interim review, not the go-live decision required by #18. At this snapshot, 10 of 18 sub-issues are closed.
Public editing remains disabled while infrastructure and integration checks are incomplete.

## Branches and collaboration

Work stays on a branch for its issue, with changes integrated into `main` through pull requests. Separate branches
isolate unfinished work, but edits to shared files still need review and may need merge-conflict resolution.
Do not force-push, repurpose or delete another contributor's branch.

| Branch | Work | Status at this review |
| :--- | :--- | :--- |
| `main` | Integrated site and Worker | Deployment source; public editor remains disabled |
| `infobox` | Wikipedia-style infobox | Already included in `main` |
| `docs/anonymous-editing` | Decision 0006 | Merged through #25 |
| `docs/moderation-runbook` | Moderation process, #9 | Merged through #28; issue closed |
| `contributors` | Credits and CMS fields, #11 | PR #29 open; CMS round trip still required |
| `worker-validation` | Edit validation, #12 | Merged through #30; issue closed |
| `edit-worker` | GitHub App authentication and source API, #13 | Merged through #31; deployed authentication check pending |
| `edit-endpoint` | Submission API, #15 | Merged through #32; real test-repository submissions pending |
| `in-page-editor` | English and Bangla editor, #16 | Merged through #33; real submissions pending |
| `legal-public-editing` | Policy updates, #17 | Merged through #34; issue closed; lawyer review remains on roadmap |
| `fix/public-editing-review` | Preserve emergency cap, #35 | Merged through #36; deployed preservation test pending |

Imtiaz owns infrastructure setup (#10 and #14). Alfa5nm owns the remaining epic implementation and verification
issues (#11, #13, #15, #16 and #18). Coordinate the deployed check for #35 with Imtiaz's setup.
Use a separate documentation branch for this readiness review.

## Evidence already collected

- Track A (#2–#8) is closed: infobox, verification notice, references, history, tags/backlinks, recent changes/random
  page, and Talk links are integrated.
- Worker tests: 88 pass after PR #36, including encoded unsafe links, Markdown code boundaries, oversized chunked
  requests, malformed daily caps, and the missing-cap case. Worker type checking passes.
- The site builds 236 pages with the editor routes present. Production builds without a Turnstile key keep both
  the editor form and article editor links disabled, even when the enable flag is set.
- Local browser checks loaded real article source through the development Worker, verified missing-licence feedback
  and keyboard focus, and checked the Bangla interface at a 375-pixel viewport without horizontal overflow.

These checks do not establish deployed GitHub App authentication, real pull-request creation, production rate limits,
production cookies/storage, or Cloudflare CPU usage. The required CMS save/reopen test has not passed yet.

## Remaining checks, in order

1. **#11 / PR #29:** save an English page and a Bangla page containing `contributors: [A, B]` through the local CMS.
   Reopen both, confirm the names survive, and put the resulting diffs in the PR. Remove temporary fixtures before merging.
2. **#10 and #14, Imtiaz:** configure the GitHub App, test repository, Turnstile, secrets, Worker route, rate limits,
   preview-build exclusions and repository review/merge settings. Set `DAILY_EDIT_CAP` in the dashboard only.
3. **#13:** confirm deployed `/api/health` reports `canMintToken: true`; never record credentials in evidence.
4. **#15 and #16:** submit English and Bangla edits against the test repository. Confirm a first edit opens a PR,
   a repeat edit joins it, stale source is rejected, frontmatter is server-owned, and author/committer credit is correct.
5. **#35:** set the deployed cap to `0`, redeploy, and confirm edit requests still return `daily_cap_reached`.
6. **#18:** run at least five real edits from at least two people, covering both languages, a repeat edit, a new
   external link and deliberately stale source. Use the runbook's merge method. Check post-merge credit, CMS preservation,
   source-cache behavior, rate limits, the cap, actual Turnstile storage and when its requests start.
7. **#18:** measure deployed Worker CPU, test squash authorship on a throwaway edit, record results in `docs/reviews/`,
   update decisions 0002/0003 and resolve or carry forward the architecture's open questions. Record the go-live decision
   in `docs/decisions/` before enabling public editing.

The pre-launch `noindex` and `robots.txt` restrictions remain in place. New-page creation, image uploads, MDX editing,
accounts, D1 contribution records and trust/auto-merge belong to later phases.

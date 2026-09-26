# Open editing: feasibility review

- Date: 2026-09-20
- Scope: decisions 0002, 0003, 0004 and the [architecture](../architecture/open-editing.md)
- Author's note: this is an assessment of a design, not of built code. Effort figures are rough estimates.

## Verdict

**Go, staged, and not before there is something to edit.**

1. Build phase 1 (Worker opens pull requests, no D1) shortly before launch, or now if it is wanted as a showcase piece. It is technically sound and cheap to run.
2. Do not build D1, sign-in or auto-merge until real usage asks for them.
3. Accept up front that this is **moderated** editing. If the requirement is genuinely instant, unreviewed public editing, this design does not deliver it, and the honest alternatives are a server-based wiki (MediaWiki) or committing straight to `main` with heavy abuse controls. Neither is recommended for a site with this little content and no traffic yet.

Earlier in the discussion D1 was presented as closing most of the gaps. That overstated it. The gaps that matter in phase 1 are closed by git, frontmatter and a merge setting. D1 is a phase 2 convenience.

## Feasibility

| Area | Assessment | Notes |
| :--- | :--- | :--- |
| Technical | High | Every piece is standard: a Worker, the GitHub API, Turnstile. No novel components. |
| Cost | High | Near zero at expected volume. See limits below. |
| Operational | Medium | Little to run, but needs a reviewer and a response process for abuse. |
| Product fit | Medium | Works if there are readers and reviewers. On a pre-launch site with 35 unverified pages, editing demand is unproven. |
| Legal and policy | Low until done | Needs a licence, terms, privacy note and takedown route before public use. |

Rough effort for phase 1: a few days to about two weeks of focused work, dominated by validation, the editor UI and testing the merge and CMS interactions, not by the Worker itself.

## Platform limits checked

Checked against Cloudflare and GitHub documentation on 2026-09-20. Recheck before depending on them.

| Limit | Value | Impact |
| :--- | :--- | :--- |
| Workers Free requests | 100,000 per day | Ample. Static assets do not run the Worker, only `/api/*` does. |
| Workers Free CPU time | 10 ms per HTTP request | Possible squeeze for parsing and validating markdown. I/O to GitHub is not CPU time. Test early. The paid plan removes the concern. |
| Workers subrequests | 50 per request (Free) | An edit needs roughly 5 to 8 GitHub calls. Fine. |
| Workers Builds (Free) | 3,000 minutes per month, 20 minute timeout, 1 concurrent build | Site builds take seconds locally. Fine unless preview builds run for every edit branch (see risks). One concurrent build means bursts queue. |
| D1 Free | 5 million rows read per day, 100,000 written per day, 5 GB total, 500 MB per database | Far above need. |
| Turnstile Free | Unlimited challenges, 20 widgets, 10 hostnames per widget | Fine. Hostnames must be configured. |
| GitHub REST primary | 5,000 requests per hour for an authenticated user | Fine. A GitHub App has its own limits, at least as high. |
| GitHub secondary | About 80 content-creating requests per minute and 500 per hour | Each edit creates a branch, a commit and a pull request. This caps sustained throughput at roughly 150 edits per hour and is the reason for the global daily cap. Estimate, not a measured figure. |

Sources: Cloudflare docs (Workers limits, Workers Builds limits, D1 pricing and limits, Turnstile plans) and GitHub REST API rate limit docs.

## Risks

Ranked by how likely they are to hurt.

| # | Risk | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Reviewer bottleneck: edits queue and contributors lose interest | High | High | Decide who reviews and target turnaround before launch. Keep pull requests small. Phase 3 auto-merge for trusted users. |
| 2 | Spam and link spam once the site is indexed | High | Medium | Turnstile, rate limits, global cap, link edits flagged and never auto-merged, `rel="nofollow ugc"`. |
| 3 | Malicious content: MDX or raw HTML that runs code at build time or in the page | Medium | High | `.md` only, reject MDX and raw HTML in v1, server-owned frontmatter. Review diffs. |
| 4 | Frontmatter tampering, for example a contributor setting `verified: true` | Medium | Medium | Client never sends frontmatter. Worker forces `verified: false` on every edit. |
| 5 | Sveltia drops the `contributors` key on save, erasing credits | Medium | Medium | Add the field to every Sveltia collection and test a CMS save. Known behaviour per `CLAUDE.md`. |
| 6 | Preview builds for every `edit/*` branch burn build minutes and queue the production build | Medium | Medium | Disable non-production branch builds for those branches. Verify in the Cloudflare settings. |
| 7 | Bot credentials leak or a personal token is used | Low | High | GitHub App with minimal permissions, secrets only in the Worker, rotation documented. |
| 8 | Unverified names used for impersonation or abuse | Medium | Low to medium | Placeholder email, `(unverified)` label, name filtering, maintainers can remove names. Sign-in in phase 3. |
| 9 | Unsafe travel, health or visa information published by mistake | Medium | High | Review before merge, `verified: false` after every edit, keep official-source pointers for hours, fees and visa rules. |
| 10 | Squash merge overwrites the author | Medium | Low | Frontmatter is the record. Use merge commit or rebase. Verify on the first real pull request. |
| 11 | Stale-base conflicts | Medium | Low | Track `baseSha`, one branch per page, GitHub flags conflicts. |
| 12 | Wasted effort: little contributor demand | Medium | Medium | Stage the build, launch content first, measure edit-link clicks before phase 2. |

## Technical debt register

Debt this design takes on, or existing debt it exposes.

| # | Item | Type | When it bites | Action |
| :--- | :--- | :--- | :--- | :--- |
| D1 | Schema and CMS config are two hand-synced files, and `contributors` adds another field to both | Existing, increased | Every new field | Consider generating `config.yml` from the schema, or a check that compares them. |
| D2 | `CLAUDE.md` forbids `wrangler` as a dependency, but the Worker needs it | Conflict | First Worker commit | Amend the rule: allowed only inside `worker/`, never in the site root. |
| D3 | The repo has no tests or linter, and the Worker holds security-critical validation | New | First bug in validation | Add a test runner scoped to `worker/`, at least for path, frontmatter and HTML rejection rules. |
| D4 | Second Cloudflare project and second deploy pipeline | New | Deploy drift, forgotten secrets | Document setup in `worker/README.md`. Keep config in `worker/wrangler.jsonc`. |
| D5 | Reviewing in GitHub's pull request UI | New | When reviewers are not technical | Track reviewer feedback. A dedicated moderation UI is a later item. |
| D6 | Editing raw markdown in the browser | New | Contributors break formatting | Start with a plain editor and preview. A visual editor is a later, larger task. |
| D7 | Dual source of truth once D1 exists | Deferred (0004) | Missed webhook | Reconcile job, and D1 never holds content. |
| D8 | No terms, licence, privacy note or takedown process | Existing | First public edit | Write them before phase 1 goes public. Roadmap already lists privacy policy and an About page. |
| D9 | Free-plan limits assumed, not measured | New | Traffic growth or an attack | Measure CPU time early. Budget for the $5 paid plan. |
| D10 | Pre-launch state (`noindex`, `robots.txt`) must be removed at launch, and open editing raises the stakes at that moment | Existing | Launch day | Add the launch checklist item: abuse controls tested before removing `noindex`. |
| D11 | The `README.md` "Decided against" entry on real-time anonymous editing | Existing | Confusion | Updated to point at these docs. The earlier reasoning still holds for instant editing. |

## What would change the verdict

- **To no-go:** no one is willing to review on a regular schedule, or the licence and takedown obligations cannot be met.
- **Towards a bigger build:** strong early demand plus a reviewer team. Then phase 2 and 3 become worth their complexity.
- **Towards a server-based wiki:** the requirement is confirmed to be instant, unreviewed editing, and there is budget for hosting and moderation.

## Recommended next steps

1. Decide reviewers, review turnaround and the licence, and write the short terms and takedown page (D8).
2. Make the decision on whether phase 1 is built before launch or held until launch content exists.
3. Build phase 1 in `worker/`, starting with pull request creation and the commit format, and use a bare test form to check the squash-merge and Sveltia questions on real pull requests.
4. Amend `CLAUDE.md` for D2 when the Worker folder is added.

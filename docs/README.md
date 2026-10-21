# Project docs

Infrastructure and architecture decisions for visitdhaka.org. Content and CMS usage live in the root `README.md` and `CLAUDE.md`. This folder tracks why the infrastructure is the way it is, so later changes start from a recorded decision.

## Layout

| Path | What it holds |
| :--- | :--- |
| `architecture/` | How the system fits together, one file per subsystem |
| `decisions/` | One short record per decision: context, choice, consequences (ADR style) |
| `reviews/` | Point-in-time assessments: feasibility, risk, technical debt, verdicts |

## Decision log

| # | Decision | Status |
| :--- | :--- | :--- |
| [0001](decisions/0001-suggest-edit-link.md) | "Edit page" link to GitHub | Accepted, implemented |
| [0002](decisions/0002-open-editing-via-worker-and-pull-requests.md) | Public editing through a Worker that opens pull requests | Accepted for phase 1 |
| [0003](decisions/0003-contributor-credit-model.md) | How contributors are credited | Proposed |
| [0004](decisions/0004-d1-for-contribution-records.md) | Cloudflare D1 for contribution records | Proposed, deferred to phase 2 |
| [0005](decisions/0005-google-analytics-with-consent.md) | Google Analytics 4 through Tag Manager, loaded only after consent | Accepted, implemented |
| [0006](decisions/0006-anonymous-editing-first-sign-in-later.md) | Anonymous editing first, optional Google sign-in later | Accepted. Sign-in built (epic #54) |
| [0007](decisions/0007-launch-public-editing.md) | Launch public editing | Proposed, waiting for the end-to-end test (#18) |
| [0008](decisions/0008-launch-google-sign-in.md) | Launch optional Google sign-in | Proposed, waiting for the setup (#55) and the end-to-end test (#61) |

## Documents

- [Open editing architecture](architecture/open-editing.md)
- [Moderation runbook](architecture/moderation.md): who reviews public edits, what to check, reverting, reports and takedown, and how to turn editing off
- [Open editing feasibility review](reviews/open-editing-feasibility.md): feasibility, risks, technical debt and the go/no-go verdict
- [Wiki epic readiness, 21 October 2026](reviews/wiki-epic-readiness-2026-10-21.md): branch ownership, completed work and the remaining checks for issue #1
- [Public editing end-to-end test](reviews/public-editing-test-2026-10-21.md): the real-edit test for #18, with the checks already done and the tables to fill in
- [Google sign-in end-to-end test](reviews/sign-in-test-2026-10-21.md): the local run and the production test plan for #61

## Conventions

- Status values: `Proposed`, `Accepted`, `Superseded by NNNN`, `Rejected`.
- A decision is never edited to change its outcome. Write a new record that supersedes it.
- Numbers such as platform limits carry the date they were checked. Recheck them before relying on them.

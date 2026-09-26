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
| [0002](decisions/0002-open-editing-via-worker-and-pull-requests.md) | Public editing through a Worker that opens pull requests | Proposed |
| [0003](decisions/0003-contributor-credit-model.md) | How contributors are credited | Proposed |
| [0004](decisions/0004-d1-for-contribution-records.md) | Cloudflare D1 for contribution records | Proposed, deferred to phase 2 |

## Documents

- [Open editing architecture](architecture/open-editing.md)
- [Open editing feasibility review](reviews/open-editing-feasibility.md): feasibility, risks, technical debt and the go/no-go verdict

## Conventions

- Status values: `Proposed`, `Accepted`, `Superseded by NNNN`, `Rejected`.
- A decision is never edited to change its outcome. Write a new record that supersedes it.
- Numbers such as platform limits carry the date they were checked. Recheck them before relying on them.

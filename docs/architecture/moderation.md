# Moderation runbook

Status: agreed 2026-10-21 (#9). It applies from the day the in-page editor is turned on in production (#16, #18).
Review it after the end-to-end test (#18), and again after the first month of real edits.

Public edits arrive as pull requests opened by the edit bot (decision 0002), labelled `public-edit`, plus `links-added`
when the edit adds an external link. Nothing reaches the site until a reviewer merges it.

## Who reviews

- [@imtiazkun](https://github.com/imtiazkun)
- [@Alfa5nm](https://github.com/Alfa5nm)
- [@asifikbalmir](https://github.com/asifikbalmir)


- `.github/CODEOWNERS` lists all three for `src/content/docs/`, so GitHub asks them to review every pull request that
  changes a page. Whoever gets to it first takes it, by assigning themselves.
- One approving review is enough to merge. #14 sets that up as branch protection on `main`.
- A Bangla edit needs a reviewer who reads Bangla well enough to check it. Don't merge a language you can't read.
- To add or remove a reviewer, update this list and `.github/CODEOWNERS` in the same pull request.

## Turnaround

- **First response within 48 hours** of the pull request opening: merge it, close it with a reason, or fix it up.
- A pull request that has gone 48 hours without a response is anyone's. Pick it up rather than waiting for its
  assignee.
- Contributors usually have no GitHub account, so **they can't reply to review comments**. Don't ask them questions and
  wait. Instead:
  - fix small problems yourself, by pushing a commit to the pull request's `edit/<page>` branch, then merge;
  - close anything that can't be fixed quickly, with a short, polite reason. The reason is public.
- Close any public edit that is still open after 14 days, saying why.

## What to check

Work through the diff, not just the summary.

- **Facts.** Check new or changed facts against an official or first-hand source. Opening hours, fees, prices, visa
  rules, health and safety advice need a source you have checked yourself. If you can't confirm one, take that part out
  before merging. Never merge an invented or unsourced figure (see "Fact-checking" in `CLAUDE.md`).
- **`verified`.** The bot always sets `verified: false` on an edited page. Leave it false. Set it to true only in a
  separate pull request, after checking every fact on the page.
- **Links.** For `links-added`, open every new link. Remove promotional, affiliate, tracking and unrelated links. A link
  to an official source is welcome.
- **Spam and promotion.** Reject advertising, self-promotion and anything that reads like marketing copy.
- **Copied text.** Search a distinctive sentence or two. Reject text copied from elsewhere: content is CC BY-SA 4.0 and
  we can't relicense other people's work.
- **Personal data.** Remove names, phone numbers or other details of private individuals. Businesses' public contact
  details are fine where they help visitors.
- **The contributor name.** It's unverified (decision 0003). Remove offensive names, names that impersonate a real
  person or organisation, and anything that isn't a name, then merge with "Anonymous".
- **Signed-in edits.** The pull request says `<name> (account <id>)` rather than `(unverified)`. The name is the
  account's chosen display name, not a checked real name. Treat it like any other name, and check the edit just as
  carefully: signing in is optional and proves only that the same account made each edit.
- **Tone and format.** Plain, neutral, helpful English or Bangla that matches the page. Small style fixes are worth
  doing yourself rather than rejecting.

## Merging

- Use **"Create a merge commit"** or **"Rebase and merge"**. **Never squash** until the end-to-end test (#18) has shown
  whether a squash merge keeps the contributor as commit author (decision 0003). The repo setting disables squash
  until then (#14).
- The site deploys from `main` automatically after the merge.

## Reverting a bad edit

- **Fastest:** the **Revert** button on the merged pull request. It opens a pull request that undoes the merge. Merge
  that straight away.
- **From the command line:** `git revert -m 1 <merge commit>` on a branch, then open a pull request.
- Any reviewer can revert. Say why in the revert pull request.

## Reports and takedown requests

The site lists two monitored addresses:

- **team@tingeworks.com:** content reports, such as spam, false or dangerous information, or copyright problems.
- **privacy@tingeworks.com:** personal data, such as removing a contributor's name or information about a person.

How to handle them:

- Acknowledge every report within 48 hours.
- **Remove harmful content from the live site within 24 hours** of a valid report: revert it, or edit it out, and merge
  without waiting for the usual review. This covers personal data, defamation, dangerous safety or health advice and
  clear copyright infringement.
- To remove a contributor's name, open a pull request that takes it out of the page's `contributors` list.
- Removing something from the **git history** is a separate, rare step, for legal or serious personal-data cases only.
  A repo admin rewrites the history and asks GitHub Support to purge cached views. Commit history and pull requests stay
  visible on GitHub until then, so say so when replying to the person who reported it.

## Banning a signed-in account

Signed-in edits (decision 0006) can be stopped per account, without blocking an IP. A banned account gets a "This
account can't make edits" message, and its past edits stay where they are.

- **Find the account.** A signed-in edit's pull request says `Contributor | <name> (account <id>)`, its commits end
  with `Edited-by: <name> (account <id>)`, and the commit author is `user-<id>@visitdhaka.org`. Search them with
  `git log --author='user-<id>@visitdhaka.org'` or `git log --grep='(account <id>)'`.
- **Look it up,** from `worker/`:
  `npx wrangler d1 execute visitdhaka-edit --remote --command "SELECT id, display_name, created_at, banned_at, ban_reason FROM users WHERE id = <id>"`.
  Never select `google_sub`: it isn't needed for moderation.
- **Ban it,** with a short reason that names no one, such as the pull request number:
  `npx wrangler d1 execute visitdhaka-edit --remote --command "UPDATE users SET banned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ban_reason = 'Spam, #123' WHERE id = <id>"`.
  It applies to the account's next request. Close its open pull requests as for any spam.
- **Unban it:**
  `npx wrangler d1 execute visitdhaka-edit --remote --command "UPDATE users SET banned_at = NULL, ban_reason = NULL WHERE id = <id>"`.
- **An abusive display name:** rename it, for example to "Editor <id>":
  `npx wrangler d1 execute visitdhaka-edit --remote --command "UPDATE users SET display_name = 'Editor <id>' WHERE id = <id>"`.
  Remove the old name from pages' `contributors` lists as for any name.
- Note each ban in the incident log below, with the account ID and the reason, never the person's details.

To stop all sign-in at once, set the edit Worker's `SIGN_IN_ENABLED` variable to anything but `true`. Sessions are then
ignored and every edit is anonymous. Anonymous editing keeps working.

## Turning public editing off

Use the lightest switch that stops the problem.

1. **Spam wave:** set the edit Worker's `DAILY_EDIT_CAP` variable to `0` (#10). New edits get a "try again later"
	message, and nothing else changes. Save and deploy the dashboard variable change to apply it immediately. The cap is
	managed only in the dashboard, outside `worker/wrangler.jsonc`, so subsequent deploys preserve it (`keep_vars: true`,
	#35). A missing or invalid cap also closes editing. `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BASE_BRANCH` and
	`ALLOWED_ORIGIN` still come from the configuration file; the App ID and installation ID live in the dashboard.
	Close the spam pull requests. One way is
   `gh pr list --label public-edit --state open --json number --jq '.[].number'`, then `gh pr close <number>` for each
   one you've checked.
2. **The Worker misbehaves:** remove the `visitdhaka.org/api/*` route in Cloudflare (#14). The editor stops working,
   and the static site is unaffected.
3. **The bot's credentials may be compromised:** suspend the GitHub App's installation on the repo, generate a new
   private key, update the `GITHUB_APP_PRIVATE_KEY` secret, and delete the old key in the app settings (#10).

Undo each step in reverse order once the problem is over, and note what happened at the end of this file.

## Incident log

None yet.

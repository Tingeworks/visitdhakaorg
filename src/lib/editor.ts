// Settings for the in-site editor (/edit/), from public build variables. They're public by design: the `PUBLIC_`
// prefix puts them in the browser. Set them in the Cloudflare site project's build variables, or in `.env` locally.
//
// - PUBLIC_EDITOR_ENABLED: `true` to switch "Edit page" from GitHub to the in-site editor. Leave it off until the edit
//   Worker is deployed (#13, #14) and the privacy policy, terms and licence cover public editing (#17).
// - PUBLIC_EDIT_API_URL: where the edit Worker is. Empty in production, where it's served on the site's own origin at
//   /api/* (#14). Locally, the `wrangler dev` address, such as http://localhost:8787.
// - PUBLIC_TURNSTILE_SITE_KEY: the Turnstile widget's site key (#10). Development uses Cloudflare's always-pass test key.

export const editorEnabled = import.meta.env.PUBLIC_EDITOR_ENABLED === 'true';

export const editApiUrl = (import.meta.env.PUBLIC_EDIT_API_URL ?? '').replace(/\/$/, '');

const testSiteKey = '1x00000000000000000000AA';
export const turnstileSiteKey: string | undefined =
	import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? testSiteKey : undefined);

/**
 * Whether a page's source file can be edited in the site's editor: a Markdown page inside a pillar folder, in English
 * or Bangla. This mirrors the edit Worker's path rules (worker/src/validate.ts), which are the authority: the homepages
 * (MDX) and the about and legal pages at the top of src/content/docs/ aren't editable there.
 */
export const isEditablePath = (filePath: string | undefined) =>
	Boolean(filePath && /^src\/content\/docs\/(?:bn\/)?[a-z0-9-]+\/[a-z0-9-]+\.md$/.test(filePath));

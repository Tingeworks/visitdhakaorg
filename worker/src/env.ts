// The Worker's configuration. These names are the contract set out in #10. Secrets come from `wrangler secret put` or
// the dashboard, and plain values from `vars` in wrangler.jsonc or the dashboard. Locally, everything comes from
// worker/.dev.vars (see .dev.vars.example).
export interface Env {
	/** Secret: the GitHub App's private key, PKCS#8 PEM ("BEGIN PRIVATE KEY"). */
	GITHUB_APP_PRIVATE_KEY?: string;
	/** Secret: Cloudflare Turnstile secret key (used by POST /api/edit, #15). */
	TURNSTILE_SECRET_KEY?: string;
	GITHUB_APP_ID?: string;
	GITHUB_INSTALLATION_ID?: string;
	GITHUB_OWNER: string;
	GITHUB_REPO: string;
	GITHUB_BASE_BRANCH: string;
	/** Pull requests per day, site-wide (#15). 0 turns public editing off. */
	DAILY_EDIT_CAP: string;
	/** Origins allowed to call the API from a browser, comma-separated. */
	ALLOWED_ORIGIN: string;
	/**
	 * `development` in worker/.dev.vars only. Without GitHub App credentials, it lets GET /api/source read the public
	 * repo without signing in, so the Worker can be tried before the app exists. Never set in production.
	 */
	ENVIRONMENT?: string;
}

export const isDevelopment = (env: Env) => env.ENVIRONMENT === 'development';

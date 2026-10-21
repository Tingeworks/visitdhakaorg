// The Worker's configuration. These names are the contract set out in #10. Secrets come from `wrangler secret put` or
// the dashboard, and plain values from `vars` in wrangler.jsonc or the dashboard. Locally, everything comes from
// worker/.dev.vars (see .dev.vars.example).
export interface Env {
	/** Secret: the GitHub App's private key, PKCS#8 PEM ("BEGIN PRIVATE KEY"). */
	GITHUB_APP_PRIVATE_KEY?: string;
	/** Secret: Cloudflare Turnstile secret key (used by POST /api/edit, #15). */
	TURNSTILE_SECRET_KEY?: string;
	/** Secret: the Google OAuth client's secret, for sign-in (#55). */
	GOOGLE_CLIENT_SECRET?: string;
	/** Secret: at least 32 random bytes, which sign the session and sign-in cookies (#55). */
	SESSION_SECRET?: string;
	GITHUB_APP_ID?: string;
	GITHUB_INSTALLATION_ID?: string;
	GITHUB_OWNER: string;
	GITHUB_REPO: string;
	GITHUB_BASE_BRANCH: string;
	/** Pull requests per day, site-wide (#15). 0 turns public editing off. */
	DAILY_EDIT_CAP?: string;
	/** The Google OAuth client ID (#55). Not secret, but kept with the client secret. */
	GOOGLE_CLIENT_ID?: string;
	/** `true` to allow Google sign-in. Dashboard-managed like DAILY_EDIT_CAP, so it can be switched off without a deploy. */
	SIGN_IN_ENABLED?: string;
	/** The accounts database (D1, decision 0006). Optional so the Worker still runs, signed out, without it. */
	DB?: D1Database;
	/** Origins allowed to call the API from a browser, comma-separated. */
	ALLOWED_ORIGIN: string;
	/**
	 * `development` in worker/.dev.vars only. Without GitHub App credentials, it lets GET /api/source read the public
	 * repo without signing in, so the Worker can be tried before the app exists. Never set in production.
	 */
	ENVIRONMENT?: string;
	/**
	 * Development only: where to send GitHub API calls instead of api.github.com, such as the fake GitHub server
	 * (`pnpm fake-github`) for a local end-to-end run (#18). Ignored unless `ENVIRONMENT` is `development`.
	 */
	GITHUB_API_URL?: string;
	/**
	 * Development only: the Worker's own address, such as http://localhost:8787, for Google's redirect back after sign-in.
	 * `wrangler dev` rewrites request URLs to the route's host (visitdhaka.org), so it can't be read from the request.
	 * Ignored unless `ENVIRONMENT` is `development`.
	 */
	WORKER_URL?: string;
}

export const isDevelopment = (env: Env) => env.ENVIRONMENT === 'development';

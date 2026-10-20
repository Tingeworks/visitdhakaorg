// Where an editable page lives: its edit branch, its URL on the site and its /api/source cache entry. Paths are ones
// validatePath() has already accepted (src/content/docs/[bn/]<pillar>/<page>.md).

/** The page's path inside the docs folder, such as `bn/attractions/lalbagh-fort`. */
const pageKey = (path: string) => path.replace(/^src\/content\/docs\//, '').replace(/\.md$/, '');

/** One branch per page, so a second edit to the same page joins the open pull request (decision 0002). */
export const branchFor = (path: string) => `edit/${pageKey(path)}`;

/** The page's address on the site: `/bn/attractions/lalbagh-fort/`, or `/where-to-stay/` for an overview. */
export const pageUrl = (path: string) => `/${pageKey(path).replace(/(^|\/)index$/, '')}/`.replace(/\/+/g, '/');

/** The /api/source cache entry for a page, the same whatever host or extra parameters a request used. */
export const sourceCacheKey = (path: string) =>
	new Request(`https://edit-worker.cache/api/source?path=${encodeURIComponent(path)}`);

/** Midnight at the start of today in Dhaka, as an ISO 8601 time GitHub search understands. */
export function dhakaDayStart(now = new Date()) {
	const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
	return `${day}T00:00:00+06:00`;
}

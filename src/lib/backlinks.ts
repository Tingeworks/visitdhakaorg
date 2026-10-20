import { localizedPages, unlocalizePath, type LocalizedPage } from './i18n';

// "Pages that link here": for each page, the pages whose body links to it. Built from the source of every page, once per
// language per build, and shared by every page that asks.

// Markdown links ([text](/areas/gulshan/)) and HTML or MDX links (href="/areas/gulshan/").
const linkPattern = /\]\(\s*<?([^)\s>]+)|href=["']([^"']+)["']/g;

/**
 * The English slug a link points at (`areas/gulshan`), or undefined for links off the site. Relative links resolve
 * against `from`, the linking page's URL, and links into /bn/ count as links to the same page.
 */
function targetOf(link: string, from: string) {
	if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('//') || link.startsWith('#')) return;
	const { pathname } = new URL(link, `https://visitdhaka.org${from}`);
	return unlocalizePath(decodeURI(pathname)).replace(/^\/|\/$/g, '');
}

async function buildIndex(locale: string | undefined) {
	const index = new Map<string, LocalizedPage[]>();
	for (const page of await localizedPages(locale)) {
		const targets = new Set<string>();
		for (const [, markdown, html] of page.body?.matchAll(linkPattern) ?? []) {
			const target = targetOf(markdown ?? html, page.href);
			if (target !== undefined && target !== page.slug) targets.add(target);
		}
		for (const target of targets) index.set(target, [...(index.get(target) ?? []), page]);
	}
	for (const pages of index.values()) pages.sort((a, b) => a.data.title.localeCompare(b.data.title));
	return index;
}

const indexes = new Map<string | undefined, ReturnType<typeof buildIndex>>();

/** The pages in `locale` that link to the page with English slug `slug`, sorted by title. */
export async function backlinksTo(slug: string, locale: string | undefined) {
	if (!indexes.has(locale)) indexes.set(locale, buildIndex(locale));
	return (await indexes.get(locale)!).get(slug) ?? [];
}

import { localizedPages, localizePath, type LocalizedPage } from './i18n';

// Tag pages: /tags/ lists every tag, and /tags/<tag>/ the pages with that tag, in each language (and /bn/tags/...).

/** URL segment for a tag: `street food` → `street-food`. Tags that differ only in case or spacing share a page. */
export const tagSlug = (tag: string) => tag.trim().toLowerCase().replace(/\s+/g, '-');

export const tagHref = (tag: string, locale: string | undefined) => localizePath(`/tags/${tagSlug(tag)}/`, locale);

export type Tag = { slug: string; label: string; pages: LocalizedPage[] };

/** Every tag used by the pages in `locale`, sorted by name, with its pages sorted by title. */
export async function tagsFor(locale: string | undefined, lang: string) {
	const tags = new Map<string, Tag>();
	for (const page of await localizedPages(locale)) {
		for (const label of page.data.tags) {
			const slug = tagSlug(label);
			if (!slug) continue;
			const tag = tags.get(slug) ?? tags.set(slug, { slug, label, pages: [] }).get(slug)!;
			if (!tag.pages.includes(page)) tag.pages.push(page);
		}
	}
	const byName = (a: string, b: string) => a.localeCompare(b, lang);
	for (const tag of tags.values()) tag.pages.sort((a, b) => byName(a.data.title, b.data.title));
	return [...tags.values()].sort((a, b) => byName(a.label, b.label));
}

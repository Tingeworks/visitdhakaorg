import { getCollection, type CollectionEntry } from 'astro:content';

// English is Starlight's root locale, so English pages have no prefix (/food/) and translations live in a folder
// named after their locale (src/content/docs/bn/food/ → /bn/food/). Keep in sync with `locales` in astro.config.mjs.
export const translatedLocales = ['bn'];

/**
 * The locale of a page from its URL: `bn` for /bn/food/, undefined for English. Read from the URL rather than
 * `Astro.locals.starlightRoute`, which isn't set yet when a StarlightPage's slot content renders.
 */
export function localeOf(url: URL) {
	const first = url.pathname.split('/')[1];
	return translatedLocales.includes(first) ? first : undefined;
}

/** Adds the locale prefix to a site path: `/food/` → `/bn/food/`. `locale` is undefined for English. */
export const localizePath = (path: string, locale: string | undefined) => (locale ? `/${locale}${path}` : path);

/** Removes the locale prefix from a site path: `/bn/food/` → `/food/`. */
export function unlocalizePath(path: string) {
	const [, first, ...rest] = path.split('/');
	return translatedLocales.includes(first) ? `/${rest.join('/')}` : path;
}

const slugOf = (id: string) => id.replace(/\.(md|mdx)$/, '').replace(/\/?index$/, '');

export type LocalizedPage = { slug: string; href: string; data: CollectionEntry<'docs'>['data'] };

/**
 * Every docs page for `locale`, keyed by its English slug (`food/fuchka`). Uses the translation where there is one and
 * the English page otherwise, the same fallback Starlight uses, so lists built from this match the pages they link to.
 */
export async function localizedPages(locale: string | undefined): Promise<LocalizedPage[]> {
	const pages = new Map<string, CollectionEntry<'docs'>>();
	for (const entry of await getCollection('docs')) {
		const [first, ...rest] = slugOf(entry.id).split('/');
		if (!translatedLocales.includes(first)) {
			// Don't replace a translation that was read first.
			if (!pages.has(slugOf(entry.id))) pages.set(slugOf(entry.id), entry);
		} else if (first === locale) {
			pages.set(rest.join('/'), entry);
		}
	}
	return [...pages].map(([slug, entry]) => ({
		slug,
		href: localizePath(slug ? `/${slug}/` : '/', locale),
		data: entry.data,
	}));
}

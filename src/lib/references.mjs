import { fileURLToPath } from 'node:url';

// A Sätteri hast plugin that builds a page's References section, Wikipedia style: the Markdown footnotes ([^1]) as a
// numbered list with back-links, followed by the page's `sources` frontmatter. It reads the page's language from its
// file path (src/content/docs/bn/... is Bangla) and its headings from src/content/i18n/<lang>.json. Sources are
// editor-curated, so their links are plain (no nofollow). Pages with neither get no section.

/**
 * @param {{ locales: Record<string, { lang: string; strings: Record<string, string> }> }} options
 *   Keyed by content folder (`bn`), with `root` for English pages at the top of src/content/docs.
 */
export default function references({ locales }) {
	return ({ fileURL, data }) => {
		const path = fileURL && fileURLToPath(fileURL).replaceAll('\\', '/');
		if (!path?.includes('/src/content/docs/')) return;
		const folder = path.match(/\/src\/content\/docs\/([^/]+)\//)?.[1];
		const { lang, strings } = locales[folder] ?? locales.root;
		const t = (key, values = {}) => strings[key].replace(/\{\{(\w+)\}\}/g, (_, name) => values[name]);
		const sources = data.astro?.frontmatter?.sources ?? [];
		let hasFootnotes = false;

		const heading = el('h2', { id: 'references' }, [text(t('references.title'))]);
		const sourceList = () => {
			const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' });
			return el(
				'ul',
				{ className: ['sources'] },
				sources.map(({ title, url, accessed }) =>
					el('li', {}, [
						el('a', { href: url }, [text(title)]),
						...(accessed
							? [text(' '), el('span', { className: ['accessed'] }, [text(t('references.accessed', { date: date.format(new Date(accessed)) }))])]
							: []),
					]),
				),
			);
		};

		return {
			name: 'visitdhaka-references',
			element: {
				filter: ['section', 'h2', 'a'],
				visit(node, ctx) {
					const { properties = {} } = node;
					// The footnotes section: shown as References, with the sources after the footnotes.
					if (node.tagName === 'section' && properties.dataFootnotes !== undefined) {
						hasFootnotes = true;
						ctx.setProperty(node, 'className', ['references']);
						ctx.setProperty(node, 'ariaLabelledBy', ['references']);
						if (sources.length > 0) {
							ctx.appendChild(node, [el('h3', { id: 'sources' }, [text(t('references.sources'))]), sourceList()]);
						}
					}
					// Its visually hidden "Footnotes" heading, which each footnote reference points at.
					if (node.tagName === 'h2' && properties.id === 'footnote-label') ctx.replaceNode(node, heading);
					if (properties.dataFootnoteRef !== undefined) ctx.setProperty(node, 'ariaDescribedBy', ['references']);
					// Back-links are labelled in English ("Back to reference 1"), so translate them.
					if (properties.dataFootnoteBackref !== undefined && typeof properties.ariaLabel === 'string') {
						const n = properties.ariaLabel.replace(/^Back to reference /, '');
						ctx.setProperty(node, 'ariaLabel', t('references.backLabel', { n }));
					}
				},
			},
			after(root, ctx) {
				if (hasFootnotes || sources.length === 0) return;
				ctx.appendChild(root, el('section', { className: ['references'], ariaLabelledBy: ['references'] }, [heading, sourceList()]));
			},
		};
	};
}

const el = (tagName, properties, children) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });

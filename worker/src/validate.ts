// Validation for public edits: which files may be edited, what an edited body may contain, and clean-up of the
// contributor's name and edit summary. Pure functions with no network calls, so every rule is unit-tested
// (worker/test/). The rules follow docs/architecture/open-editing.md ("Validation and abuse controls").
// The caller checks that the file exists (GET /api/source, POST /api/edit) and reports a missing file as 404.

/** The pillar folders in src/content/docs/. Keep in step with the sidebar in astro.config.mjs. */
export const PILLARS = [
	'overview',
	'areas',
	'attractions',
	'food',
	'getting-around',
	'where-to-stay',
	'culture',
	'practical-info',
	'shopping',
	'day-trips',
] as const;

/** Languages with translations in src/content/docs/<locale>/. Keep in step with src/lib/i18n.ts. */
export const TRANSLATED_LOCALES = ['bn'] as const;

export const MAX_BODY_BYTES = 50_000;
export const MAX_DIFF_BYTES = 20_000;
export const MAX_NAME_LENGTH = 40;
export const MAX_SUMMARY_LENGTH = 200;
export const ANONYMOUS = 'Anonymous';

/** Hosts that count as this site, so links to them aren't flagged as external. */
const SITE_HOSTS = ['visitdhaka.org', 'www.visitdhaka.org'];

export type Field = 'path' | 'body' | 'name' | 'summary' | 'licence' | 'baseSha' | 'turnstile';
export type ValidationError = { field: Field; code: string };
export type Result<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] };

const fail = (field: Field, code: string): { ok: false; errors: ValidationError[] } => ({
	ok: false,
	errors: [{ field, code }],
});

// ---------- Paths ----------

const segment = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Accepts only Markdown pages inside a pillar folder, in English or a translation:
 * `src/content/docs/<pillar>/<page>.md` or `src/content/docs/<locale>/<pillar>/<page>.md`. That leaves out MDX pages
 * (the homepages), the about and legal pages at the top of the folder, and anything outside it.
 */
export function validatePath(path: unknown): Result<string> {
	if (typeof path !== 'string' || path.length > 200) return fail('path', 'path_invalid');
	if (path.endsWith('.mdx')) return fail('path', 'path_not_markdown');
	if (!path.startsWith('src/content/docs/') || !path.endsWith('.md')) return fail('path', 'path_invalid');
	const parts = path.slice('src/content/docs/'.length, -'.md'.length).split('/');
	const [first] = parts;
	const rest = (TRANSLATED_LOCALES as readonly string[]).includes(first) ? parts.slice(1) : parts;
	if (!rest.every((part) => segment.test(part))) return fail('path', 'path_invalid');
	if (rest.length !== 2 || !(PILLARS as readonly string[]).includes(rest[0])) return fail('path', 'path_not_editable');
	return { ok: true, value: path };
}

// ---------- Bodies ----------

export type BodyFlags = {
	/** External links in the new body that weren't in the base, for the `links-added` label. */
	linksAdded: string[];
	/** Approximate size of the change against the base, in UTF-8 bytes. */
	diffBytes: number;
};

const bytes = (text: string) => new TextEncoder().encode(text).length;

// Control characters other than tab and newline, and the bidirectional overrides that can make text display
// differently from how it reads ("Trojan Source"). Zero-width joiners stay: Bangla needs them.
const controlCharacters = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const controlCharactersGlobal = new RegExp(controlCharacters.source, 'g');

/** The body with fenced code blocks and inline code removed, since anything inside them is shown as text. */
function withoutCode(markdown: string) {
	const lines = markdown.split('\n');
	const kept: string[] = [];
	let fence: string | undefined;
	for (const line of lines) {
		const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
		if (fence) {
			if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = undefined;
			continue;
		}
		if (marker && (marker[0] !== '`' || !line.slice(line.indexOf(marker) + marker.length).includes('`'))) {
			fence = marker;
			continue;
		}
		kept.push(line);
	}
	// Code spans need matching whole runs and cannot cross a paragraph boundary.
	return kept.join('\n').split(/\n[ \t]*\n/).map((paragraph) => {
		const runs = [...paragraph.matchAll(/`+/g)];
		let result = '';
		let start = 0;
		for (let i = 0; i < runs.length; i++) {
			const close = runs.findIndex((run, j) => j > i && run[0].length === runs[i][0].length);
			if (close < 0) continue;
			result += paragraph.slice(start, runs[i].index);
			start = runs[close].index + runs[close][0].length;
			i = close;
		}
		return result + paragraph.slice(start);
	}).join('\n\n');
}

/** True for `<` at `index` that starts an autolink, such as `<https://example.org>` or `<name@example.org>`. */
function isAutolink(text: string, index: number) {
	const rest = text.slice(index);
	return /^<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>/.test(rest) || /^<[^\s<>@]+@[^\s<>@]+>/.test(rest);
}

function hasHtml(text: string) {
	for (const match of text.matchAll(/<[A-Za-z!/?]/g)) {
		const backslashes = text.slice(0, match.index).match(/\\*$/)![0].length;
		if (backslashes % 2 === 0 && !isAutolink(text, match.index)) return true;
	}
	return false;
}

/** Every link and image destination in the Markdown: inline, reference definitions, autolinks and bare URLs. */
function destinations(text: string) {
	const found: { url: string; image: boolean }[] = [];
	for (const [, bang, url] of text.matchAll(/(!?)\[[^\]]*\]\(\s*<?([^)\s>]+)/g)) found.push({ url, image: bang === '!' });
	const definitions = new Map<string, string>();
	for (const [, label, url] of text.matchAll(/^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)/gm)) {
		definitions.set(label.toLowerCase(), url);
		found.push({ url, image: false });
	}
	// Reference images: ![alt][label], or ![label][] and ![label] with the alt text as the label.
	for (const [, alt, label] of text.matchAll(/!\[([^\]]*)\](?:\[([^\]]*)\])?/g)) {
		const url = definitions.get((label || alt).toLowerCase());
		if (url) found.push({ url, image: true });
	}
	for (const [, url] of text.matchAll(/<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/g)) found.push({ url, image: false });
	for (const [url] of text.matchAll(/\bhttps?:\/\/[^\s<>()[\]]+/gi)) found.push({ url, image: false });
	return found.map(({ url, image }) => ({ url: decodeUrl(url), image }));
}

// CommonMark decodes character references and backslash-escaped punctuation in destinations.
const decodeUrl = (url: string) => url
	.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1')
	.replace(/&#(x[0-9a-f]+|[0-9]+);|&(colon|Tab|NewLine);/gi, (_, numeric, named) => {
		if (named) return ({ colon: ':', tab: '\t', newline: '\n' } as Record<string, string>)[named.toLowerCase()];
		const point = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : Number(numeric);
		return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\uFFFD';
	});

/** The scheme of a URL as a browser would read it, ignoring case, whitespace, control characters and entities. */
const schemeOf = (url: string) =>
	url
		.replace(/[\s\u0000-\u001f]/g, '')
		.toLowerCase()
		.match(/^([a-z][a-z0-9+.-]*):/)?.[1];

const isExternal = (url: string) => {
	if (!/^(https?:)?\/\//i.test(url)) return false;
	try {
		return !SITE_HOSTS.includes(new URL(url, 'https://visitdhaka.org').hostname.toLowerCase());
	} catch {
		return true;
	}
};

const externalLinks = (text: string) =>
	new Set(
		destinations(text)
			.map(({ url }) => url.replace(/[.,;:!?'"]+$/, ''))
			.filter(isExternal),
	);

/** Approximate size of a change: the bytes between the longest common start and end of the two texts. */
function diffSize(base: string, body: string) {
	let start = 0;
	while (start < base.length && start < body.length && base[start] === body[start]) start++;
	let end = 0;
	while (
		end < base.length - start &&
		end < body.length - start &&
		base[base.length - 1 - end] === body[body.length - 1 - end]
	)
		end++;
	return Math.max(bytes(base.slice(start, base.length - end)), bytes(body.slice(start, body.length - end)));
}

/**
 * Checks an edited page body against the body it was based on. Raw HTML, MDX syntax, script-capable links and
 * external images are rejected rather than sanitised (v1). External links are allowed, but the ones added are
 * returned as a flag for the reviewer. Returns the body with line endings normalised to `\n`.
 */
export function validateBody(body: unknown, base: string): Result<{ body: string; flags: BodyFlags }> {
	if (typeof body !== 'string') return fail('body', 'body_invalid');
	const text = body.replace(/\r\n?/g, '\n');
	if (bytes(text) > MAX_BODY_BYTES) return fail('body', 'body_too_large');
	if (controlCharacters.test(text)) return fail('body', 'body_has_control_characters');
	if (/^\s*---\s*\n/.test(text)) return fail('body', 'body_has_frontmatter');

	const prose = withoutCode(text);
	if (hasHtml(prose)) return fail('body', 'body_has_html');
	if (/^\s*(?:import|export)\s/m.test(prose) || /[{}]/.test(prose)) return fail('body', 'body_has_mdx');

	const links = destinations(prose);
	if (links.some(({ url }) => ['javascript', 'vbscript', 'data', 'file'].includes(schemeOf(url) ?? ''))) {
		return fail('body', 'body_has_unsafe_link');
	}
	// An image from another site would load a third party on every page view, which the privacy policy rules out.
	// Images must come from the site, such as /uploads/... (image uploads come later).
	if (links.some(({ url, image }) => image && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url))) {
		return fail('body', 'body_has_external_image');
	}

	const diffBytes = diffSize(base.replace(/\r\n?/g, '\n'), text);
	if (diffBytes > MAX_DIFF_BYTES) return fail('body', 'diff_too_large');

	const before = externalLinks(withoutCode(base));
	const linksAdded = [...externalLinks(prose)].filter((url) => !before.has(url)).sort();
	return { ok: true, value: { body: text, flags: { linksAdded, diffBytes } } };
}

// ---------- Names and summaries ----------

/**
 * True when `text` is at most `max` characters as people see them. A string never has more of those than code points,
 * so the segmenter runs only for text over `max` code points: creating the first one costs a fresh Worker instance
 * about as much CPU as the rest of an edit (#18).
 */
const fitsLength = (text: string, max: number) =>
	[...text].length <= max || [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length <= max;

/**
 * Plain text for a name or summary: tags, control characters and Markdown punctuation removed, and whitespace
 * collapsed, so it can't format, link or hide anything in a commit message, pull request or page.
 */
function plainText(raw: string) {
	return raw
		.normalize('NFC')
		.replace(/<[^>]*>/g, '')
		.replace(controlCharactersGlobal, '')
		.replace(/[<>[\]{}`*_~|\\]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** The contributor's display name, or "Anonymous" when none is given. Names are unverified (decision 0003). */
export function cleanName(raw: unknown): Result<string> {
	if (raw !== undefined && raw !== null && typeof raw !== 'string') return fail('name', 'name_invalid');
	const name = plainText(raw ?? '');
	if (!name) return { ok: true, value: ANONYMOUS };
	if (/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i.test(name)) return fail('name', 'name_has_link');
	if (!fitsLength(name, MAX_NAME_LENGTH)) return fail('name', 'name_too_long');
	return { ok: true, value: name };
}

/** The edit summary for the pull request, or an empty string. */
export function cleanSummary(raw: unknown): Result<string> {
	if (raw !== undefined && raw !== null && typeof raw !== 'string') return fail('summary', 'summary_invalid');
	const summary = plainText(raw ?? '');
	if (!fitsLength(summary, MAX_SUMMARY_LENGTH)) return fail('summary', 'summary_too_long');
	return { ok: true, value: summary };
}

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
	ANONYMOUS,
	MAX_BODY_BYTES,
	MAX_DIFF_BYTES,
	cleanName,
	cleanSummary,
	validateBody,
	validatePath,
} from '../src/validate.ts';
import { splitFile } from '../src/frontmatter.ts';

const errorCode = (result: { ok: boolean; errors?: { code: string }[] }) => (result.ok ? 'ok' : result.errors![0].code);

describe('validatePath', () => {
	test('accepts English and Bangla pages inside a pillar', () => {
		assert.equal(errorCode(validatePath('src/content/docs/attractions/lalbagh-fort.md')), 'ok');
		assert.equal(errorCode(validatePath('src/content/docs/bn/attractions/lalbagh-fort.md')), 'ok');
		assert.equal(errorCode(validatePath('src/content/docs/where-to-stay/index.md')), 'ok');
	});

	test('rejects MDX pages', () => {
		assert.equal(errorCode(validatePath('src/content/docs/index.mdx')), 'path_not_markdown');
		assert.equal(errorCode(validatePath('src/content/docs/bn/index.mdx')), 'path_not_markdown');
	});

	test('rejects the about and legal pages', () => {
		for (const page of ['about', 'privacy', 'terms', 'licence']) {
			assert.equal(errorCode(validatePath(`src/content/docs/${page}.md`)), 'path_not_editable');
			assert.equal(errorCode(validatePath(`src/content/docs/bn/${page}.md`)), 'path_not_editable');
		}
	});

	test('rejects unknown folders and nesting', () => {
		assert.equal(errorCode(validatePath('src/content/docs/guides/example.md')), 'path_not_editable');
		assert.equal(errorCode(validatePath('src/content/docs/areas/old-dhaka/extra.md')), 'path_not_editable');
		assert.equal(errorCode(validatePath('src/content/docs/fr/areas/gulshan.md')), 'path_not_editable');
	});

	test('rejects traversal, absolute paths, other files and odd characters', () => {
		for (const path of [
			'src/content/docs/areas/../../../astro.config.md',
			'/src/content/docs/areas/gulshan.md',
			'src/content/events/x.md',
			'src/content/docs/areas/gulshan.md.txt',
			'src/content/docs/areas/Gulshan.md',
			'src/content/docs/areas/gul shan.md',
			'src/content/docs/areas/gulshan\u0000.md',
			'src/content/docs/areas//gulshan.md',
			'',
		]) {
			assert.equal(errorCode(validatePath(path)), 'path_invalid', path);
		}
		assert.equal(errorCode(validatePath(42)), 'path_invalid');
		assert.equal(errorCode(validatePath(undefined)), 'path_invalid');
	});
});

describe('validateBody', () => {
	const base = '\nDhaka is the capital of Bangladesh.\n';

	test('accepts ordinary Markdown and returns no flags for an unchanged body', () => {
		const result = validateBody(base, base);
		assert.ok(result.ok);
		assert.deepEqual(result.value.flags, { linksAdded: [], diffBytes: 0 });
	});

	test('accepts the body of every page on the site unchanged', () => {
		const docs = join(import.meta.dirname, '../../src/content/docs');
		const files = readdirSync(docs, { recursive: true, encoding: 'utf8' })
			.map((file) => join(docs, file))
			.filter((file) => file.endsWith('.md'));
		assert.ok(files.length > 30);
		for (const file of files) {
			const path = relative(join(docs, '../../..'), file).replaceAll('\\', '/');
			if (!validatePath(path).ok) continue;
			const { body } = splitFile(readFileSync(file, 'utf8'));
			assert.equal(errorCode(validateBody(body, body)), 'ok', path);
		}
	});

	test('normalises Windows line endings', () => {
		const result = validateBody('One\r\nTwo\r\n', '');
		assert.ok(result.ok);
		assert.equal(result.value.body, 'One\nTwo\n');
	});

	test('rejects bodies that are too large', () => {
		assert.equal(errorCode(validateBody('a'.repeat(MAX_BODY_BYTES + 1), '')), 'body_too_large');
		// Bangla letters take three bytes each in UTF-8.
		assert.equal(errorCode(validateBody('ক'.repeat(Math.ceil(MAX_BODY_BYTES / 3) + 1), '')), 'body_too_large');
	});

	test('rejects changes that are too large', () => {
		const big = 'a'.repeat(MAX_DIFF_BYTES + 1);
		assert.equal(errorCode(validateBody(big, '')), 'diff_too_large');
		assert.equal(errorCode(validateBody('', big)), 'diff_too_large');
		assert.equal(errorCode(validateBody(`${big}x`, `${big}y`)), 'ok');
	});

	test('rejects a frontmatter block in the body', () => {
		assert.equal(errorCode(validateBody('---\nverified: true\n---\nText', base)), 'body_has_frontmatter');
		assert.equal(errorCode(validateBody('\n---\ntitle: x\n---\n', base)), 'body_has_frontmatter');
		// A horizontal rule later in the page is fine.
		assert.equal(errorCode(validateBody('Text\n\n---\n\nMore', base)), 'ok');
	});

	test('rejects raw HTML', () => {
		for (const body of [
			'<script>alert(1)</script>',
			'Text <iframe src="https://example.org"></iframe>',
			'<style>body{}</style>',
			'<b>bold</b>',
			'<img src=x onerror=alert(1)>',
			'<!-- a comment -->',
			'</div>',
			'<a href="https://example.org" onclick="steal()">x</a>',
		]) {
			assert.equal(errorCode(validateBody(body, base)), 'body_has_html', body);
		}
	});

	test('allows HTML-like text in code, escaped brackets and autolinks', () => {
		for (const body of [
			'Use `<script>` carefully.',
			'```html\n<script>alert(1)</script>\n```',
			'~~~\n<div>{}</div>\n~~~',
			'1 \\<b\\> 2',
			'See <https://example.org/page>.',
			'Write to <team@example.org>.',
			'Prices: 5 < 10 and 10 > 5.',
		]) {
			assert.equal(errorCode(validateBody(body, base)), 'ok', body);
		}
	});

	test('rejects MDX syntax', () => {
		for (const body of [
			"import Card from '../components/Card.astro';\n\nText",
			'export const x = 1;',
			'Hello {name}',
			'{/* comment */}',
		]) {
			assert.equal(errorCode(validateBody(body, base)), 'body_has_mdx', body);
		}
		assert.equal(errorCode(validateBody('Imports from India are common.', base)), 'ok');
	});

	test('does not hide HTML behind unmatched code delimiters', () => {
		for (const body of ['`` <script> `', '```bad`info\n\n<script>\n```']) {
			assert.equal(errorCode(validateBody(body, base)), 'body_has_html', body);
		}
	});

	test('decodes Markdown URL escapes before checking links and images', () => {
		for (const body of ['[x](java&#115;cript:alert)', '[x](j&#x61;vascript:alert)', '[x](javascript\\:alert)']) {
			assert.equal(errorCode(validateBody(body, base)), 'body_has_unsafe_link', body);
		}
		for (const body of ['![x](https&#58;//tracker.example/p.gif)', '![x](https\\://tracker.example/p.gif)']) {
			assert.equal(errorCode(validateBody(body, base)), 'body_has_external_image', body);
		}
		const result = validateBody('[x](https&#58;//example.org/)', base);
		assert.ok(result.ok);
		assert.deepEqual(result.value.flags.linksAdded, ['https://example.org/']);
	});

	test('rejects script-capable links', () => {
		for (const body of [
			'[click](javascript:alert(1))',
			'[click](JavaScript:alert(1))',
			'[click]( javascript:alert(1))',
			'[click](java&#x09;script:alert(1))',
			'[click](javascript&#58;alert(1))',
			'[click](javascript&colon;alert(1))',
			'[click](vbscript:msgbox)',
			'[click](data:text/html;base64,PHNjcmlwdD4=)',
			'[click][ref]\n\n[ref]: javascript:alert(1)',
			'<javascript:alert(1)>',
		]) {
			assert.equal(errorCode(validateBody(body, base)), 'body_has_unsafe_link', body);
		}
	});

	test('rejects images from other sites, but not from the site', () => {
		assert.equal(errorCode(validateBody('![x](https://tracker.example/pixel.gif)', base)), 'body_has_external_image');
		assert.equal(errorCode(validateBody('![x](//tracker.example/pixel.gif)', base)), 'body_has_external_image');
		assert.equal(errorCode(validateBody('![x][p]\n\n[p]: https://tracker.example/p.gif', base)), 'body_has_external_image');
		assert.equal(errorCode(validateBody('![Lalbagh Fort](/uploads/lalbagh.jpg)', base)), 'ok');
	});

	test('rejects control characters and bidirectional overrides, but keeps Bangla joiners', () => {
		assert.equal(errorCode(validateBody('Text\u0000', base)), 'body_has_control_characters');
		assert.equal(errorCode(validateBody('Text ‮gnirts', base)), 'body_has_control_characters');
		assert.equal(errorCode(validateBody('র‍্যাব and ক্‌ষ', base)), 'ok');
	});

	test('flags external links added, but not existing, internal or site links', () => {
		const before = '\nSee [the museum](https://museum.example/).\n';
		const after = [
			'\nSee [the museum](https://museum.example/).',
			'Tickets at <https://tickets.example/buy>.',
			'More at https://blog.example/post, and [Gulshan](/areas/gulshan/).',
			'Also [this page](https://visitdhaka.org/food/) and [ref].',
			'',
			'[ref]: https://ref.example/a',
			'',
		].join('\n');
		const result = validateBody(after, before);
		assert.ok(result.ok);
		assert.deepEqual(result.value.flags.linksAdded, [
			'https://blog.example/post',
			'https://ref.example/a',
			'https://tickets.example/buy',
		]);
	});

	test('measures a small change as small', () => {
		const result = validateBody('\nDhaka is the busy capital of Bangladesh.\n', base);
		assert.ok(result.ok);
		assert.equal(result.value.flags.diffBytes, 'busy '.length);
	});

	test('accepts an edit to a Bangla page', () => {
		const result = validateBody('\nঢাকা বাংলাদেশের রাজধানী।\n', '\nঢাকা বাংলাদেশের রাজধানী\n');
		assert.ok(result.ok);
		assert.equal(result.value.body, '\nঢাকা বাংলাদেশের রাজধানী।\n');
	});

	test('rejects a body that isn\'t text', () => {
		assert.equal(errorCode(validateBody(undefined, base)), 'body_invalid');
		assert.equal(errorCode(validateBody({}, base)), 'body_invalid');
	});
});

describe('cleanName', () => {
	test('uses Anonymous for an empty or missing name', () => {
		for (const raw of [undefined, null, '', '   ', '<b></b>']) {
			assert.deepEqual(cleanName(raw), { ok: true, value: ANONYMOUS });
		}
	});

	test('trims, collapses spaces and strips markup and control characters', () => {
		assert.deepEqual(cleanName('  Rahim \n  Uddin '), { ok: true, value: 'Rahim Uddin' });
		assert.deepEqual(cleanName('<b>Rahim</b><script>x</script>'), { ok: true, value: 'Rahimx' });
		assert.deepEqual(cleanName('**Rahim** [x]'), { ok: true, value: 'Rahim x' });
		assert.deepEqual(cleanName('Ra\u0000him‮'), { ok: true, value: 'Rahim' });
	});

	test('keeps Bangla names, including joiners', () => {
		assert.deepEqual(cleanName('রহিম উদ্দিন'), { ok: true, value: 'রহিম উদ্দিন' });
		assert.deepEqual(cleanName('র‍্যাব'), { ok: true, value: 'র‍্যাব' });
	});

	test('counts length in characters as people see them', () => {
		assert.equal(errorCode(cleanName('a'.repeat(40))), 'ok');
		assert.equal(errorCode(cleanName('a'.repeat(41))), 'name_too_long');
		// 20 Bangla letters with vowel signs are 40 code points but 20 characters.
		assert.equal(errorCode(cleanName('কি'.repeat(20))), 'ok');
		// Over the limit in code points, so these are counted as characters.
		assert.equal(errorCode(cleanName('কি'.repeat(40))), 'ok');
		assert.equal(errorCode(cleanName('কি'.repeat(41))), 'name_too_long');
	});

	test('rejects links in names', () => {
		assert.equal(errorCode(cleanName('Visit https://spam.example')), 'name_has_link');
		assert.equal(errorCode(cleanName('www.spam.example')), 'name_has_link');
	});

	test('rejects names that aren\'t text', () => {
		assert.equal(errorCode(cleanName(42)), 'name_invalid');
	});
});

describe('cleanSummary', () => {
	test('returns plain text, or an empty string', () => {
		assert.deepEqual(cleanSummary(undefined), { ok: true, value: '' });
		assert.deepEqual(cleanSummary(' Fixed the  <i>opening</i> line\n'), { ok: true, value: 'Fixed the opening line' });
	});

	test('limits the length', () => {
		assert.equal(errorCode(cleanSummary('a'.repeat(200))), 'ok');
		assert.equal(errorCode(cleanSummary('a'.repeat(201))), 'summary_too_long');
		assert.equal(errorCode(cleanSummary([])), 'summary_invalid');
	});
});

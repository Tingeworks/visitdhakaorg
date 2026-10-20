import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FrontmatterError, rewriteFile, splitFile } from '../src/frontmatter.ts';
import { validateBody } from '../src/validate.ts';

const page = (frontmatter: string, body = '\nText.\n') => `---\n${frontmatter}---\n${body}`;

describe('splitFile', () => {
	test('splits frontmatter from the body, keeping the blank line after it', () => {
		assert.deepEqual(splitFile('---\ntitle: A\n---\n\nBody\n'), { frontmatter: 'title: A\n', body: '\nBody\n' });
	});

	test('rejects a file without frontmatter', () => {
		assert.throws(() => splitFile('Just text'), FrontmatterError);
		assert.throws(() => splitFile('---\ntitle: A\nno closing line'), FrontmatterError);
	});
});

describe('rewriteFile', () => {
	test('replaces the body and keeps the rest of the frontmatter exactly', () => {
		const original = page('title: Lalbagh Fort\ntags: [mughal, fort]\ncoordinates:\n  lat: 23.719\n  lng: 90.388\nverified: false\n');
		assert.equal(
			rewriteFile(original, '\nNew text.\n', 'Rahim'),
			page(
				'title: Lalbagh Fort\ntags: [mughal, fort]\ncoordinates:\n  lat: 23.719\n  lng: 90.388\nverified: false\ncontributors:\n  - Rahim\n',
				'\nNew text.\n',
			),
		);
	});

	test('always sets verified to false', () => {
		assert.match(rewriteFile(page('title: A\nverified: true\n'), '\nx\n', 'Rahim'), /^verified: false$/m);
		assert.match(rewriteFile(page('title: A\n'), '\nx\n', 'Rahim'), /^verified: false$/m);
	});

	test('adds a contributor once, ignoring case', () => {
		const once = rewriteFile(page('title: A\ncontributors:\n  - Rahim\n'), '\nx\n', 'rahim');
		assert.equal(once.match(/Rahim/gi)!.length, 1);
		const twice = rewriteFile(page('title: A\ncontributors:\n  - Rahim\n'), '\nx\n', 'Karim');
		assert.match(twice, /contributors:\n {2}- Rahim\n {2}- Karim\n/);
	});

	test('keeps a flow-style contributors list in flow style', () => {
		assert.match(rewriteFile(page('title: A\ncontributors: [Rahim]\n'), '\nx\n', 'Karim'), /^contributors: \[Rahim, Karim\]$/m);
	});

	test('quotes names that YAML would misread', () => {
		for (const name of ['yes', '123', 'Rahim: the guide', '- dash', '#hash']) {
			const file = rewriteFile(page('title: A\n'), '\nx\n', name);
			const { frontmatter } = splitFile(file);
			assert.ok(frontmatter.includes('contributors:'), name);
			// Reading it back gives the same string.
			const again = rewriteFile(file, '\nx\n', name);
			assert.equal(again, file, name);
		}
	});

	test('keeps Bangla text intact', () => {
		const original = page('title: লালবাগ কেল্লা\ndescription: মুঘল আমলের দুর্গ।\nverified: false\n', '\nপুরোনো লেখা।\n');
		const result = rewriteFile(original, '\nনতুন লেখা।\n', 'রহিম');
		assert.equal(
			result,
			page('title: লালবাগ কেল্লা\ndescription: মুঘল আমলের দুর্গ।\nverified: false\ncontributors:\n  - রহিম\n', '\nনতুন লেখা।\n'),
		);
	});

	test('rejects broken frontmatter or a contributors field that is not a list', () => {
		assert.throws(() => rewriteFile(page('title: [unclosed\n'), '\nx\n', 'Rahim'), FrontmatterError);
		assert.throws(() => rewriteFile(page('contributors: Rahim\n'), '\nx\n', 'Rahim'), FrontmatterError);
	});

	test('changes nothing but verified and contributors on every page of the site', () => {
		const docs = join(import.meta.dirname, '../../src/content/docs');
		const files = readdirSync(docs, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.md'));
		assert.ok(files.length > 30);
		for (const file of files) {
			const original = readFileSync(join(docs, file), 'utf8');
			const { body } = splitFile(original);
			const result = rewriteFile(original, body, 'Test Contributor');
			const strip = (text: string) =>
				text
					.replace(/^verified: .*\n/m, '')
					.replace(/^contributors:\n(?: {2}- .*\n)*/m, '');
			assert.equal(strip(result), strip(original), file);
			assert.match(result, /^verified: false$/m, file);
			assert.match(result, /^ {2}- Test Contributor$/m, file);
		}
	});

	test('validating and rewriting a large page stays well inside the Worker CPU budget', () => {
		const original = page('title: Big\ntags: [a, b]\nverified: true\n', '\n' + 'Paragraph with a [link](/areas/gulshan/).\n\n'.repeat(1100));
		const { body } = splitFile(original);
		const edited = body.replace('Paragraph', 'Edited paragraph');
		const runs = 200;
		const start = performance.now();
		for (let i = 0; i < runs; i++) {
			validateBody(edited, body);
			rewriteFile(original, edited, 'Rahim');
		}
		const average = (performance.now() - start) / runs;
		console.log(`validate + rewrite, ${(new TextEncoder().encode(edited).length / 1000).toFixed(0)} KB body: ${average.toFixed(2)} ms`);
		assert.ok(average < 10, `${average} ms`);
	});
});

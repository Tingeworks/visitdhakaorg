// Server-owned frontmatter: an edit replaces only a page's body. The Worker keeps the existing frontmatter, sets
// `verified: false` and credits the contributor in `contributors`, so a client can never change frontmatter itself.
// Uses the `yaml` library's document API, which keeps key order, comments, quoting and flow lists ([a, b]) as they
// were, so pull request diffs stay small and the CMS reads the file back the same way.
import { isSeq, isScalar, parseDocument } from 'yaml';

export class FrontmatterError extends Error {}

/**
 * Splits a page into its frontmatter (the YAML between the `---` lines) and its body (everything after the closing
 * `---` line, including the blank line that usually follows it). The editor loads and sends back exactly this body.
 */
export function splitFile(file: string) {
	const text = file.replace(/\r\n?/g, '\n');
	const match = text.match(/^---\n([\s\S]*?\n)?---(?:\n|$)/);
	if (!match) throw new FrontmatterError('The file has no frontmatter block.');
	return { frontmatter: match[1] ?? '', body: text.slice(match[0].length) };
}

/**
 * The page with `body` in place of its current body, `verified: false`, and `contributor` added to `contributors`
 * unless the name is already there (ignoring case). Everything else in the frontmatter is left as it was.
 */
export function rewriteFile(file: string, body: string, contributor: string) {
	const { frontmatter } = splitFile(file);
	const doc = parseDocument(frontmatter);
	if (doc.errors.length > 0) throw new FrontmatterError(`The frontmatter isn't valid YAML: ${doc.errors[0].message}`);

	doc.set('verified', false);

	const existing = doc.get('contributors', true);
	if (existing !== undefined && existing !== null && !isSeq(existing)) {
		throw new FrontmatterError('`contributors` is not a list.');
	}
	const contributors = isSeq(existing) ? existing : doc.createNode([]);
	if (!isSeq(existing)) doc.set('contributors', contributors);
	const names = contributors.items.map((item) => String(isScalar(item) ? item.value : item).toLowerCase());
	if (!names.includes(contributor.toLowerCase())) contributors.add(doc.createNode(contributor));

	return `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false })}---\n${body}`;
}

/** The page's frontmatter as plain data, for reading fields such as `title`. */
export function readFrontmatter(file: string): Record<string, unknown> {
	const doc = parseDocument(splitFile(file).frontmatter);
	if (doc.errors.length > 0) throw new FrontmatterError(`The frontmatter isn't valid YAML: ${doc.errors[0].message}`);
	const data = doc.toJS();
	return data && typeof data === 'object' ? data : {};
}

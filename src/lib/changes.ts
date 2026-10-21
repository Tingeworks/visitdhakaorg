import { execFileSync } from 'node:child_process';
import { translatedLocales } from './i18n';

// Recent changes, read from git at build time: the latest commits that touched src/content/docs/, newest first. Only
// the author's name is shown. Author emails are read only to recognise signed-in edits by their pseudonymous
// `user-<id>@visitdhaka.org` address (decision 0003), for contributor profiles (src/lib/profiles.ts). Every other email
// is dropped as soon as it's read, and no email is ever kept or shown.
// Builds need the full git history, which astro.config.mjs fetches on Cloudflare if the clone is shallow.

export const repoUrl = 'https://github.com/Tingeworks/visitdhakaorg';

export type ChangedFile = {
	/** English slug of the page (`areas/gulshan`, or '' for the homepage). */
	slug: string;
	/** The locale of the file that changed: `bn` for src/content/docs/bn/..., undefined for English. */
	locale: string | undefined;
	status: 'added' | 'modified' | 'deleted';
};

export type Change = {
	hash: string;
	date: Date;
	author: string;
	subject: string;
	/** The edit summary of a public edit: the commit body without its `Edited-by` line. */
	summary: string;
	/** The account ID of a signed-in edit, from its `user-<id>@visitdhaka.org` author email. */
	account?: number;
	files: ChangedFile[];
};

const docsDir = 'src/content/docs/';

/** The account ID in a signed-in edit's author email, or undefined for any other email. */
export const accountOf = (email: string) => {
	const match = /^user-([1-9][0-9]{0,15})@visitdhaka\.org$/.exec(email);
	return match ? Number(match[1]) : undefined;
};

function fileOf(path: string, status: ChangedFile['status']): ChangedFile | undefined {
	if (!path.startsWith(docsDir) || !/\.mdx?$/.test(path)) return;
	const [first, ...rest] = path.slice(docsDir.length).replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '').split('/');
	const locale = translatedLocales.includes(first) ? first : undefined;
	const slug = (locale ? rest : [first, ...rest]).filter(Boolean).join('/');
	return { slug, locale, status };
}

/** Commits that changed a page, newest first, selected by extra `git log` options. */
export function readChanges(options: string[]): Change[] {
	let log: string;
	try {
		log = execFileSync(
			'git',
			['log', '--no-merges', ...options, '--format=%x1e%H%x1f%aI%x1f%an%x1f%ae%x1f%s%x1f%b%x1d', '--name-status', '--', docsDir],
			{ encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
		);
	} catch {
		// Not a git checkout (for example a downloaded archive): show an empty list rather than failing the build.
		return [];
	}
	return log
		.split('\x1e')
		.filter((record) => record.trim())
		.map((record) => {
			const [header, names = ''] = record.split('\x1d');
			const [hash, date, author, email, subject, body = ''] = header.split('\x1f');
			const summary = body
				.split('\n')
				.filter((line) => !line.startsWith('Edited-by:'))
				.join('\n')
				.trim();
			const files = names.trim().split('\n').flatMap((line) => {
				// "M<tab>path", "A<tab>path", "D<tab>path", or "R100<tab>old<tab>new" for a rename.
				const [code, ...paths] = line.split('\t');
				const status = code.startsWith('A') || code.startsWith('R') ? 'added' : code.startsWith('D') ? 'deleted' : 'modified';
				const file = paths.length > 0 && fileOf(paths[paths.length - 1], status);
				return file ? [file] : [];
			});
			const account = accountOf(email);
			return { hash, date: new Date(date), author, subject, summary, ...(account ? { account } : {}), files };
		})
		.filter((change) => change.files.length > 0);
}

let cache: Change[] | undefined;

/** The latest `limit` commits that changed a page, newest first. Read once per build. */
export function recentChanges(limit = 100) {
	cache ??= readChanges([`--max-count=${limit}`]);
	return cache;
}

import { execFileSync } from 'node:child_process';
import { translatedLocales } from './i18n';

// Recent changes, read from git at build time: the latest commits that touched src/content/docs/, newest first. Only
// the author's name is read, never the email: public edits all use the same placeholder address (decision 0003).
// Builds need the full git history, which astro.config.mjs fetches on Cloudflare if the clone is shallow.

export const repoUrl = 'https://github.com/Tingeworks/visitdhakaorg';

export type ChangedFile = {
	/** English slug of the page (`areas/gulshan`, or '' for the homepage). */
	slug: string;
	/** The locale of the file that changed: `bn` for src/content/docs/bn/..., undefined for English. */
	locale: string | undefined;
	status: 'added' | 'modified' | 'deleted';
};

export type Change = { hash: string; date: Date; author: string; subject: string; files: ChangedFile[] };

const docsDir = 'src/content/docs/';

function fileOf(path: string, status: ChangedFile['status']): ChangedFile | undefined {
	if (!path.startsWith(docsDir) || !/\.mdx?$/.test(path)) return;
	const [first, ...rest] = path.slice(docsDir.length).replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '').split('/');
	const locale = translatedLocales.includes(first) ? first : undefined;
	const slug = (locale ? rest : [first, ...rest]).filter(Boolean).join('/');
	return { slug, locale, status };
}

function readChanges(limit: number): Change[] {
	let log: string;
	try {
		log = execFileSync(
			'git',
			['log', '--no-merges', `--max-count=${limit}`, '--format=%x1e%H%x1f%aI%x1f%an%x1f%s', '--name-status', '--', docsDir],
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
			const [header, ...lines] = record.trim().split('\n');
			const [hash, date, author, subject] = header.split('\x1f');
			const files = lines.flatMap((line) => {
				// "M<tab>path", "A<tab>path", "D<tab>path", or "R100<tab>old<tab>new" for a rename.
				const [code, ...paths] = line.split('\t');
				const status = code.startsWith('A') || code.startsWith('R') ? 'added' : code.startsWith('D') ? 'deleted' : 'modified';
				const file = paths.length > 0 && fileOf(paths[paths.length - 1], status);
				return file ? [file] : [];
			});
			return { hash, date: new Date(date), author, subject, files };
		})
		.filter((change) => change.files.length > 0);
}

let cache: Change[] | undefined;

/** The latest `limit` commits that changed a page, newest first. Read once per build. */
export function recentChanges(limit = 100) {
	cache ??= readChanges(limit);
	return cache;
}

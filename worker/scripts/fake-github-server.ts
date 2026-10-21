// The in-memory fake GitHub served over HTTP, for a local end-to-end run of the editor and the Worker (#18). It starts
// with every page in src/content/docs on `main`, and forgets everything when it stops. Run `pnpm fake-github`, then
// point the Worker at it with GITHUB_API_URL in worker/.dev.vars. GET /__state shows the branches, commits and pull
// requests that edits have made.
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative } from 'node:path';
import { FakeGitHub } from '../test/fake-github.ts';

const port = Number(process.argv[2] ?? 8788);
const repoRoot = join(import.meta.dirname, '../..');
const docs = join(repoRoot, 'src/content/docs');

const files: Record<string, string> = {};
for (const entry of readdirSync(docs, { recursive: true, withFileTypes: true })) {
	if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) continue;
	const file = join(entry.parentPath, entry.name);
	files[relative(repoRoot, file)] = readFileSync(file, 'utf8');
}
const github = new FakeGitHub(files);

/** Each edit branch's latest commit, with the files it changed compared with `main`. */
function state() {
	const main = github.filesOn('main');
	const branches = [...github.branches].filter(([name]) => name !== 'main').map(([name, sha]) => {
		const commit = github.commits.get(sha)!;
		const changed = [...commit.files].filter(([path, text]) => main.get(path) !== text);
		return { name, commit: sha, message: commit.message, author: commit.author, changed: Object.fromEntries(changed) };
	});
	return { pulls: github.pulls, comments: github.comments, branches, calls: github.calls };
}

createServer(async (incoming, outgoing) => {
	const chunks: Buffer[] = [];
	for await (const chunk of incoming) chunks.push(chunk);
	const url = `http://localhost:${port}${incoming.url}`;
	const response =
		incoming.url === '/__state'
			? Response.json(state())
			: await github.handle(
					new Request(url, {
						method: incoming.method,
						headers: { 'Content-Type': incoming.headers['content-type'] ?? 'application/json' },
						body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
					}),
				);
	outgoing.writeHead(response.status, { 'Content-Type': 'application/json' });
	outgoing.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => {
	console.log(`Fake GitHub with ${Object.keys(files).length} pages on http://localhost:${port} (state at /__state)`);
});

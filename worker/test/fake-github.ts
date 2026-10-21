// An in-memory stand-in for the parts of GitHub's REST API (and Turnstile's siteverify) the Worker uses, so tests can
// run whole edits and inspect the branches, commits and pull requests they leave behind. Blob SHAs are real git blob
// hashes, so a test can compute the SHA an editor would send.

type Commit = { files: Map<string, string>; message?: string; author?: { name: string; email: string } };
type Pull = { number: number; head: string; state: 'open' | 'closed'; title: string; body: string; labels: string[]; html_url: string };

export async function blobSha(text: string) {
	const content = new TextEncoder().encode(text);
	const header = new TextEncoder().encode(`blob ${content.length}\0`);
	const digest = await crypto.subtle.digest('SHA-1', new Uint8Array([...header, ...content]));
	return Buffer.from(digest).toString('hex');
}

export class FakeGitHub {
	commits = new Map<string, Commit>();
	branches = new Map<string, string>();
	pulls: Pull[] = [];
	comments: { number: number; body: string }[] = [];
	/** Every GitHub API call, as `METHOD /path` (token and Turnstile calls excluded). */
	calls: string[] = [];
	/** Overrides the number of public edits the search reports. */
	searchCount?: number;
	/** Makes the next write to a file fail as if it changed in the meantime. */
	failNextCommit = false;
	private nextCommit = 1;

	constructor(files: Record<string, string>) {
		this.commits.set('c0', { files: new Map(Object.entries(files)) });
		this.branches.set('main', 'c0');
	}

	/** The files on a branch. */
	filesOn(branch: string) {
		return this.commits.get(this.branches.get(branch)!)!.files;
	}

	install() {
		globalThis.fetch = async (input, init) => this.handle(new Request(input, init));
	}

	/** Answers one request to GitHub or Turnstile, as `install()` does for every fetch. */
	async handle(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.host === 'challenges.cloudflare.com') {
			const form = new URLSearchParams(await request.text());
			return Response.json({ success: form.get('response') === 'pass' });
		}
		if (url.pathname.endsWith('/access_tokens')) {
			return Response.json({ token: 'ghs_fake', expires_at: new Date(Date.now() + 3600_000).toISOString() });
		}
		const path = decodeURIComponent(url.pathname);
		this.calls.push(`${request.method} ${path}`);
		const repo = '/repos/Tingeworks/visitdhakaorg';
		const body = request.method === 'GET' ? undefined : await request.json().catch(() => undefined);

		if (path === '/search/issues') {
			const count = this.searchCount ?? this.pulls.length;
			return Response.json({ total_count: count, items: [] });
		}
		if (request.method === 'GET' && path.startsWith(`${repo}/git/ref/heads/`)) {
			const sha = this.branches.get(path.slice(`${repo}/git/ref/heads/`.length));
			return sha ? Response.json({ object: { sha } }) : Response.json({ message: 'Not Found' }, { status: 404 });
		}
		if (request.method === 'POST' && path === `${repo}/git/refs`) {
			const name = body.ref.replace('refs/heads/', '');
			if (this.branches.has(name)) return Response.json({ message: 'Reference already exists' }, { status: 422 });
			this.branches.set(name, body.sha);
			return Response.json({ ref: body.ref }, { status: 201 });
		}
		if (request.method === 'PATCH' && path.startsWith(`${repo}/git/refs/heads/`)) {
			this.branches.set(path.slice(`${repo}/git/refs/heads/`.length), body.sha);
			return Response.json({});
		}
		if (path.startsWith(`${repo}/contents/`)) {
			const file = path.slice(`${repo}/contents/`.length);
			if (request.method === 'GET') {
				const branch = url.searchParams.get('ref') ?? 'main';
				const text = this.branches.has(branch) ? this.filesOn(branch).get(file) : undefined;
				if (text === undefined) return Response.json({ message: 'Not Found' }, { status: 404 });
				return Response.json({ type: 'file', encoding: 'base64', sha: await blobSha(text), content: Buffer.from(text).toString('base64') });
			}
			if (request.method === 'PUT') {
				const files = this.filesOn(body.branch);
				const current = files.get(file);
				if (this.failNextCommit || current === undefined || (await blobSha(current)) !== body.sha) {
					this.failNextCommit = false;
					return Response.json({ message: 'does not match' }, { status: 409 });
				}
				const sha = `c${this.nextCommit++}`;
				const next = new Map(files).set(file, Buffer.from(body.content, 'base64').toString('utf8'));
				this.commits.set(sha, { files: next, message: body.message, author: body.author });
				this.branches.set(body.branch, sha);
				return Response.json({ commit: { sha } });
			}
		}
		if (path === `${repo}/pulls`) {
			if (request.method === 'GET') {
				const head = url.searchParams.get('head')!.replace('Tingeworks:', '');
				return Response.json(this.pulls.filter((pull) => pull.head === head && pull.state === 'open'));
			}
			const number = this.pulls.length + 1;
			const pull: Pull = { number, head: body.head, state: 'open', title: body.title, body: body.body, labels: [], html_url: `https://github.com/Tingeworks/visitdhakaorg/pull/${number}` };
			this.pulls.push(pull);
			return Response.json(pull, { status: 201 });
		}
		const issue = path.match(new RegExp(`^${repo}/issues/(\\d+)/(labels|comments)$`));
		if (issue) {
			const number = Number(issue[1]);
			if (issue[2] === 'labels') this.pulls.find((pull) => pull.number === number)!.labels.push(...body.labels);
			else this.comments.push({ number, body: body.body });
			return Response.json({}, { status: issue[2] === 'labels' ? 200 : 201 });
		}
		return Response.json({ message: `Fake GitHub has no ${request.method} ${path}` }, { status: 500 });
	}
}

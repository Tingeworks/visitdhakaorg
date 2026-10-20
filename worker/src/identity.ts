// Who is making an edit, worked out in one place (decision 0006). In phase 1 everyone is anonymous, credited by the
// optional display name they type. Phase 3 adds a session check here for signed-in editors, so the rest of the Worker
// reads the identity from this function and never reads the name from the request itself.
import { cleanName, type Result } from './validate.ts';

export type Identity = { kind: 'anonymous'; name: string };

/** The editor's identity for a request whose JSON body is `input`. Phase 1 sets and reads no cookies. */
export function identify(_request: Request, input: { name?: unknown }): Result<Identity> {
	const name = cleanName(input.name);
	return name.ok ? { ok: true, value: { kind: 'anonymous', name: name.value } } : name;
}

-- Accounts for optional Google sign-in (decision 0006, #56). Nothing from the Google account is stored except its
-- stable subject ID: no email, picture, locale or profile. The CHECKs keep an email address out of every column.
CREATE TABLE users (
	-- The public ID, used in the author email `user-<id>@visitdhaka.org`. AUTOINCREMENT so a deleted account's ID is
	-- never given to someone else (#60).
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	-- Google's `sub`: stable for the account and never shown anywhere.
	google_sub TEXT NOT NULL UNIQUE CHECK (length(google_sub) BETWEEN 1 AND 255 AND google_sub NOT GLOB '*@*'),
	-- Public and permanent in git once an edit is merged. Cleaned like the anonymous name (cleanAccountName).
	display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200 AND display_name NOT GLOB '*?@?*.?*'),
	-- ISO 8601 UTC.
	created_at TEXT NOT NULL,
	banned_at TEXT,
	ban_reason TEXT CHECK (ban_reason IS NULL OR ban_reason NOT GLOB '*?@?*.?*')
);

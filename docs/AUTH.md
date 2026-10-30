# Sign-in and access

## Who can do what

| Route | Guest | Scorer | Admin |
|---|---|---|---|
| `/`, `/matches`, `/tournaments`, `/sports/**`, match pages, `/display/**` | yes | yes | yes |
| `/teams`, `/players`, `/score`, `/score/[id]` | sign in | yes | yes |
| `/admin/**`, `/tournaments/create`, `/tournaments/*/matches/create` | sign in | 403 | yes |

- Rules live in one place: `packages/shared/src/access.ts` (`ROUTE_RULES`, `NAV_ITEMS`). The middleware, the top navigation
  and the page guards all read it, and a test checks that every nav link a role sees actually opens for that role.
- Guests are sent to `/login?callbackUrl=<where they were going>`; a signed-in person without the right role gets a 403 page.
- A scorer can only score matches assigned to them (or with no scorer assigned). Admins can score any match. The server refuses
  everyone else, not just the UI.
- Match visibility: `public` is listed for everyone, `link` is not listed but opens by URL, `private` needs a sign-in.

## Google sign-in

Sign-in is **invite-only**. A Google account gets in only if its email matches an account an admin created on
`/admin/users` (or is listed in `ADMIN_EMAILS`). The role always comes from our accounts table, never from Google.

Set up (the `.env` currently has DUMMY values):

1. Google Cloud Console > APIs & Services > Credentials > Create credentials > OAuth client ID > Web application.
2. Add the authorised redirect URI: `http://localhost:3000/api/auth/callback/google` (and your production URL's
   `/api/auth/callback/google`).
3. Put the client id and secret in `.env`: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
4. Put your own Google email in `ADMIN_EMAILS` so your first sign-in creates an admin account.
5. Optional: `ALLOWED_EMAIL_DOMAIN=company.com` to accept only that domain.
6. Restart the web server, sign in with Google, then invite everyone else on `/admin/users`.
7. When it works, set `AUTH_PASSWORD_LOGIN=false` to remove the email and password fallback.

Not covered by automated tests: the real round trip with Google (the token exchange). Tests cover the redirect to Google
(client id, callback URL, scopes, PKCE, state) and the invite policy against the real database.

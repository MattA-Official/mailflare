# Signing in to other apps with Mailflare (OpenID Connect)

This fork of Mailflare is an OpenID Connect provider. Staff apps send people here to sign in, and get
back who they are and the roles they hold in that app. Giving someone a role in an app is how they get
access; taking it away removes it within 15 minutes.

## Rules

- **Roles are per app and per account.** The primary admin registers apps (Admin › Apps) and ticks
  roles on each account (Accounts › *person* › Apps). No role means no sign-in.
- **Two-step sign-in is required.** An app only accepts a Mailflare session that was signed in with a
  passkey, or with a password and an authenticator or recovery code. Each session records how it was
  signed in (`sessions.amr`); sessions from before this feature count as password-only. Someone signed in
  with a password alone is shown a page asking them to sign in again.
- **15-minute re-check.** ID and access tokens last 15 minutes. Every refresh checks again that the
  account is enabled, the Mailflare session still exists and was two-step, and the person still has a role.
  Signing out of Mailflare, disabling the account, removing every role, or switching the app off all end
  access at the next refresh (removing roles or switching the app off also deletes refresh tokens at once).
- **No consent screen.** Apps are registered by the primary admin, so they are trusted.

## For app developers

| | |
|---|---|
| Issuer | `https://mail.flytower.dev` (the install's origin, or `APP_URL` when set) |
| Discovery | `https://mail.flytower.dev/.well-known/openid-configuration` |
| Flow | Authorization code with PKCE (`S256`, required). No implicit or hybrid flows. |
| Client auth | `client_secret_basic` or `client_secret_post`; `none` for public clients |
| Signing | ES256. Keys at `/oauth/jwks`, picked by `kid`. |
| Scopes | `openid` (required), `profile`, `email` |
| Endpoints | `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, `/oauth/revoke` |

Register the app in Admin › Apps with its exact redirect URLs (https, or http for localhost) and the roles
it understands. Copy the client ID and secret; the secret is shown once and can be replaced with
"New secret".

### Tokens

The token response has `access_token`, `id_token`, `refresh_token`, `expires_in: 900`, `scope` and
`roles`. Refresh tokens rotate: each use returns a new one, and presenting a used one ends the whole
chain. Revoke one at `/oauth/revoke` when the person signs out of the app.

ID token claims:

```json
{
  "iss": "https://mail.flytower.dev",
  "sub": "<Mailflare user id, stable>",
  "aud": "<client id>",
  "azp": "<client id>",
  "iat": 1763125200,
  "exp": 1763126100,
  "auth_time": 1763125100,
  "amr": ["pwd", "otp", "mfa"],
  "nonce": "<as sent>",
  "email": "matt@flytower.dev",
  "email_verified": true,
  "name": "Matt",
  "roles": ["owner", "privacy"]
}
```

`roles` is always present and never empty in an issued token; its values are the role keys set on the
app. The access token is a JWT (`typ: at+jwt`) with `client_id`, `scope` and `roles`. `/oauth/userinfo`
reads roles live, so it reflects a change before the token expires.

### Errors back to the app

`login_required` and `interaction_required` (with `prompt=none`), `access_denied` (no role, app off),
and the usual `invalid_request` family. When the person can fix it themselves (no two-step sign-in, no
role), Mailflare shows its own page instead of bouncing them back. `prompt=login` and `max_age` make
the person sign in again.

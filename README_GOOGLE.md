Google Sign-In (Google-only) setup for backend

1. Environment variables

For local development, add the following to your `.env` (already appended):

- `GOOGLE_CLIENT_ID` - Web OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Web client secret (optional for id_token verification)

Example:

GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

2. Install dependency

```bash
npm install google-auth-library
```

3. Start server

```bash
npm start
```

4. Test endpoint

Client obtains `idToken` (see Flutter example) and POSTs to `/auth/google/token` with JSON `{ "idToken": "<idToken>" }`.

The server verifies the idToken using the `GOOGLE_CLIENT_ID` as audience and returns application accessToken + refreshToken.

Notes:
- Ensure Android app is registered in Google Console (package name + SHA-1) so the Android client can request id_token for your web client.
- Do not commit `.env` to git; it contains secrets.

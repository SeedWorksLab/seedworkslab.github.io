# seedworkslab.github.io

Static GitHub Pages site for SeedWorks, including the optional Seed account
portal.

## Seed account portal

`account.html` provides sign-in, sign-up, email confirmation, password recovery,
display-name editing, password changes, connected-app visibility, hosted data
usage, and permanent account deletion.

Configure it in `assets/js/account-config.js`:

```js
export const ACCOUNT_CONFIG = Object.freeze({
  supabaseUrl: "https://<project-ref>.supabase.co",
  supabasePublishableKey: "sb_publishable_...",
  deleteFunction: "delete-account",
});
```

Use only the publishable key in the browser. The matching backend migration,
deletion Edge Function and deployment steps live in
`../Supabase/README.md`.

The page shows a clear “not connected” state while the URL or key is empty.

## Security

- Supabase JS is vendored from a pinned npm release under
  `assets/vendor/supabase/`; no CDN or third-party script is loaded at runtime.
- The site sends a Content Security Policy that only allows same-origin scripts,
  styles and images, with network access limited to GitHub and Supabase APIs.
- Authentication uses PKCE, refresh-token rotation, and persistent sessions.
- Email-link codes are exchanged explicitly, so the password-recovery screen only
  opens after a valid recovery code exchange.
- Password changes and account deletion reauthenticate the current password.
- Account deletion additionally requires the exact confirmation phrase and a
  server-side service-role function.
- Account pages are excluded from search indexing.

## Local checks

```sh
npm test
npm run check
```

`npm test` covers account validation, safe error mapping, session flows,
password reauthentication, overview normalization and deletion safeguards.

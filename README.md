# seedworkslab.github.io

Static GitHub Pages site for SeedWorks, including the optional Seed account
portal.

## Seed account portal

`account.html` provides sign-in, sign-up, email confirmation, password recovery,
account-wide username editing, password changes, connected-app visibility, hosted data
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
The account-wide username is stored in `public.seed_profiles.display_name` and
returned by `seed_account_overview()`. Apply the matching Supabase migration
`20261112100000_seed_username_bridge.sql` before publishing this change: it
imports existing Coconut usernames and mirrors future changes between the Seed
profile and Coconut's synced `coconut.settings` username. Coconut picks changes
up on its next sync. Cherry and Banana do not yet implement account sync.

## App pages

Each app has a dedicated page at `/apps/<slug>/` with platform highlights,
downloads from the newest stable GitHub release, a release feed that also lists
pre-releases, and the repository README rendered from the GitHub API.

- `/apps/coconut/` — Android APK and Linux builds
- `/apps/cherry/` — Android APK
- `/apps/banana/` — Android APK

The shared release logic lives in `assets/js/app-page-core.js` and is covered by
`tests/app-page-core.test.js`. `assets/js/app-page.js` handles fetching,
rendering, README sanitization and safe URL rewriting.

App READMEs link to these pages with a download button at the top. The button
images are self-hosted under `assets/readme/`.

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
password reauthentication, overview normalization, deletion safeguards, app
release selection, asset classification and formatting.

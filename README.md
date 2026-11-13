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
  authStorageKey: "seedworks-account-auth",
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
- `/apps/coconut/web/` — account-required Coconut web app
- `/apps/cherry/` — Android APK
- `/apps/banana/` — Android APK
- `/apps/grape/` — planned Android APK; no releases published yet

The shared release logic lives in `assets/js/app-page-core.js` and is covered by
`tests/app-page-core.test.js`. `assets/js/app-page.js` handles fetching,
rendering, README sanitization and safe URL rewriting.

App READMEs link to these pages with a download button at the top. The button
images are self-hosted under `assets/readme/`.

## Hosted app releases and shared login

The Coconut release builds `build/coconut-web.zip` in its own repository.
After review, stage `build/hosted-web/` into this site's `apps/coconut/web/`
with `npm run stage:hosted-web` from the Coconut repository, review the website
diff, and deploy the website independently. Do not publish a draft GitHub
release as though it had already deployed the web app. `.nojekyll` is required
to serve Expo's `_expo/` directory on GitHub Pages. The root `404.html` only
redirects Coconut's missing deep links back to its web entry point.

Future official hosted apps should use **the same SeedWorks Cloud URL, public
publishable key, Supabase Auth project, and browser storage key
`seedworks-account-auth`**. They must keep financial caches app-specific and
bound to the signed-in user's UUID; signing out of the portal signs out the
hosted apps on the next load. Do not share this session with self-hosted
Supabase projects. Because every hosted app runs on the same GitHub Pages
origin, any compromised same-origin app script could access the shared
session. GitHub Pages cannot provide HttpOnly cookies or per-app origin
isolation.

## Security

- Supabase JS is vendored from a pinned npm release under
  `assets/vendor/supabase/`; no CDN or third-party script is loaded at runtime.
- The site sends a Content Security Policy that only allows same-origin scripts,
  styles and images, with network access limited to GitHub and Supabase APIs.
- Authentication uses PKCE, refresh-token rotation, and persistent sessions.
- Email-link codes are exchanged explicitly, so the password-recovery screen only
  opens after a verified password-recovery event, never from a URL parameter alone.
- The portal checks the current password when changing it. Enable Supabase's
  secure password change setting as additional protection against direct Auth
  API calls using a stolen session.
- Account deletion additionally requires the exact confirmation phrase and a
  server-side password check in the `delete-account` service-role function.
- The account page sends no referrer, limits network requests to the configured
  Supabase project, and refuses to operate inside a frame.
- Account pages are excluded from search indexing.

GitHub Pages does not let this site set HTTP response headers such as
`frame-ancestors`, HSTS, or `Cache-Control: no-store` for the HTML. The page
uses a meta CSP and a frame guard, but deploying behind a host with proper
HTTP security headers would provide stronger protection. Auth sessions persist
in browser storage for usability; a compromised same-origin script can access
them, so protecting repository and deployment access remains essential.

## Local checks

```sh
npm test
npm run check
```

`npm test` covers account validation, safe error mapping, session flows,
password reauthentication, overview normalization, deletion safeguards, app
release selection, asset classification and formatting.

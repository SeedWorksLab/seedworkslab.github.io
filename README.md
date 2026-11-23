# SeedWorks — seedworkslab.de

Static GitHub Pages site for SeedWorks, including the optional Seed account
portal.

The public origin is **https://seedworkslab.de**. The GitHub repository and local
directory remain `seedworkslab.github.io`; do not rename them during the domain
move. See [DOMAIN-MIGRATION.md](DOMAIN-MIGRATION.md) for the HTTPS, deployment,
Supabase and browser-storage cutover checklist.

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

## Profile picture editor

Click the avatar on the account page to view its picture and edit/delete
actions. Empty avatars open the same upload editor directly. The dialog supports
mouse/touch dragging, arrow-key positioning, zoom, crop reset and cancellation;
deletion requires confirmation. Only the processed 256×256 PNG is uploaded.
Re-editing uses that saved crop; users can upload the original again for a
wider crop. The existing server-side limits and permissions are unchanged.

## Website languages

Every website header includes an English / Magyar / Deutsch selector, including
the account portal and OAuth consent page. The preference is stored locally as
`seedworks-language`, shared across website pages and synchronized between tabs.
Without a saved preference, the first supported browser language is used,
falling back to English. App subdomains have independent preferences.

`assets/js/translations.js` contains Hungarian/German translations keyed by the
authored English text. When editing website copy, update this catalogue too;
tests check static copy, metadata and accessibility labels for coverage.
`i18n.js` updates text and accessibility attributes without replacing markup,
resetting forms, navigating, or sending data to a translation service. It also
translates asynchronous account/release status messages. Dates and numbers
follow the selected locale. The English HTML remains the no-JavaScript fallback.

Usernames, device names, form values, technical confirmation phrases, and external
README/release-note content are not translated. Mark other user/external content
with `translate="no"`. Repository content remains in its original language.

## App pages

Each app has a dedicated page at `/apps/<slug>/` with platform highlights,
downloads from the newest stable GitHub release, a release feed that also lists
pre-releases, and the repository README rendered from the GitHub API.

- `/apps/coconut/` — Android APK and Linux builds
- `https://coconut.seedworkslab.de/` — account-required Coconut web app
- `/apps/cherry/` — Android APK
- `/apps/banana/` — Android APK
- `/apps/grape/` — planned Android APK; no releases published yet

The shared release logic lives in `assets/js/app-page-core.js` and is covered by
`tests/app-page-core.test.js`. `assets/js/app-page.js` handles fetching,
rendering, README sanitization and safe URL rewriting.

The release feed also displays a changelog: version, publication date and the
marked `Release Notes` content from each published GitHub release. Notes are
rendered as text, never trusted HTML. Paragraphs, `###` headings and `-` bullets
are supported. Drafts/private plans are never shown. Public text can be corrected
in the GitHub release without redeploying this site; reload to fetch it.
Pagination is bounded to 1,000 published releases per app.

Each dedicated app page has an `#updates` section with a compact, scrollable
release history. The newest version is expanded; older versions use accessible
native disclosure controls to show their complete notes, date and download links.
An old release without marked notes says so explicitly. Historical Coconut notes
can be added safely with `seed notes backfill coconut` (preview) and `--apply`
after review; the migration appends notes without removing old release content.

App READMEs link to these pages with a download button at the top. The button
images are self-hosted under `assets/readme/`.

## Hosted app releases and shared login

The Coconut release builds its web ZIP and deploys stable published releases
through Coconut's own Pages workflow to `coconut.seedworkslab.de`. Do not stage
new exports in this website. The old `/apps/coconut/web/` build and its deep-link
handler have been removed. Those paths return the ordinary website 404, not an
app shell or a redirect. Only the product page remains at `/apps/coconut/`.

Central SSO uses the existing account portal and `/oauth/consent.html`.
Supabase's OAuth server handles authorization codes and PKCE; the website
verifies the signed-in user and only approves the explicitly registered Coconut
client, exact callback and `email` scope. Previously granted requests can return
without another consent prompt. The account page can revoke OAuth grants.

App subdomains keep independent sessions and user-bound caches; they must not
copy tokens or use shared-domain token cookies. The same local-storage key on
different origins does **not** share a session. Central sign-out does not
automatically log out every app. Revoking a grant prevents refresh, not necessarily
immediate use of an already-issued JWT. GitHub Pages cannot provide HttpOnly
session cookies or erase browser SQLite remotely.

Before deploying the SSO frontend, apply the reviewed OAuth-client isolation
migration and updated delete-account function from the Supabase repository.
See `Coconut/docs/hosted-web.md` for the ordered rollout, DNS/Pages configuration,
security boundaries and production acceptance checks. Future clients require
explicit frontend registration and backend authorization policies.

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

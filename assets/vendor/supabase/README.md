# Vendored Supabase JS

- Package: `@supabase/supabase-js`
- Version: `2.119.0`
- File: `dist/umd/supabase.js` from the published npm tarball
- SHA-256: `a867edbcfb029370aeec7223dd6180b560b621fbe3bc64c6584fb0369d1b7bce`
- License: MIT, see `LICENSE`

The browser bundle is served from this origin so the account page can use a
strict `script-src 'self'` Content Security Policy without trusting a CDN at
runtime.

To update, download the npm tarball for the chosen version, copy
`package/dist/umd/supabase.js` here with the version in its filename, copy
`package/LICENSE`, update the hash above, and update the script tag in
`account.html`.

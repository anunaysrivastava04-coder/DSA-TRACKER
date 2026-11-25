# DSA Tracker v2.1.1 — Security Hardening Report

Date: 2026-11-25  
Review basis: uploaded `DSA-Tracker-v2_1.zip`, hardening edits, unit/static checks. This is not a formal penetration test or a manual Chrome/Firefox test.

## Summary

The release copy includes several defensive improvements. The OAuth Client ID remains public by design and no Client Secret is used. A pattern scan found no apparent live PAT, OAuth access token, private key, or credential blob; test fixtures use fake token strings.

## Fixes applied

1. **Session-only bearer tokens:** OAuth/PAT bearer tokens use `chrome.storage.session` where available, and account metadata is stored in local storage without the token. Session tokens are cleared on disconnect and when the browser/extension session ends. Older plain/XOR token records migrate; the old local token and XOR key are removed during migration. XOR is no longer used for new token records. Compatibility fallback for environments without `storage.session` still stores the token in local extension storage.
2. **Session-only Device Flow codes:** pending device codes use session storage where supported; stale persistent device codes from older versions are removed.
3. **Trusted storage access:** the service worker sets local and session storage access levels to `TRUSTED_CONTEXTS` when the API is available, keeping content scripts out of credential storage.
4. **Message authorization:** sensitive actions are restricted to the exact extension popup URL. Sync/status messages are limited to top-frame content scripts from supported HTTPS problem pages; platform is derived from sender URL.
5. **Payload validation:** problem title/code/language/URL/slug/difficulty/timestamp are type/length checked. The payload URL must match the sender's origin and path and belong to a supported problem page.
6. **GitHub request destination:** bearer-token API requests are blocked unless the URL origin is exactly `https://api.github.com`, with HTTPS and no URL userinfo.
7. **Repository path validation:** repo owner/name, file paths, branch, commit message, and content size are validated before requests; file path segments are URL-encoded.
8. **PAT fallback reduction:** the fallback now accepts fine-grained PAT prefix `github_pat_` only and rejects classic PAT prefix `ghp_`. README and UI instructions recommend one-repository tokens with Contents read/write and Metadata read.
9. **Permission awareness:** UI and security docs explicitly disclose the broad OAuth `repo` scope. Chrome minimum version is set to 102 for session-storage support.
10. **Release hygiene:** `.gitignore` covers secret/config/local files; docs and tests were updated; added pure security-policy helper tests and session-storage tests.

## Remaining limitations / risks

- **High-impact residual: OAuth `repo` scope remains broad.** It can authorize access to private repositories for the connected account. It is retained to preserve private-repository creation and syncing. Eliminating this requires a product change (public-only `public_repo` scope) or a GitHub App/fine-grained architecture that limits repository access; this is not fully solved in this patch.
- **Tokens are not encrypted.** `storage.session` reduces persistence and is extension-context protected where supported, but malware, a compromised extension context, browser-profile access, or debugging access can still expose an active token. On unsupported storage APIs the compatibility fallback is local storage.
- **Disconnect is local cleanup, not remote revocation.** Users must revoke the OAuth/PAT at GitHub settings as well when they want the credential invalidated.
- **Content sites are still trusted sources.** DOM scraping can be manipulated by page content or a site compromise, potentially causing a bad/false solution sync; origin/path and payload checks reduce arbitrary-message abuse but cannot prove a solution was accepted.
- **Manual testing remains:** install in a real Chrome profile and test OAuth consent, repository selection, sync, disconnect, session restart/re-auth, and permissions. No independent penetration test was performed.

## Verification

- `npm test`: all parser, storage, GitHub, OAuth, session-storage mock, and sender/payload security tests pass.
- JavaScript syntax checks pass for project runtime scripts.
- Session-storage mock verifies token/device code placement, local token absence, disconnect cleanup, and legacy XOR migration.
- Security-helper tests verify popup-only privileged access, top-frame sender enforcement, supported exact hosts, problem URL binding, and payload bounds.
- GitHub client tests verify off-origin token requests are blocked before fetch and path traversal inputs are rejected.
- ZIP packaging verification is recorded with the release artifacts; `manifest.json` is at the extension ZIP root.

## Before publishing

- Check the OAuth App settings and confirm Device Flow is enabled.
- Confirm its Client ID matches the public ID in `auth.js`; do not add a Client Secret.
- Read the OAuth consent screen and verify `repo` scope is expected before connecting a test account.
- Install the extension manually in Chrome and run a test sync to a dedicated repo.
- Revoke your test account's authorization after testing if appropriate.

# Security Policy

DSA Tracker is a client-side Chrome extension. No security measure makes it unbreakable; report vulnerabilities responsibly and avoid posting exploit details publicly before a fix is available.


## Authentication and secrets
- The GitHub OAuth Client ID in `auth.js` is public by design. It is not a password or secret.
- OAuth Device Flow is used without a Client Secret. Do not add a Client Secret to extension files, source control, or release archives.
- Users authenticate with their own GitHub accounts. Never commit a personal access token (PAT), OAuth access token, device code, or private key.
- The OAuth scope currently requests `repo read:user`. The classic OAuth `repo` scope is broad and can grant access to private repositories. It is retained because the extension currently supports private repository creation/sync; least-privilege repository-scoped access would require migrating to a GitHub App/fine-grained authorization architecture. Users should review the authorization prompt and revoke access when no longer needed.
- The optional PAT fallback accepts fine-grained tokens (`github_pat_`) only; classic PATs are rejected. Limit the token to the single solution repository and Contents read/write. Do not paste tokens into issues, screenshots, logs, or shared files.

## Token storage
- GitHub bearer tokens are stored in `chrome.storage.session` when available, so they are cleared when the browser/extension session ends. Account display metadata is stored locally. Device-flow codes are also kept in session storage.
- Session storage is not encryption; a compromised extension context or browser profile may still access the token while the session is active. On browsers lacking `storage.session`, the compatibility fallback stores tokens in extension local storage.
- The background worker restricts local/session storage to trusted extension contexts where supported. Content scripts do not directly access credential storage.
- Legacy XOR-obfuscated tokens from earlier versions are migrated; XOR is not encryption and is no longer used for new credentials.
- Protect the OS/browser profile, disconnect and revoke GitHub authorization if the profile/device is lost or a token may have leaked. Users may need to reconnect after a browser session restarts.

## Message validation and permissions
- Privileged popup/background actions are restricted to the extension popup. Content-script status and sync requests require an allowed top-level HTTPS problem page, an exact supported host/platform match, and valid bounded payload fields. The platform is derived from the sender URL and the problem URL is checked before processing.
- Host permissions are limited to the supported coding sites and GitHub API/login domains. Review `manifest.json` before installation.

## Reporting
Please report security concerns to the project maintainer privately before opening a public issue. Do not include active tokens or private account data in reports.

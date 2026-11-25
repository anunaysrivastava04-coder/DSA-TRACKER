# Privacy Policy — DSA Tracker

Last updated: November 25, 2026


DSA Tracker is a browser extension that detects accepted coding-problem submissions on GeeksforGeeks, LeetCode, and HackerRank and can sync solution text and metadata to a GitHub repository selected by the user.


## Data handled
- GitHub OAuth access token or a GitHub Personal Access Token entered by the user, plus GitHub account/repository information needed to connect and sync.
- Problem title/URL, platform, difficulty, programming language, solution content, timestamps, and locally maintained statistics/queue/settings.

## Storage and transmission
- Account display metadata, settings, problem history, and pending sync data are stored locally in extension browser storage. GitHub bearer tokens and pending Device Flow codes use `chrome.storage.session` when supported and are cleared when the browser/extension session ends; unsupported-browser fallback may persist tokens in extension local storage.
- Solution content and related metadata are transmitted to GitHub through the official GitHub API when sync is enabled/triggered.
- The extension does not operate a DSA Tracker backend and does not intentionally send data to analytics or advertising services.
- Session tokens are not encrypted. A compromised extension context or browser profile can access them while present. Legacy XOR-obfuscated credentials are migrated; XOR was not encryption and is no longer used for new credentials.

## User control
- Users can disable the master switch or per-platform tracking, disconnect GitHub, and clear extension data by removing/resetting the extension.
- Users should review repository visibility before syncing. Public repositories make committed solutions and metadata publicly viewable.
- GitHub access can be revoked in GitHub account settings. Revoke access if a device is lost or credentials are suspected exposed.

## Third-party services
The extension interacts with the coding sites the user visits and GitHub's authentication/API services. Their privacy practices and terms apply to those services independently.

## Contact
For privacy or security questions, contact the project maintainer via the contact links in the repository README. Avoid sending tokens or sensitive solution/account data.

# Changelog

## 2.1.1 (security hardening)
- Bearer tokens and pending OAuth Device Flow codes use Chrome session storage when available; tokens clear when the browser session ends.
- Migrates legacy XOR token records; new tokens are no longer XOR-obfuscated.
- Restricts privileged messages to the popup and validates top-frame coding-site senders and sync payloads.
- Locks GitHub API requests to api.github.com and validates repository file paths/content size.
- Restricts PAT fallback to fine-grained PATs and documents the broad OAuth `repo` scope.
- Adds security-policy helper tests and session-storage tests.


## 2.1.0
- **New:** date and time of every solution shown in the GitHub README (Date + Time columns, Recent Solves list), in each file's header, in commit messages and in the success toast. Times use the solver's own timezone with an explicit UTC offset.
- **New:** master ON/OFF switch in the popup. OFF = no syncing, no queueing, manual button hidden, grey toolbar icon with an OFF badge. Turning it back ON flushes the offline queue.
- **New:** logo — green tile with yellow `< >` brackets and a check mark (icons + inline popup logo + OFF-state grey icons).
- **New:** yellow + green UI across the popup, on-page HUD, toasts and README badges; Last solved date/time in the dashboard.
- **Fix:** popup styles previously lived in two places (inline `<style>` and `popup.css`); now a single `popup.css`.
- Tests extended (date/time formatting, README columns, master switch, solve bookkeeping).

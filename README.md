# DSA Tracker — Sync GeeksforGeeks, LeetCode & HackerRank to GitHub

### 👨‍💻 Created by **Anunay Srivastava**

<p align="left">
  <a href="https://github.com/anunaysrivastava04-coder"><img src="https://img.shields.io/badge/GitHub-anunaysrivastava04--coder-181717?style=for-the-badge&logo=github" alt="GitHub" /></a>
  <a href="https://www.linkedin.com/in/anunay-srivastava-2638a1362/"><img src="https://img.shields.io/badge/LinkedIn-Anunay_Srivastava-0A66C2?style=for-the-badge&logo=linkedin" alt="LinkedIn" /></a>
  <a href="https://www.instagram.com/anunay_srivastava108"><img src="https://img.shields.io/badge/Instagram-@anunay__srivastava108-E4405F?style=for-the-badge&logo=instagram" alt="Instagram" /></a>
</p>

<p align="center">
  <strong>Automatically sync your accepted solutions from GeeksforGeeks, LeetCode and HackerRank to one GitHub repository — difficulty tagging, language detection, per-platform autosave toggles, and a live dashboard.</strong>
</p>

<p align="center">
  <img src="icons/icon128.png" width="80" alt="DSA Tracker Logo — a merged D + T monogram" />
</p>

---

DOWNLOAD LINK === https://github.com/anunaysrivastava04-coder/DSA-TRACKER/blob/main/DSA-Tracker-v2.1.1-extension.zip

## 🌟 Overview

**DSA Tracker** (v2.1) is a Google Chrome extension (Manifest V3) built by **Anunay Srivastava**. It bridges competitive programming across **three platforms** — GeeksforGeeks, LeetCode and HackerRank — with a single personal GitHub portfolio.

The moment you submit an accepted solution on any of the three sites, DSA Tracker automatically commits your code to your chosen GitHub repository, files it under that platform's folder and difficulty (`Easy` / `Medium` / `Hard`), attaches a metadata header, updates a combined `README.md` progress index, and keeps solve statistics — broken down per platform — right in the popup.

The logo is a monogram merging the letters **D** and **T**.

---

## 🧩 Supported Platforms

| Platform | Detection | Autosave toggle |
| :--- | :--- | :---: |
| 🟩 **GeeksforGeeks** | `geeksforgeeks.org` problem pages | ✅ Independent on/off switch |
| 🟧 **LeetCode** | `leetcode.com/problems/*` | ✅ Independent on/off switch |
| 🟩 **HackerRank** | `hackerrank.com/challenges/*` and contest challenge pages | ✅ Independent on/off switch |

Open the popup → **Platforms** card to connect or pause any of the three independently. Pausing a platform only stops *automatic* detection there — the floating **⚡ Save to GitHub** button on the page still lets you sync manually at any time.

---

## 📸 User Interface Design

- **Theme:** a yellow + green design system (light and dark), with a yellow-to-green accent bar.
- **Header:** "DSA" + "Tracker" wordmark next to the new `</>` ✓ logo, theme toggle, creator credit, and the **master ON/OFF switch**.
- **Authentication Screen:** GitHub Device Flow (recommended) or a Personal Access Token fallback — no server, no secrets.
- **Dashboard Screen:**
  - `DSA Problems Solved: X` (combined across all three platforms)
  - `Last solved:` date, time and UTC offset
  - Difficulty counters: 🟢 `Easy` | 🟡 `Medium` | 🔴 `Hard`
  - **Platforms card:** per-platform solved count + an on/off switch for GeeksforGeeks, LeetCode and HackerRank
  - **Autosave on Accept** master switch
  - Action toolbar: `Sync Now`, `Switch Repo`, `Disconnect`, Dark/Light mode toggle
  - Live sync status indicator, `Reset all stats`, and footer social links

---

## 🚀 Key Features

- **Multi-Platform Detection:** A single content script auto-detects which of the three sites it's running on (by exact hostname, never guessed) and uses that site's own selectors for title, difficulty, language and the submission result.
- **Automated Submission Detection:** A `MutationObserver` watches for each platform's own success wording (`"Problem Solved Successfully"` on GFG, `"Accepted"` on LeetCode, `"All tests passed"` on HackerRank) and ignores wrong answers, compile errors, and timeouts.
- **Master ON/OFF Switch:** One switch in the popup turns the whole extension on or off. While OFF nothing is synced or queued, the on-page ⚡ button is hidden, the HUD reads `Off`, and the toolbar icon turns grey with an `OFF` badge. Switching back ON immediately sends anything that was waiting in the queue.
- **Date & Time of Every Solution:** Each solve is stamped with the date, time and UTC offset of *your own* timezone (e.g. `25 Nov 2026, 01:33 PM (UTC+05:30)`):
  - a `📅 Date` and `🕐 Time` column in the GitHub README solutions table,
  - a `🕒 Recent Solves` list (last 5) in the README,
  - `Solved on / Solved at / Solved at (UTC)` lines in the header of every committed file,
  - the commit message and the in-page success toast.
- **Per-Platform Autosave Toggles:** Turn automatic syncing off for any one platform without touching the others or your GitHub connection.
- **Intelligent Deduplication:** The same problem slug on two different platforms (e.g. "Two Sum" on both LeetCode and GFG) is tracked as two distinct solves — never merged or double-counted.
- **Repository Automation:** Automatically creates a new repository (e.g. `DSA-Tracker-Solutions`) or links to any existing repository you own.
- **Directory Structure:** Organized first by platform, then by difficulty:
  ```text
  DSA-Tracker-Solutions/
  ├── GeeksforGeeks/
  │   ├── Easy/
  │   │   └── Two_Sum_Pairs_with_0_Sum.cpp
  │   └── Medium/
  │       └── Kadanes_Algorithm.py
  ├── LeetCode/
  │   ├── Easy/
  │   │   └── Two_Sum.py
  │   └── Hard/
  │       └── Word_Ladder_II.java
  ├── HackerRank/
  │   └── Easy/
  │       └── Simple_Array_Sum.cpp
  └── README.md
  ```
- **Language Detection & Extension Mapping:** C++ (`.cpp`), Java (`.java`), Python (`.py`), C (`.c`), JavaScript (`.js`), TypeScript (`.ts`), C# (`.cs`), Go (`.go`), Rust (`.rs`), Kotlin, Swift, Ruby, SQL dialects and more.
- **Code Metadata Comments:** Every committed file is headed with the problem title, source platform, URL, difficulty, language and solve timestamp, in the comment style of the file's own language.
- **Auto-Generated README Index:** A combined `README.md` table lists every solved problem with Platform, Date and Time columns, badges, and per-platform progress counts, plus the date and time each problem was solved.
- **Offline Sync Queue:** A solution synced while offline or before GitHub is connected is queued in `chrome.storage.local` and retried automatically.
- **Manual "Save to GitHub" Fallback:** A floating HUD pill (showing the current platform) with a one-click manual sync button, which works even when that platform's autosave is paused.
- **Hardened by design** — see [Security](#-security-model--hardening) below.

---

## 📁 Project Architecture

```text
dsa-tracker-extension/
├── manifest.json         # Chrome Extension Manifest V3 — 3 platforms, strict CSP
├── popup.html             # Popup markup (Auth, Repo Selection, Dashboard, Platforms)
├── popup.css              # Visual styling (Light & Dark themes, toggle switches)
├── popup.js               # Popup controller, UI state transitions, stats renderer
├── background.js          # Service worker: commits, dedup, sender verification, alarms
├── content.js             # Platform-aware content script: DOM observation, code extractor, HUD
├── content.css            # Styling for in-page status pill, toast alerts, manual button
├── github.js              # GitHub REST API v3 client (Base64 UTF-8, SHA, README, repos)
├── storage.js             # Local storage interface, stats recalculator, session token handling
├── problemParser.js       # Per-platform selectors, platform detection, sanitizers
├── security.js            # Testable sender-origin and payload security checks
├── auth.js                # GitHub Device Flow login & Personal Access Token (PAT) verifier
├── icons/                 # D+T monogram icon assets
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── tests/                 # Automated unit and integration test suite
│   ├── problemParser.test.js
│   ├── storage.test.js
│   ├── github.test.js
│   ├── auth.test.js
│   ├── sessionStorage.test.js
│   ├── security.test.js
│   └── run-tests.js
├── README.md              # Complete user and developer documentation
├── SECURITY.md            # Security policy and hardening details
├── PRIVACY.md             # Privacy and data handling policy
└── package.json           # Root package descriptor for npm test
```

---

## 🛠️ Installation & Setup Instructions

### Step 1: Load the Extension in Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the extracted `dsa-tracker-extension` project folder.
5. **DSA Tracker** will now appear in your Chrome toolbar. Pin it for quick access!

---

## 🔐 GitHub Authentication Setup

DSA Tracker supports two authentication methods:

### Method A: Authenticate with GitHub (recommended)

No server, no secrets, nothing to configure:

1. Open the DSA Tracker popup and click **Authenticate with GitHub**.
2. Click **Copy code & open GitHub**. The popup shows a short code such as `ABCD-1234`.
3. Paste the code on `github.com/login/device`, review the permissions and click **Authorize**.
4. Close the tab. DSA Tracker finishes signing in automatically in the background.

This uses GitHub's OAuth **Device Flow**, which needs only the public Client ID and **no Client Secret**, so there is nothing sensitive inside the extension.

To disconnect completely, click **Disconnect** in DSA Tracker and also revoke access at
[github.com/settings/applications](https://github.com/settings/applications).

### Method B: Fine-grained Personal Access Token (PAT) — Optional fallback

Use this only if OAuth Device Flow is unavailable. Prefer a fine-grained token restricted to the single repository used for solution syncing.

1. Open [GitHub Fine-grained Personal Access Tokens](https://github.com/settings/personal-access-tokens/new).
2. Set an expiration and choose **Only select repositories**; select your DSA solutions repository (create it first).
3. Grant only **Contents: Read and write**. Keep **Metadata: Read-only** (the default). Avoid extra permissions.
4. Create and copy the token. Do not save it in files, screenshots, or GitHub issues.
5. Open DSA Tracker → PAT fallback → paste it → Connect Token.

Classic PATs (`ghp_`) are rejected by this fallback because they commonly require broader access. The extension accepts fine-grained PATs (`github_pat_`) only. Tokens are session-scoped in supported browsers, but are not encrypted.

## 🧭 Connecting Each Platform

GitHub connection is shared, but **tracking** is per-platform:

1. Visit any problem page on **GeeksforGeeks**, **LeetCode**, or **HackerRank** — the floating DSA Tracker pill appears automatically; no separate "login" to these sites is needed since DSA Tracker only reads the page you already have open.
2. In the popup's **Platforms** card, flip a platform's switch **off** to pause automatic syncing there (e.g. if you only want LeetCode tracked for now), or back **on** to resume.
3. Solve a problem and submit — if that platform's switch (and the master **Autosave on Accept** switch) are on, it is committed to GitHub automatically the moment an accepted result is detected.

---

## 🧪 Testing the Extension

Run the full automated test suite (problem parsing across all 3 platforms, storage/dedup, GitHub formatting, auth):

```bash
npm test
```

or directly:

```bash
node tests/run-tests.js
```

---

## ❓ Troubleshooting & FAQs

| Issue | Resolution |
| :--- | :--- |
| **"GitHub authentication expired or invalid"** | Your token was revoked or expired. Disconnect from the popup and reconnect. |
| **"GitHub API rate limit exceeded"** | GitHub allows 5,000 requests/hour for authenticated users. DSA Tracker caches SHAs and minimizes requests. |
| **"Could not extract code from editor"** | Make sure your code is visible in the editor (Monaco/CodeMirror/Ace). Use the manual **⚡ Save to GitHub** button on the floating HUD. |
| **A platform isn't syncing automatically** | Check that both its switch and the **Autosave on Accept** switch are ON in the Platforms card. |
| **Offline submissions not syncing** | Queued locally; click **Sync Now** or wait for the automatic background retry. |

---

## 📜 Author & License

**Created with ❤️ by Anunay Srivastava**
- **GitHub:** [anunaysrivastava04-coder](https://github.com/anunaysrivastava04-coder)
- **LinkedIn:** [Anunay Srivastava](https://www.linkedin.com/in/anunay-srivastava-2638a1362/)
- **Instagram:** [@anunay_srivastava108](https://www.instagram.com/anunay_srivastava108)

MIT License. Developed for competitive programmers and developers.

---

## 🛡️ Security Model & Hardening

A full write-up of every measure (and its honest limits) lives in [`SECURITY.md`](SECURITY.md). Summary:

- **No secrets shipped.** The OAuth Client ID is public by design; no Client Secret is used or stored.
- **Device Flow** sends tokens straight from GitHub to your browser — no third-party server in between.
- **Session token storage:** tokens use `chrome.storage.session` where available and clear when the browser session ends; this is not encryption. Older XOR-obfuscated tokens migrate to session storage.
- **Verified senders only:** the background service worker only accepts sync requests from a content script actually running on one of the three supported hostnames — never from an arbitrary page or forged message.
- **Input sanitization everywhere a page can influence output:** problem titles and scraped text are stripped of control characters before they reach a filename, a commit message, or the README table, blocking path-traversal and table-injection attempts.
- **Strict CSP** blocks remote scripts in the extension's own pages.
- No system is "unhackable" or fully "AI-proof" — see `SECURITY.md` for what these measures do and do not protect against, and how to report a vulnerability.

## Download & install (unpacked Chrome extension)

1. Download the `DSA-Tracker-v2.1.1-extension.zip` asset from the project's GitHub Releases page.
2. Extract the ZIP. Confirm `manifest.json` is directly inside the extracted folder (not one folder deeper).
3. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select that extracted folder.
4. Open DSA Tracker, connect your own GitHub account, and choose a repository. Review the repository's visibility before syncing; public repositories publish your solutions.


## Security and privacy

Review [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md). The OAuth Client ID is public by design; never publish a Client Secret or personal access token. Tokens are session-scoped where supported, not encrypted, and compatibility fallback may persist them locally. The classic `repo` scope is broad and retained for private-repository support. The extension does not have a DSA Tracker server.


## Developer setup (GitHub source upload)

The real OAuth Client ID is intentionally not included in this source repository. This keeps it out of the GitHub source listing (it is a public identifier, not a secret). Before loading/building the extension locally:

1. Copy `oauth-config.example.js` to `oauth-config.js`.
2. Edit `oauth-config.js` and replace `YOUR_GITHUB_OAUTH_CLIENT_ID` with your OAuth App Client ID.
3. Load the project folder in Chrome (`chrome://extensions` → Developer mode → Load unpacked).

`oauth-config.js` is ignored by Git. **Important:** Client IDs cannot be hidden from people who install/download the extension; the ID will be present in their package. Never put an OAuth Client Secret or personal GitHub access token in this extension.

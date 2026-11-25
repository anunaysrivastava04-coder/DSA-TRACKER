/**
 * DSA Tracker - GitHub REST API Client
 * CREATED BY ANUNAY SRIVASTAVA
 * Handles GitHub user verification, repository management, file uploads/updates,
 * SHA conflict resolution, and automatic README generation.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DSAGitHub = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GITHUB_API_BASE = 'https://api.github.com';

  /**
   * ProblemParser provides the date/time formatting. Resolved lazily because
   * in the popup this file loads before problemParser.js.
   */
  function getParser() {
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      return require('./problemParser.js');
    }
    return (typeof self !== 'undefined' ? self : globalThis).ProblemParser;
  }

  /**
   * Safe UTF-8 to Base64 encoder (works in browsers, Web Workers, and Node.js)
   */
  function utf8ToBase64(str) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf-8').toString('base64');
    }
    // Browser / Worker
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Safe Base64 to UTF-8 decoder
   */
  function base64ToUtf8(b64) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(b64, 'base64').toString('utf-8');
    }
    const binary = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  function validateRepoPath(owner, repo, path, branch = 'main') {
    const validOwner = typeof owner === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner);
    const validRepo = typeof repo === 'string' && repo.length <= 100 && /^[A-Za-z0-9_.-]+$/.test(repo) && repo !== '.' && repo !== '..';
    if (!validOwner || !validRepo) throw new Error('Invalid repository identifier.');
    if (typeof path !== 'string' || !path || path.length > 500 || path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._ -]{1,120}$/.test(part))) {
      throw new Error('Invalid repository file path.');
    }
    if (typeof branch !== 'string' || !/^[A-Za-z0-9._/-]{1,250}$/.test(branch) || branch.startsWith('/') || branch.endsWith('/') || branch.includes('..') || branch.includes('//')) throw new Error('Invalid repository branch.');
  }

  /**
   * Common request helper with error normalization
   */
  async function request(endpoint, options = {}, token = null) {
    const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;
    // Never forward a bearer token to an arbitrary host, even if a future caller
    // passes an absolute URL by mistake. The client only talks to GitHub's API.
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { throw new Error('Invalid GitHub API URL.'); }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.origin !== GITHUB_API_BASE || parsedUrl.username || parsedUrl.password) {
      throw new Error('Blocked request outside the GitHub API origin.');
    }
    
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token.trim()}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const err = new Error(data && data.message ? data.message : `GitHub API error: ${response.status} ${response.statusText}`);
      err.status = response.status;
      err.data = data;
      
      // Check rate limit headers
      if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
        const resetEpoch = parseInt(response.headers.get('x-ratelimit-reset') || '0', 10);
        const resetDate = new Date(resetEpoch * 1000).toLocaleTimeString();
        err.message = `GitHub API rate limit exceeded. Resets at ${resetDate}.`;
      } else if (response.status === 401) {
        err.message = 'GitHub authentication expired or invalid. Please re-authenticate.';
      } else if (response.status === 404) {
        err.message = 'Requested repository or file not found on GitHub.';
      }

      throw err;
    }

    return data;
  }

  /**
   * Retrieve authenticated user profile
   */
  async function getUser(token) {
    const data = await request('/user', { method: 'GET' }, token);
    return {
      login: data.login,
      name: data.name || data.login,
      avatarUrl: data.avatar_url,
      htmlUrl: data.html_url,
      id: data.id
    };
  }

  /**
   * List repositories of authenticated user
   */
  async function getRepositories(token, perPage = 100) {
    const pageSize = Number.isInteger(perPage) ? Math.min(100, Math.max(1, perPage)) : 100;
    const data = await request(`/user/repos?sort=updated&per_page=${pageSize}&affiliation=owner`, { method: 'GET' }, token);
    return data.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch || 'main',
      htmlUrl: r.html_url,
      description: r.description
    }));
  }

  /**
   * Create a new repository on GitHub
   */
  async function createRepository(token, { name, isPrivate = false, description = '' }) {
    const normalizedName = typeof name === 'string' ? name.trim().replace(/\s+/g, '-') : '';
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(normalizedName) || normalizedName === '.' || normalizedName === '..') throw new Error('Repository name contains invalid characters.');
    const safeDescription = typeof description === 'string' ? description.slice(0, 350) : '';
    const body = {
      name: normalizedName,
      private: Boolean(isPrivate),
      description: safeDescription || 'Collection of GeeksforGeeks solutions synced automatically by DSA Tracker',
      auto_init: true
    };

    const data = await request('/user/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, token);

    return {
      name: data.name,
      fullName: data.full_name,
      owner: data.owner.login,
      private: data.private,
      defaultBranch: data.default_branch || 'main',
      htmlUrl: data.html_url
    };
  }

  /**
   * Verify repository exists and retrieve details
   */
  async function getRepository(token, owner, repo) {
    if (typeof owner !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || typeof repo !== 'string' || repo.length > 100 || !/^[A-Za-z0-9_.-]+$/.test(repo) || repo === '.' || repo === '..') throw new Error('Invalid repository identifier.');
    const data = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { method: 'GET' }, token);
    return {
      name: data.name,
      fullName: data.full_name,
      owner: data.owner.login,
      private: data.private,
      defaultBranch: data.default_branch || 'main',
      htmlUrl: data.html_url
    };
  }

  /**
   * Retrieve file contents and SHA
   */
  async function getFile(token, owner, repo, path, branch = 'main') {
    validateRepoPath(owner, repo, path, branch);
    try {
      const data = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`, { method: 'GET' }, token);
      return {
        sha: data.sha,
        content: data.content ? base64ToUtf8(data.content) : '',
        path: data.path,
        htmlUrl: data.html_url
      };
    } catch (err) {
      if (err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Create or update a file in repository
   */
  async function createOrUpdateFile(token, {
    owner,
    repo,
    path,
    content,
    commitMessage,
    branch = 'main',
    sha = null
  }) {
    validateRepoPath(owner, repo, path, branch);
    if (typeof content !== 'string' || content.length > 1000000) throw new Error('File content is invalid or too large.');
    if (commitMessage != null && (typeof commitMessage !== 'string' || commitMessage.length > 250)) throw new Error('Invalid commit message.');
    // If SHA is not provided, check if the file already exists to get its SHA
    let existingSha = sha;
    if (!existingSha) {
      const existingFile = await getFile(token, owner, repo, path, branch);
      if (existingFile) {
        existingSha = existingFile.sha;
      }
    }

    const payload = {
      message: commitMessage || `DSA Tracker: Solve ${path.split('/').pop()}`,
      content: utf8ToBase64(content),
      branch: branch
    };

    if (existingSha) {
      payload.sha = existingSha;
    }

    const data = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, token);

    return {
      path: data.content ? data.content.path : path,
      sha: data.content ? data.content.sha : null,
      htmlUrl: data.content ? data.content.html_url : null,
      commitSha: data.commit ? data.commit.sha : null,
      commitUrl: data.commit ? data.commit.html_url : null
    };
  }

  /**
   * Build clean Markdown content for repository README.md
   */
  const README_PLATFORM_LABELS = {
    gfg: 'GeeksforGeeks',
    leetcode: 'LeetCode',
    hackerrank: 'HackerRank'
  };
  const README_PLATFORM_ICONS = {
    gfg: '\ud83d\udfe9',        // green square
    leetcode: '\ud83d\udfe8',   // yellow square
    hackerrank: '\ud83d\udc9a'  // green heart
  };

  /**
   * Escape a value before it is placed inside a Markdown table cell, so a
   * problem title scraped from a third-party page can never break the
   * README's table layout or inject a fake extra column/row.
   */
  function escapeMarkdownCell(value) {
    if (!value) return '';
    return String(value)
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, ' ')
      .substring(0, 150);
  }

  /**
   * Date/time a problem was (last) solved, in the solver's own timezone.
   * Returns null when the record has no usable timestamp.
   */
  function solvedWhen(problem) {
    const ts = problem && Number(problem.lastSolvedAt);
    if (!ts || !Number.isFinite(ts)) return null;
    const offset = problem && Number.isFinite(problem.tzOffset) ? problem.tzOffset : undefined;
    return getParser().formatSolvedDateTime(ts, offset);
  }

  /** UTC offset of the most recently solved problem, so "Last Updated" matches the table. */
  function mostRecentOffset(problems, ts) {
    const match = problems.find((p) => Number(p.lastSolvedAt) === Number(ts) && Number.isFinite(p.tzOffset));
    return match ? match.tzOffset : undefined;
  }

  function generateReadmeContent(problemsMap, stats, repoOwner, repoName) {
    const problems = Object.values(problemsMap || {});
    // Sort by platform, then difficulty (Easy -> Medium -> Hard), then title
    const diffOrder = { Easy: 1, Medium: 2, Hard: 3 };
    problems.sort((a, b) => {
      const platComp = (a.platform || 'gfg').localeCompare(b.platform || 'gfg');
      if (platComp !== 0) return platComp;
      const diffComp = (diffOrder[a.difficulty] || 1) - (diffOrder[b.difficulty] || 1);
      if (diffComp !== 0) return diffComp;
      return (a.title || '').localeCompare(b.title || '');
    });

    const easyCount = stats?.easy || 0;
    const medCount = stats?.medium || 0;
    const hardCount = stats?.hard || 0;
    const totalCount = stats?.totalSolved || problems.length;
    const byPlatform = stats?.byPlatform || {};

    let tableRows = '';
    problems.forEach((p, index) => {
      const num = index + 1;
      const safeTitle = escapeMarkdownCell(p.title) || 'Untitled Problem';
      const platform = p.platform || 'gfg';
      const platformLabel = `${README_PLATFORM_ICONS[platform] || '\ud83d\udcc4'} ${README_PLATFORM_LABELS[platform] || 'Other'}`;
      const titleLink = p.url
        ? `[${safeTitle}](${encodeURI(p.url).replace(/\)/g, '%29')})`
        : safeTitle;
      const codeLink = p.path ? `[Solution](${encodeURI(p.path)})` : 'N/A';
      const diffBadge = p.difficulty === 'Hard' ? '\ud83d\udd34 Hard' : p.difficulty === 'Medium' ? '\ud83d\udfe1 Medium' : '\ud83d\udfe2 Easy';
      const when = solvedWhen(p);
      const dateCell = when ? when.date : '-';
      const timeCell = when ? `${when.time} (${when.tz})` : '-';
      tableRows += `| ${num} | ${platformLabel} | ${titleLink} | ${diffBadge} | ${escapeMarkdownCell(p.language) || 'Code'} | ${dateCell} | ${timeCell} | ${codeLink} |\n`;
    });

    if (problems.length === 0) {
      tableRows = '| - | - | No solutions synced yet | - | - | - | - | - |\n';
    }

    const lastTs = stats?.lastSyncTime || Date.now();
    const lastWhen = getParser().formatSolvedDateTime(lastTs, mostRecentOffset(problems, lastTs));
    const lastUpdated = lastWhen.full;

    // 5 most recent solves, newest first
    const recent = problems
      .filter((p) => Number(p.lastSolvedAt) > 0)
      .sort((a, b) => Number(b.lastSolvedAt) - Number(a.lastSolvedAt))
      .slice(0, 5);
    const recentLines = recent.map((p) => {
      const w = solvedWhen(p);
      const label = escapeMarkdownCell(p.title) || 'Untitled Problem';
      const plat = README_PLATFORM_LABELS[p.platform || 'gfg'] || 'Other';
      return `- **${w.date}, ${w.time}** (${w.tz}) \u2014 ${label} \u2022 ${plat}`;
    }).join('\n');
    const recentSection = recent.length
      ? `\n## \ud83d\udd52 Recent Solves\n\n${recentLines}\n\n---\n`
      : '';

    const platformSummary = Object.keys(README_PLATFORM_LABELS)
      .map((key) => `- ${README_PLATFORM_ICONS[key]} **${README_PLATFORM_LABELS[key]}:** ${byPlatform[key] || 0}`)
      .join('\n');

    return `# DSA Solutions

Synced automatically using [**DSA Tracker**](https://github.com/anunaysrivastava04-coder) \u2014 tracking GeeksforGeeks, LeetCode and HackerRank in one place.
**Created by [Anunay Srivastava](https://github.com/anunaysrivastava04-coder)** \u2022 [LinkedIn](https://www.linkedin.com/in/anunay-srivastava-2638a1362/) \u2022 [Instagram](https://www.instagram.com/anunay_srivastava108)

## \ud83d\udcca Summary

- **Total Solved:** ${totalCount}
- \ud83d\udfe2 **Easy:** ${easyCount}
- \ud83d\udfe1 **Medium:** ${medCount}
- \ud83d\udd34 **Hard:** ${hardCount}

**By Platform:**
${platformSummary}

- **Last Updated:** ${lastUpdated}

---
${recentSection}
## \ud83d\udcdd Solutions Index

| # | Platform | Problem Name | Difficulty | Language | \ud83d\udcc5 Date | \ud83d\udd50 Time | Solution |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
${tableRows}
---
*Automated with \u2764\ufe0f by [**DSA Tracker**](https://github.com/anunaysrivastava04-coder) \u2022 Created by [**Anunay Srivastava**](https://github.com/anunaysrivastava04-coder) ([LinkedIn](https://www.linkedin.com/in/anunay-srivastava-2638a1362/) \u2022 [Instagram](https://www.instagram.com/anunay_srivastava108)).*
`;
  }

  /**
   * Automatically update README.md in the repository
   */
  async function updateReadme(token, owner, repo, branch, problemsMap, stats) {
    const readmeContent = generateReadmeContent(problemsMap, stats, owner, repo);
    const existingReadme = await getFile(token, owner, repo, 'README.md', branch);
    
    return await createOrUpdateFile(token, {
      owner,
      repo,
      path: 'README.md',
      content: readmeContent,
      commitMessage: `DSA Tracker: Update README with solved stats (${stats?.totalSolved || 0} solved)`,
      branch,
      sha: existingReadme ? existingReadme.sha : null
    });
  }

  return {
    GITHUB_API_BASE,
    utf8ToBase64,
    base64ToUtf8,
    request,
    getUser,
    getRepositories,
    createRepository,
    getRepository,
    getFile,
    createOrUpdateFile,
    generateReadmeContent,
    updateReadme
  };
});

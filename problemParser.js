/**
 * DSA Tracker - Problem Parser & Metadata Extractor
 * CREATED BY ANUNAY SRIVASTAVA
 * Dedicated module for extracting and normalizing problem metadata across
 * GeeksforGeeks, LeetCode and HackerRank: detecting programming languages,
 * sanitizing filenames, formatting code headers, and hardening every value
 * that originates from a third-party page before it is ever written to disk,
 * committed to GitHub, or shown in the extension UI.
 *
 * Works in both browser environments (content script) and Node.js (unit tests).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js / CommonJS
    module.exports = factory();
  } else {
    // Browser global / ES module fallback
    root.ProblemParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Supported platforms
   */
  const PLATFORMS = {
    GFG: 'gfg',
    LEETCODE: 'leetcode',
    HACKERRANK: 'hackerrank'
  };

  const PLATFORM_LABELS = {
    [PLATFORMS.GFG]: 'GeeksforGeeks',
    [PLATFORMS.LEETCODE]: 'LeetCode',
    [PLATFORMS.HACKERRANK]: 'HackerRank'
  };

  /**
   * Detect which coding platform a URL belongs to. Only ever matches the
   * exact hostnames the extension is designed for - never a loose substring
   * check - so a malicious page cannot spoof a platform by embedding the
   * name in its own path or query string.
   */
  function detectPlatform(url) {
    if (!url || typeof url !== 'string') return null;
    let host = '';
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }

    if (host === 'www.geeksforgeeks.org' || host === 'practice.geeksforgeeks.org' || host === 'geeksforgeeks.org') {
      return PLATFORMS.GFG;
    }
    if (host === 'leetcode.com' || host === 'www.leetcode.com') {
      return PLATFORMS.LEETCODE;
    }
    if (host === 'www.hackerrank.com' || host === 'hackerrank.com') {
      return PLATFORMS.HACKERRANK;
    }
    return null;
  }

  /**
   * Per-platform DOM Selectors Configuration.
   * Kept in one central place to make updates easy if a site updates its UI.
   */
  const SELECTORS = {
    [PLATFORMS.GFG]: {
      title: [
        '[class*="header_content__title"] h3',
        '[class*="header_content__title"] h1',
        '[class*="problems_header_content__title"] h3',
        '.problem-tab__name',
        '.g-m-0.problem-title',
        'h1.problem-title',
        '.problems_header_content h3',
        '.problems_header_content h1'
      ],
      difficulty: [
        '[class*="problem-tab__difficulty"]',
        '[class*="difficulty"]',
        '[class*="problems_header_description"] span',
        '.problem-meta span',
        '.problems_header_content span'
      ],
      language: [
        '[class*="language-select"] .ant-select-selection-item',
        '[class*="select-language"]',
        '.select-language-dropdown',
        '[aria-label*="language"]',
        '.language-selection',
        '.ant-select-selection-item'
      ],
      resultContainer: [
        '[class*="problems_success"]',
        '[class*="problems_result"]',
        '.problems_footer_testcases__status',
        '[class*="testcases__status"]',
        '.problems_modal_content',
        '.output-container',
        '.console-output',
        '[class*="result_sheet"]'
      ],
      editor: ['.monaco-editor', '.ace_editor', '#ace-editor', '[class*="code-editor"]']
    },

    [PLATFORMS.LEETCODE]: {
      title: [
        '[data-cy="question-title"]',
        'div[class*="text-title-large"] a',
        'a[class*="no-underline"]',
        '.css-v3d350',
        'div[class*="question-title"]'
      ],
      difficulty: [
        'div[class*="text-difficulty"]',
        'div[diff]',
        'span[class*="Easy"]',
        'span[class*="Medium"]',
        'span[class*="Hard"]'
      ],
      language: [
        'button[id^="headlessui-listbox-button"]',
        '[data-cy="lang-select"]',
        'button[class*="lang-select"]',
        '.ant-select-selection-item'
      ],
      resultContainer: [
        '[data-e2e-locator="submission-result"]',
        'span[class*="text-green"]',
        'div[class*="result-state"]',
        '[data-e2e-locator="console-result"]'
      ],
      editor: ['.monaco-editor', '[class*="CodeMirror"]']
    },

    [PLATFORMS.HACKERRANK]: {
      title: [
        '.challenge-heading h1',
        '.ui-icon-label',
        'h1.challenge-title',
        '.hr_tag-contest-challenge-name',
        '.page-title'
      ],
      difficulty: [
        '.difficulty-tag',
        '.challenge-difficulty',
        '[class*="difficulty"]'
      ],
      language: [
        '#language-selector',
        '.select-language',
        'button[class*="language"]',
        '.cm-ib-fs-14'
      ],
      resultContainer: [
        '.status-wrapper',
        '.result-status',
        '.ui-message-text',
        '[class*="submission-status"]',
        '.hr_tag-test-case-status'
      ],
      editor: ['.monaco-editor', '.CodeMirror', '#codemirror-wrapper']
    }
  };

  /**
   * Language to File Extension & Comment Style Mapping
   */
  const LANGUAGE_MAP = {
    'c++': { ext: '.cpp', name: 'C++', commentStyle: 'block' },
    'cpp': { ext: '.cpp', name: 'C++', commentStyle: 'block' },
    'c++14': { ext: '.cpp', name: 'C++', commentStyle: 'block' },
    'c++17': { ext: '.cpp', name: 'C++', commentStyle: 'block' },
    'c++20': { ext: '.cpp', name: 'C++', commentStyle: 'block' },
    'java': { ext: '.java', name: 'Java', commentStyle: 'block' },
    'java7': { ext: '.java', name: 'Java', commentStyle: 'block' },
    'java8': { ext: '.java', name: 'Java', commentStyle: 'block' },
    'java11': { ext: '.java', name: 'Java', commentStyle: 'block' },
    'python': { ext: '.py', name: 'Python', commentStyle: 'hash' },
    'python3': { ext: '.py', name: 'Python3', commentStyle: 'hash' },
    'py': { ext: '.py', name: 'Python', commentStyle: 'hash' },
    'c': { ext: '.c', name: 'C', commentStyle: 'block' },
    'javascript': { ext: '.js', name: 'JavaScript', commentStyle: 'slash' },
    'js': { ext: '.js', name: 'JavaScript', commentStyle: 'slash' },
    'javascript_node': { ext: '.js', name: 'JavaScript', commentStyle: 'slash' },
    'typescript': { ext: '.ts', name: 'TypeScript', commentStyle: 'slash' },
    'ts': { ext: '.ts', name: 'TypeScript', commentStyle: 'slash' },
    'c#': { ext: '.cs', name: 'C#', commentStyle: 'block' },
    'csharp': { ext: '.cs', name: 'C#', commentStyle: 'block' },
    'golang': { ext: '.go', name: 'Go', commentStyle: 'block' },
    'go': { ext: '.go', name: 'Go', commentStyle: 'block' },
    'rust': { ext: '.rs', name: 'Rust', commentStyle: 'slash' },
    'php': { ext: '.php', name: 'PHP', commentStyle: 'slash' },
    'kotlin': { ext: '.kt', name: 'Kotlin', commentStyle: 'slash' },
    'scala': { ext: '.scala', name: 'Scala', commentStyle: 'slash' },
    'swift': { ext: '.swift', name: 'Swift', commentStyle: 'slash' },
    'ruby': { ext: '.rb', name: 'Ruby', commentStyle: 'hash' },
    'mysql': { ext: '.sql', name: 'MySQL', commentStyle: 'sql' },
    'mssql': { ext: '.sql', name: 'MSSQL', commentStyle: 'sql' },
    'oraclesql': { ext: '.sql', name: 'Oracle SQL', commentStyle: 'sql' },
    'postgresql': { ext: '.sql', name: 'PostgreSQL', commentStyle: 'sql' }
  };

  /**
   * Normalize difficulty text into 'Easy', 'Medium', or 'Hard'
   * Sites use labels like 'School', 'Basic', 'Easy', 'Medium', 'Hard'.
   */
  function normalizeDifficulty(rawDifficulty) {
    if (!rawDifficulty || typeof rawDifficulty !== 'string') {
      return 'Easy';
    }

    const cleaned = rawDifficulty.trim().toLowerCase();

    if (cleaned.includes('hard') || cleaned.includes('expert') || cleaned.includes('advanced')) {
      return 'Hard';
    }
    if (cleaned.includes('medium') || cleaned.includes('med') || cleaned.includes('moderate')) {
      return 'Medium';
    }
    if (cleaned.includes('easy') || cleaned.includes('basic') || cleaned.includes('school')) {
      return 'Easy';
    }

    return 'Easy';
  }

  /**
   * Normalize programming language to standard info
   */
  function normalizeLanguage(rawLang) {
    if (!rawLang || typeof rawLang !== 'string') {
      return { ext: '.cpp', name: 'C++', commentStyle: 'block' };
    }

    const key = rawLang.trim().toLowerCase().replace(/[\s\.\-]+/g, '');

    // 1. Try exact match first
    if (LANGUAGE_MAP[key]) {
      return LANGUAGE_MAP[key];
    }

    // 2. Try prefix match sorted by key length descending (longer first, e.g. javascript before java)
    const sortedKeys = Object.keys(LANGUAGE_MAP).sort((a, b) => b.length - a.length);
    for (const mapKey of sortedKeys) {
      if (key === mapKey || key.startsWith(mapKey)) {
        return LANGUAGE_MAP[mapKey];
      }
    }

    // Default fallback - sanitize the unknown label before using it anywhere
    return { ext: '.txt', name: sanitizeText(rawLang.trim(), 40) || 'Unknown', commentStyle: 'slash' };
  }

  /**
   * SECURITY: strip control characters, zero-width/invisible unicode, and
   * collapse length on any text that originates from a third-party web page
   * before it is embedded into a commit message, a file, or the README
   * table. This blocks prompt-injection style payloads (e.g. a problem
   * titled to contain fake instructions) and markdown/table-breaking
   * characters from ever reaching GitHub content or extension UI untouched.
   */
  function sanitizeText(input, maxLen = 200) {
    if (!input || typeof input !== 'string') return '';
    return input
      // Strip ASCII control chars and common zero-width/invisible unicode
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2060\uFEFF]/g, '')
      .replace(/\r\n|\r/g, '\n')
      .trim()
      .substring(0, maxLen);
  }

  /**
   * Sanitize problem title to a safe filename
   * Example: "Two Sum - Pairs with 0 Sum" -> "Two_Sum_Pairs_with_0_Sum"
   */
  function sanitizeTitleToFilename(title) {
    if (!title || typeof title !== 'string') {
      return 'Solution';
    }

    const safe = sanitizeText(title, 200);

    const result = safe
      // Remove leading number markings like "1. ", "Q1: "
      .replace(/^(\d+[\.\:\-\)]|\bQ\d+[\.\:\-]?)\s*/i, '')
      // Replace punctuation, slashes, dashes, path separators with spaces
      // (defends against path traversal such as "../../etc" in a title)
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      // Collapse multiple whitespace
      .trim()
      .replace(/\s+/g, '_')
      // Slice if too long
      .substring(0, 80);

    // Guard against empty, dot-only, or reserved names after sanitization
    if (!result || /^\.+$/.test(result)) {
      return 'Solution';
    }
    return result;
  }

  /**
   * Extract slug from a problem URL (GFG, LeetCode or HackerRank)
   */
  function extractSlugFromUrl(url) {
    if (!url || typeof url !== 'string') {
      return 'unknown-problem';
    }

    try {
      const parsed = new URL(url);
      // GFG: /problems/{slug}
      let match = parsed.pathname.match(/\/problems\/([^\/]+)/);
      if (match && match[1]) {
        return sanitizeText(match[1], 120);
      }
      // GFG batch/track path: /batch/{batch}/track/{track}/problem/{slug}
      match = parsed.pathname.match(/\/problem\/([^\/]+)/);
      if (match && match[1]) {
        return sanitizeText(match[1], 120);
      }
      // HackerRank: /challenges/{slug} or /contests/{c}/challenges/{slug}
      match = parsed.pathname.match(/\/challenges\/([^\/]+)/);
      if (match && match[1]) {
        return sanitizeText(match[1], 120);
      }
    } catch {
      // Fallback regex if URL parsing fails
      const fallbackMatch = url.match(/(?:problems|challenges)\/([a-zA-Z0-9\-]+)/);
      if (fallbackMatch && fallbackMatch[1]) {
        return sanitizeText(fallbackMatch[1], 120);
      }
    }

    return 'unknown-problem';
  }

  /**
   * Folder name used per platform in the GitHub repository, e.g.
   * "GeeksforGeeks/Easy/Two_Sum.cpp", "LeetCode/Medium/Two_Sum.cpp".
   */
  function getPlatformFolder(platform) {
    return PLATFORM_LABELS[platform] || 'Misc';
  }

  /**
   * Format repository file path based on platform, difficulty and title
   * Example: "LeetCode/Easy/Two_Sum_Pairs_with_0_Sum.cpp"
   */
  function getRepositoryFilePath(platform, difficulty, title, language) {
    const normDiff = normalizeDifficulty(difficulty);
    const safeTitle = sanitizeTitleToFilename(title);
    const langInfo = normalizeLanguage(language);
    const folder = getPlatformFolder(platform);

    return `${folder}/${normDiff}/${safeTitle}${langInfo.ext}`;
  }

  /**
   * Date & time helpers. Solutions are stamped with the solver's own local
   * time plus an explicit UTC offset (e.g. "UTC+05:30") so the README and the
   * code headers are unambiguous no matter where they are viewed from.
   */
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Local UTC offset (in minutes, east positive) of this device at the given instant. */
  function getLocalOffsetMinutes(timestamp) {
    const d = Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
    return -d.getTimezoneOffset();
  }

  /** 330 -> "UTC+05:30", 0 -> "UTC", -300 -> "UTC-05:00" */
  function formatOffsetLabel(offsetMinutes) {
    if (!Number.isFinite(offsetMinutes) || offsetMinutes === 0) return 'UTC';
    const sign = offsetMinutes > 0 ? '+' : '-';
    const abs = Math.abs(Math.round(offsetMinutes));
    return 'UTC' + sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60);
  }

  /**
   * Format a timestamp for display. offsetMinutes is the solver's UTC offset;
   * when omitted the current device's offset is used.
   * Returns { date, time, timeSeconds, tz, full, utc }.
   */
  function formatSolvedDateTime(timestamp, offsetMinutes) {
    const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
    const off = Number.isFinite(offsetMinutes) ? offsetMinutes : getLocalOffsetMinutes(ts);
    const d = new Date(ts + off * 60000);
    const hours24 = d.getUTCHours();
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    const date = pad2(d.getUTCDate()) + ' ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    const time = pad2(hours12) + ':' + pad2(d.getUTCMinutes()) + ' ' + ampm;
    const timeSeconds = pad2(hours12) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()) + ' ' + ampm;
    const tz = formatOffsetLabel(off);
    return {
      date,
      time,
      timeSeconds,
      tz,
      full: date + ', ' + time + ' (' + tz + ')',
      utc: new Date(ts).toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
    };
  }

  /**
   * Format metadata comment header for the solution code
   */
  function generateCodeHeader({ title, url, difficulty, language, timestamp, platform, tzOffset }) {
    const normDiff = normalizeDifficulty(difficulty);
    const langInfo = normalizeLanguage(language);
    const safeTitle = sanitizeText(title, 200) || 'Untitled Problem';
    const safeUrl = sanitizeText(url, 400);
    const sourceLabel = PLATFORM_LABELS[platform] || 'DSA Tracker';
    const when = formatSolvedDateTime(timestamp || Date.now(), tzOffset);

    const lines = [
      'Problem: ' + safeTitle,
      'Source: ' + sourceLabel,
      'URL: ' + safeUrl,
      'Difficulty: ' + normDiff,
      'Language: ' + langInfo.name,
      'Solved on: ' + when.date,
      'Solved at: ' + when.timeSeconds + ' (' + when.tz + ')',
      'Solved at (UTC): ' + when.utc,
      'Created by Anunay Srivastava',
      'Synced by: DSA Tracker'
    ];

    if (langInfo.commentStyle === 'hash') {
      return lines.map((l) => '# ' + l).concat(['', '']).join('\n');
    } else if (langInfo.commentStyle === 'sql') {
      return lines.map((l) => '-- ' + l).concat(['', '']).join('\n');
    } else if (langInfo.commentStyle === 'slash') {
      return lines.map((l) => '// ' + l).concat(['', '']).join('\n');
    } else {
      return ['/*'].concat(lines.map((l) => ' * ' + l)).concat([' */', '', '']).join('\n');
    }
  }

  /**
   * Check whether submission result text indicates an accepted solve.
   * Shared across platforms; platform-specific wording is included below.
   */
  function isSubmissionAccepted(resultText) {
    if (!resultText || typeof resultText !== 'string') {
      return false;
    }

    const lower = resultText.toLowerCase();

    // Rejection indicators - immediate disqualifiers
    const failureIndicators = [
      'wrong answer',
      'compilation error',
      'compile error',
      'time limit exceeded',
      'runtime error',
      'memory limit exceeded',
      'segmentation fault',
      'failed',
      'partially solved',
      'terminated due to timeout'
    ];

    for (const fail of failureIndicators) {
      if (lower.includes(fail)) {
        return false;
      }
    }

    // Success indicators (GFG, LeetCode, HackerRank wording combined)
    const successIndicators = [
      'problem solved successfully', // GFG
      'correct answer',
      'all test cases passed',
      'passed 100/100',
      'accuracy: 100%',
      'total points scored',
      'submission successful',
      'accepted',                    // LeetCode
      'all tests passed',            // HackerRank
      'great job',                   // HackerRank success toast
      'test case(s) passed'
    ];

    for (const succ of successIndicators) {
      if (lower.includes(succ)) {
        return true;
      }
    }

    return false;
  }

  return {
    PLATFORMS,
    PLATFORM_LABELS,
    SELECTORS,
    LANGUAGE_MAP,
    detectPlatform,
    normalizeDifficulty,
    normalizeLanguage,
    sanitizeText,
    sanitizeTitleToFilename,
    extractSlugFromUrl,
    getPlatformFolder,
    getRepositoryFilePath,
    getLocalOffsetMinutes,
    formatOffsetLabel,
    formatSolvedDateTime,
    generateCodeHeader,
    isSubmissionAccepted
  };
});

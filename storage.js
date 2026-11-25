/**
 * DSA Tracker - Storage Management
 * CREATED BY ANUNAY SRIVASTAVA
 * Provides safe, persistent access to chrome.storage.local for credentials,
 * statistics, solved problem registry, offline queue, and user preferences.
 * Includes in-memory mock fallback for Node.js unit tests.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DSAStorage = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // In-memory fallback storage if running in Node.js or without chrome.storage
  let memStore = {};

  const STORAGE_KEYS = {
    AUTH: 'dsatracker_auth',
    DEVICE_KEY: 'dsatracker_device_key',
    PENDING_DEVICE: 'dsatracker_pending_device',
    REPO: 'dsatracker_repo',
    STATS: 'dsatracker_stats',
    PROBLEMS: 'dsatracker_problems',
    QUEUE: 'dsatracker_sync_queue',
    SETTINGS: 'dsatracker_settings'
  };

  // Default per-platform autosave toggles. All three start ON - the user
  // can disable auto-tracking for any one of them independently from the
  // popup without affecting the other two or the GitHub connection.
  const DEFAULT_PLATFORMS = {
    gfg: true,
    leetcode: true,
    hackerrank: true
  };

  const DEFAULT_SETTINGS = {
    theme: 'light',
    enabled: true, // master ON/OFF switch for the whole extension
    autoSync: true,
    includeMetadata: true,
    generateReadme: true,
    createdBy: 'Anunay Srivastava',
    platforms: { ...DEFAULT_PLATFORMS },
    socialLinks: {
      github: 'https://github.com/anunaysrivastava04-coder',
      linkedin: 'https://www.linkedin.com/in/anunay-srivastava-2638a1362/',
      instagram: 'https://www.instagram.com/anunay_srivastava108',
      website: 'https://geeksforgeeks.org'
    }
  };

  const DEFAULT_STATS = {
    totalSolved: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    byLanguage: {},
    byPlatform: {},
    lastSyncTime: null
  };

  /**
   * Safe getter from chrome.storage.local
   */
  async function getFromStorage(key, defaultValue = null) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.error('Storage get error:', chrome.runtime.lastError);
            resolve(defaultValue);
          } else {
            resolve(result[key] !== undefined ? result[key] : defaultValue);
          }
        });
      });
    } else {
      // Memory mock
      return memStore[key] !== undefined ? memStore[key] : defaultValue;
    }
  }

  /**
   * Safe setter to chrome.storage.local
   */
  async function setToStorage(key, value) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    } else {
      // Memory mock
      memStore[key] = value;
    }
  }

  /**
   * Safe remover from chrome.storage.local
   */
  async function removeFromStorage(key) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.remove([key], () => {
          resolve();
        });
      });
    } else {
      delete memStore[key];
    }
  }

  // --- Auth API ---
  // Chrome storage.local is extension-private by default, but background.js also
  // restricts it to TRUSTED_CONTEXTS. Keep long-lived account metadata local,
  // while keeping the OAuth/PAT bearer token in storage.session when supported.
  // Session storage is cleared when the browser session ends. It is not
  // encryption: a compromised extension context/profile can still access it.
  const SESSION_TOKEN_KEY = 'dsatracker_session_token';

  function hasSessionStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session;
  }

  async function getSessionToken() {
    if (hasSessionStorage()) {
      return await new Promise((resolve) => {
        chrome.storage.session.get([SESSION_TOKEN_KEY], (result) => {
          if (chrome.runtime && chrome.runtime.lastError) resolve(null);
          else resolve(result[SESSION_TOKEN_KEY] || null);
        });
      });
    }
    return memStore[SESSION_TOKEN_KEY] || null;
  }

  async function setSessionToken(token) {
    if (hasSessionStorage()) {
      return await new Promise((resolve, reject) => {
        chrome.storage.session.set({ [SESSION_TOKEN_KEY]: token }, () => {
          if (chrome.runtime && chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    }
    memStore[SESSION_TOKEN_KEY] = token;
  }

  async function clearSessionToken() {
    if (hasSessionStorage()) {
      return await new Promise((resolve) => {
        chrome.storage.session.remove([SESSION_TOKEN_KEY], () => resolve());
      });
    }
    delete memStore[SESSION_TOKEN_KEY];
  }

  // Decode legacy XOR-obfuscated records from versions <= 2.1, then migrate
  // them into session storage (where supported) and remove the old local key.
  function decodeLegacyToken(stored, key) {
    const keyBytes = [];
    for (let i = 0; i < key.length; i += 2) keyBytes.push(parseInt(key.slice(i, i + 2), 16));
    const binary = typeof Buffer !== 'undefined'
      ? Buffer.from(stored, 'base64').toString('binary')
      : atob(stored);
    let out = '';
    for (let i = 0; i < binary.length; i++) out += String.fromCharCode(binary.charCodeAt(i) ^ keyBytes[i % keyBytes.length]);
    return out;
  }

  async function getAuth() {
    const stored = await getFromStorage(STORAGE_KEYS.AUTH, null);
    if (!stored) return null;

    // New format: metadata in local storage, bearer token in session storage.
    if (stored.tokenStorage === 'session') {
      const token = await getSessionToken();
      return token ? { ...stored, token } : { ...stored, token: null };
    }

    // Migrate old plain/XOR records in-place. If session storage exists, the
    // credential becomes session-only; otherwise we preserve legacy persistence.
    if (stored.token) {
      let token = stored.token;
      if (stored.tokenObfuscated) {
        const key = await getFromStorage(STORAGE_KEYS.DEVICE_KEY, null);
        if (typeof key !== 'string' || !/^(?:[a-f0-9]{2})+$/i.test(key)) return null;
        try { token = decodeLegacyToken(stored.token, key); } catch { return null; }
      }
      if (hasSessionStorage()) {
        await setSessionToken(token);
        const metadata = { ...stored, tokenStorage: 'session' };
        delete metadata.token;
        delete metadata.tokenObfuscated;
        await setToStorage(STORAGE_KEYS.AUTH, metadata);
        await removeFromStorage(STORAGE_KEYS.DEVICE_KEY);
        return { ...metadata, token };
      }
      if (stored.tokenObfuscated) {
        const migrated = { ...stored, token, tokenStorage: 'local' };
        delete migrated.tokenObfuscated;
        await setToStorage(STORAGE_KEYS.AUTH, migrated);
        await removeFromStorage(STORAGE_KEYS.DEVICE_KEY);
        return migrated;
      }
      return { ...stored, token };
    }
    return stored;
  }

  async function setAuth(authData) {
    if (!authData || !authData.token) {
      await clearSessionToken();
      await setToStorage(STORAGE_KEYS.AUTH, authData);
      return;
    }
    if (hasSessionStorage()) {
      await setSessionToken(authData.token);
      const metadata = { ...authData, tokenStorage: 'session' };
      delete metadata.token;
      delete metadata.tokenObfuscated;
      await setToStorage(STORAGE_KEYS.AUTH, metadata);
      await removeFromStorage(STORAGE_KEYS.DEVICE_KEY);
    } else {
      // Compatibility fallback for browsers lacking storage.session. The token
      // is stored plain in extension storage; no fake encryption is claimed.
      await setToStorage(STORAGE_KEYS.AUTH, { ...authData, tokenStorage: 'local' });
    }
  }

  async function clearAuth() {
    await clearSessionToken();
    await removeFromStorage(STORAGE_KEYS.AUTH);
    await removeFromStorage(STORAGE_KEYS.DEVICE_KEY);
  }

  // --- Pending OAuth Device Flow API ---

  async function getPendingDevice() {
    if (hasSessionStorage()) {
      const pending = await new Promise((resolve) => {
        chrome.storage.session.get([STORAGE_KEYS.PENDING_DEVICE], (result) => {
          if (chrome.runtime && chrome.runtime.lastError) resolve(null);
          else resolve(result[STORAGE_KEYS.PENDING_DEVICE] || null);
        });
      });
      // Discard stale device-code secrets left by previous persistent-storage versions.
      await removeFromStorage(STORAGE_KEYS.PENDING_DEVICE);
      return pending;
    }
    return await getFromStorage(STORAGE_KEYS.PENDING_DEVICE, null);
  }

  async function setPendingDevice(data) {
    if (hasSessionStorage()) {
      return await new Promise((resolve, reject) => {
        chrome.storage.session.set({ [STORAGE_KEYS.PENDING_DEVICE]: data }, () => {
          if (chrome.runtime && chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    }
    await setToStorage(STORAGE_KEYS.PENDING_DEVICE, data);
  }

  async function clearPendingDevice() {
    if (hasSessionStorage()) {
      return await new Promise((resolve) => {
        chrome.storage.session.remove([STORAGE_KEYS.PENDING_DEVICE], () => resolve());
      }).then(() => removeFromStorage(STORAGE_KEYS.PENDING_DEVICE));
    }
    await removeFromStorage(STORAGE_KEYS.PENDING_DEVICE);
  }

  // --- Repo API ---

  async function getRepo() {
    return await getFromStorage(STORAGE_KEYS.REPO, null);
  }

  async function setRepo(repoData) {
    await setToStorage(STORAGE_KEYS.REPO, repoData);
  }

  async function clearRepo() {
    await removeFromStorage(STORAGE_KEYS.REPO);
  }

  // --- Problems Registry & Deduplication API ---

  async function getProblems() {
    return await getFromStorage(STORAGE_KEYS.PROBLEMS, {});
  }

  /**
   * Recalculates stats from the ground truth problem records.
   * Guarantees unique counts without double counting or inflation.
   */
  function recalculateStats(problemsMap) {
    const stats = {
      totalSolved: 0,
      easy: 0,
      medium: 0,
      hard: 0,
      byLanguage: {},
      byPlatform: {},
      lastSyncTime: null
    };

    if (!problemsMap || typeof problemsMap !== 'object') {
      return stats;
    }

    const problemList = Object.values(problemsMap);
    stats.totalSolved = problemList.length;

    for (const prob of problemList) {
      const diff = (prob.difficulty || 'Easy').toLowerCase();
      if (diff === 'hard') {
        stats.hard += 1;
      } else if (diff === 'medium') {
        stats.medium += 1;
      } else {
        stats.easy += 1;
      }

      if (prob.language) {
        stats.byLanguage[prob.language] = (stats.byLanguage[prob.language] || 0) + 1;
      }

      const platformKey = prob.platform || 'gfg';
      stats.byPlatform[platformKey] = (stats.byPlatform[platformKey] || 0) + 1;

      if (prob.lastSolvedAt) {
        if (!stats.lastSyncTime || prob.lastSolvedAt > stats.lastSyncTime) {
          stats.lastSyncTime = prob.lastSolvedAt;
        }
      }
    }

    return stats;
  }

  /**
   * Record a solved problem.
   * Returns: { isNew: boolean, stats: object, problem: object }
   */
  async function recordSolvedProblem(problemPayload) {
    const problems = await getProblems();
    const slug = problemPayload.slug || problemPayload.id;

    if (!slug) {
      throw new Error('Problem slug is required for tracking');
    }

    const platform = problemPayload.platform || 'gfg';
    // Keyed by platform + slug so the same slug on two different sites
    // (e.g. "two-sum" on both LeetCode and GFG) is never merged as one record.
    const key = `${platform}:${slug}`;

    const isNew = !problems[key];
    const existing = problems[key] || {};
    const solvedAt = problemPayload.timestamp || Date.now();

    const updatedProblem = {
      id: key,
      slug: slug,
      platform,
      title: problemPayload.title,
      difficulty: problemPayload.difficulty,
      language: problemPayload.language,
      path: problemPayload.path,
      url: problemPayload.url,
      lastSolvedAt: solvedAt,
      // First time this problem was ever synced (kept across re-submissions)
      firstSolvedAt: existing.firstSolvedAt || existing.lastSolvedAt || solvedAt,
      // Solver's UTC offset (minutes) when solved, so the GitHub README shows their local time
      tzOffset: Number.isFinite(problemPayload.tzOffset) ? problemPayload.tzOffset : (Number.isFinite(existing.tzOffset) ? existing.tzOffset : null),
      sha: problemPayload.sha || existing.sha || null,
      submissionCount: (existing.submissionCount || 0) + 1
    };

    problems[key] = updatedProblem;
    await setToStorage(STORAGE_KEYS.PROBLEMS, problems);

    // Recalculate clean statistics
    const stats = recalculateStats(problems);
    await setToStorage(STORAGE_KEYS.STATS, stats);

    return {
      isNew,
      stats,
      problem: updatedProblem
    };
  }

  async function getStats() {
    const stats = await getFromStorage(STORAGE_KEYS.STATS, null);
    if (!stats) {
      const problems = await getProblems();
      const recalculated = recalculateStats(problems);
      await setToStorage(STORAGE_KEYS.STATS, recalculated);
      return recalculated;
    }
    return stats;
  }

  /**
   * Resets all solved statistics and problem history.
   * Keeps authentication and repository configuration intact.
   */
  async function resetAllStats() {
    await setToStorage(STORAGE_KEYS.PROBLEMS, {});
    const cleanStats = { ...DEFAULT_STATS };
    await setToStorage(STORAGE_KEYS.STATS, cleanStats);
    await setToStorage(STORAGE_KEYS.QUEUE, []);
    return cleanStats;
  }

  // --- Offline Sync Queue API ---

  async function getSyncQueue() {
    return await getFromStorage(STORAGE_KEYS.QUEUE, []);
  }

  async function addToSyncQueue(item) {
    const queue = await getSyncQueue();
    // Avoid exact duplicate payloads in queue
    const exists = queue.some((q) => q.slug === item.slug && q.code === item.code);
    if (!exists) {
      queue.push({
        ...item,
        queuedAt: Date.now(),
        attempts: 0
      });
      await setToStorage(STORAGE_KEYS.QUEUE, queue);
    }
    return queue;
  }

  async function updateSyncQueue(queue) {
    await setToStorage(STORAGE_KEYS.QUEUE, queue);
  }

  async function clearSyncQueue() {
    await setToStorage(STORAGE_KEYS.QUEUE, []);
  }

  // --- Settings API ---

  async function getSettings() {
    const stored = await getFromStorage(STORAGE_KEYS.SETTINGS, null);
    if (!stored) return { ...DEFAULT_SETTINGS, platforms: { ...DEFAULT_PLATFORMS } };
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      platforms: { ...DEFAULT_PLATFORMS, ...(stored.platforms || {}) }
    };
  }

  async function updateSettings(partialSettings) {
    const current = await getSettings();
    const updated = {
      ...current,
      ...partialSettings,
      platforms: {
        ...current.platforms,
        ...((partialSettings && partialSettings.platforms) || {})
      }
    };
    await setToStorage(STORAGE_KEYS.SETTINGS, updated);
    return updated;
  }

  // --- Per-platform autosave toggle API ---
  // Lets the popup present one on/off switch each for GFG, LeetCode and
  // HackerRank, independent of the single shared GitHub connection.

  async function getPlatformEnabled(platform) {
    const settings = await getSettings();
    return settings.platforms[platform] !== false;
  }

  async function setPlatformEnabled(platform, enabled) {
    const settings = await getSettings();
    const platforms = { ...settings.platforms, [platform]: Boolean(enabled) };
    return await updateSettings({ platforms });
  }

  // --- Master ON/OFF switch ---

  async function isEnabled() {
    const settings = await getSettings();
    return settings.enabled !== false;
  }

  async function setEnabled(enabled) {
    return await updateSettings({ enabled: Boolean(enabled) });
  }

  // Debug & Testing helper: resets memory store
  function _resetMemoryStore() {
    memStore = {};
  }

  return {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    DEFAULT_PLATFORMS,
    DEFAULT_STATS,
    getAuth,
    setAuth,
    clearAuth,
    getPendingDevice,
    setPendingDevice,
    clearPendingDevice,
    getRepo,
    setRepo,
    clearRepo,
    getProblems,
    recordSolvedProblem,
    getStats,
    recalculateStats,
    resetAllStats,
    getSyncQueue,
    addToSyncQueue,
    updateSyncQueue,
    clearSyncQueue,
    getSettings,
    updateSettings,
    getPlatformEnabled,
    setPlatformEnabled,
    isEnabled,
    setEnabled,
    _resetMemoryStore
  };
});

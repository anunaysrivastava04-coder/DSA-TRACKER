/**
 * DSA Tracker - Service Worker (Background Script)
 * CREATED BY ANUNAY SRIVASTAVA
 * Manages runtime message handling, solution commits to GitHub,
 * deduplication, statistics, offline retry queue, and notification dispatch.
 */

/* global importScripts, ProblemParser, DSAStorage, DSAGitHub, DSAAuth */
importScripts('oauth-config.js', 'problemParser.js', 'security.js', 'storage.js', 'github.js', 'auth.js');

// Restrict chrome.storage.local to trusted extension contexts (popup/background).
// Content scripts do not need direct credential-storage access; they communicate
// with the background worker through the narrowly validated message handlers.
if (chrome.storage && chrome.storage.local && typeof chrome.storage.local.setAccessLevel === 'function') {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
}
if (chrome.storage && chrome.storage.session && typeof chrome.storage.session.setAccessLevel === 'function') {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
}

const ICONS_ON = { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };
const ICONS_OFF = { 16: 'icons/off/icon16.png', 32: 'icons/off/icon32.png', 48: 'icons/off/icon48.png', 128: 'icons/off/icon128.png' };

// Set up periodic sync check alarm for pending queue
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('dsatracker_queue_retry', { periodInMinutes: 5 });
  updateBadge();
});

// Restore the correct badge/icon whenever the browser starts or the worker wakes
chrome.runtime.onStartup.addListener(() => updateBadge());
updateBadge();

// Update toolbar badge + icon: solved count when ON, grey "OFF" when switched off
async function updateBadge() {
  try {
    const enabled = await DSAStorage.isEnabled();
    if (!enabled) {
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
      if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: '#ffffff' });
      chrome.action.setIcon({ path: ICONS_OFF });
      chrome.action.setTitle({ title: 'DSA Tracker (OFF)' });
      return;
    }
    const stats = await DSAStorage.getStats();
    const count = stats && stats.totalSolved ? String(stats.totalSolved) : '';
    chrome.action.setBadgeText({ text: count });
    chrome.action.setBadgeBackgroundColor({ color: '#facc15' }); // DSA Tracker yellow
    if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: '#14532d' }); // deep green
    chrome.action.setIcon({ path: ICONS_ON });
    chrome.action.setTitle({ title: 'DSA Tracker' });
  } catch (err) {
    console.warn('Failed to update badge:', err);
  }
}

// React to the master switch / settings being changed from the popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.dsatracker_settings) return;
  const before = changes.dsatracker_settings.oldValue;
  const after = changes.dsatracker_settings.newValue;
  updateBadge();
  // Just switched back ON -> push anything that queued up while it was off
  const wasOff = before && before.enabled === false;
  const isOn = !after || after.enabled !== false;
  if (wasOff && isOn) {
    flushSyncQueue().catch((e) => console.warn('Queue flush after enabling failed:', e && e.message));
  }
});

/**
 * Show a system notification
 */
function showNotification(title, message, isError = false) {
  if (chrome.notifications && chrome.notifications.create) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: title || 'DSA Tracker',
      message: message || '',
      priority: isError ? 2 : 1
    });
  }
}

/**
 * Core submission sync handler
 */
async function handleSubmissionSync(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid submission payload.');
  }
  const { title, slug, url, difficulty, language, code } = payload;

  if (!isValidSubmissionPayload(payload)) {
    throw new Error('Invalid or unsupported problem submission.');
  }

  // MASTER SWITCH: when the extension is OFF nothing is synced and nothing is
  // queued (the user explicitly asked for it to be inactive).
  if (!(await DSAStorage.isEnabled())) {
    throw new Error('DSA Tracker is turned OFF. Switch it ON in the extension popup to sync.');
  }

  // Solve time & the solver's UTC offset (kept with the record so GitHub
  // always shows the date/time in the solver's own timezone).
  const solvedAt = Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now();
  const tzOffset = ProblemParser.getLocalOffsetMinutes(solvedAt);
  const solvedWhen = ProblemParser.formatSolvedDateTime(solvedAt, tzOffset);

  // SECURITY: the platform must be one of the three known values resolved
  // from the sender's own URL (see isAllowedSyncSender below) - never trust
  // a free-text platform string. Falls back to 'gfg' only for legacy queued
  // items that predate multi-platform support.
  const knownPlatforms = Object.values(ProblemParser.PLATFORMS);
  const platform = knownPlatforms.includes(payload.platform) ? payload.platform : 'gfg';

  if (!code || typeof code !== 'string' || !code.trim()) {
    throw new Error('Solution code is empty or missing.');
  }
  // Defensive cap: a legitimate solution file is never anywhere near this
  // size; this blocks a malformed/huge DOM scrape from ever reaching GitHub.
  if (code.length > 200000) {
    throw new Error('Extracted code is unexpectedly large and was not synced.');
  }

  const auth = await DSAStorage.getAuth();
  if (!auth || !auth.token) {
    // Queue the submission so the user can sync once authenticated
    await DSAStorage.addToSyncQueue(payload);
    throw new Error('GitHub is not authenticated. Submission queued for sync.');
  }

  const repo = await DSAStorage.getRepo();
  if (!repo || !repo.name) {
    await DSAStorage.addToSyncQueue(payload);
    throw new Error('No GitHub repository selected. Submission queued for sync.');
  }

  const settings = await DSAStorage.getSettings();

  // 1. Format file path and comment header (sanitized - see problemParser.js)
  const normDiff = ProblemParser.normalizeDifficulty(difficulty);
  const repoFilePath = ProblemParser.getRepositoryFilePath(platform, normDiff, title, language);

  let finalCode = code;
  if (settings.includeMetadata) {
    const header = ProblemParser.generateCodeHeader({
      title,
      url,
      difficulty: normDiff,
      language,
      timestamp: solvedAt,
      platform,
      tzOffset
    });
    // Prepend header if not already present
    if (!finalCode.includes('Synced by: DSA Tracker')) {
      finalCode = header + finalCode;
    }
  }

  // 2. Commit file to GitHub
  const safeTitle = ProblemParser.sanitizeText(title, 120) || 'Untitled Problem';
  const commitMessage = `DSA Tracker: Solve ${safeTitle} [${normDiff}] (${ProblemParser.PLATFORM_LABELS[platform]}) - ${solvedWhen.full}`;
  const uploadResult = await DSAGitHub.createOrUpdateFile(auth.token, {
    owner: repo.owner,
    repo: repo.name,
    path: repoFilePath,
    content: finalCode,
    commitMessage,
    branch: repo.branch || 'main'
  });

  // 3. Record in storage (with deduplication)
  const recordResult = await DSAStorage.recordSolvedProblem({
    platform,
    slug: slug || ProblemParser.extractSlugFromUrl(url),
    title,
    difficulty: normDiff,
    language,
    path: repoFilePath,
    url,
    timestamp: solvedAt,
    sha: uploadResult.sha,
    tzOffset
  });

  // 4. Update README if enabled
  if (settings.generateReadme) {
    try {
      const allProblems = await DSAStorage.getProblems();
      await DSAGitHub.updateReadme(
        auth.token,
        repo.owner,
        repo.name,
        repo.branch || 'main',
        allProblems,
        recordResult.stats
      );
    } catch (readmeErr) {
      console.warn('DSA Tracker: Optional README update failed:', readmeErr.message);
    }
  }

  // 5. Update UI badge & notification
  await updateBadge();

  showNotification(
    'DSA Tracker: Solution Synced!',
    `"${title}" [${normDiff}] pushed to ${repo.name}/${repoFilePath} on ${solvedWhen.full}`
  );

  return {
    success: true,
    isNewSolve: recordResult.isNew,
    filePath: repoFilePath,
    solvedAt,
    solvedAtText: solvedWhen.full,
    commitUrl: uploadResult.commitUrl || `${repo.url}/blob/${repo.branch || 'main'}/${repoFilePath}`,
    stats: recordResult.stats
  };
}

/**
 * Flush any queued submissions
 */
async function flushSyncQueue() {
  if (!(await DSAStorage.isEnabled())) {
    return { processed: 0, failed: 0, reason: 'Extension is OFF' };
  }
  const queue = await DSAStorage.getSyncQueue();
  if (!queue || queue.length === 0) {
    return { processed: 0, failed: 0 };
  }

  const auth = await DSAStorage.getAuth();
  const repo = await DSAStorage.getRepo();
  if (!auth || !repo) {
    return { processed: 0, failed: queue.length, reason: 'Auth or Repo missing' };
  }

  let processed = 0;
  const remainingQueue = [];

  for (const item of queue) {
    try {
      await handleSubmissionSync(item);
      processed++;
    } catch (err) {
      console.warn('Queued sync failed; item will be retried if eligible.');
      item.attempts = (item.attempts || 0) + 1;
      item.lastError = err.message;
      if (item.attempts < 5) {
        remainingQueue.push(item);
      }
    }
  }

  await DSAStorage.updateSyncQueue(remainingQueue);
  return { processed, failed: remainingQueue.length };
}


// ---------------------------------------------------------------------------
// GitHub Device Flow poller
// Runs in the service worker so login completes even if the popup closes
// (the popup closes as soon as the user switches to the GitHub tab).
// ---------------------------------------------------------------------------
const DEVICE_ALARM = 'dsatracker_device_poll';
let devicePollRunning = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDevicePollLoop() {
  if (devicePollRunning) return;
  devicePollRunning = true;
  try {
    chrome.alarms.create(DEVICE_ALARM, { periodInMinutes: 0.5 }); // revives the loop if the worker is suspended
    while (true) {
      const pending = await DSAStorage.getPendingDevice();
      if (!pending) break;

      const result = await DSAAuth.pollDeviceFlowOnce();
      if (result.status === 'success') {
        await updateBadge();
        showNotification('DSA Tracker connected', `Signed in to GitHub as @${result.auth.username}.`);
        break;
      }
      if (result.status !== 'pending') break;

      const latest = await DSAStorage.getPendingDevice();
      if (!latest) break;
      await sleep(Math.max(1000, latest.nextPollAt - Date.now()) + 250);
    }
  } catch (err) {
    console.warn('DSA Tracker: device flow polling stopped:', err && err.message);
  } finally {
    devicePollRunning = false;
    const stillPending = await DSAStorage.getPendingDevice();
    if (!stillPending) chrome.alarms.clear(DEVICE_ALARM);
  }
}

// Resume automatically whenever the service worker wakes up
DSAStorage.getPendingDevice().then((p) => {
  if (p) runDevicePollLoop();
});

// Message origin/payload policy is centralized in security.js and unit-tested.
function isExtensionPage(sender) {
  return DSASecurity.isExtensionPopup(sender, chrome.runtime.id, chrome.runtime.getURL('popup.html'));
}
const PRIVILEGED_ACTIONS = new Set([
  'DEVICE_FLOW_START', 'DEVICE_FLOW_STATUS', 'DEVICE_FLOW_CANCEL',
  'RESET_STATS', 'FLUSH_QUEUE', 'SYNC_NOW', 'GET_STATUS', 'UPDATE_BADGE'
]);
function isAllowedSyncSender(sender) {
  return DSASecurity.isAllowedSyncSender(sender, chrome.runtime.id, ProblemParser.detectPlatform);
}
function isValidSubmissionPayload(payload, expectedPlatform = null, senderUrl = null) {
  return DSASecurity.isValidSubmissionPayload(payload, expectedPlatform, senderUrl, ProblemParser.detectPlatform);
}

// Alarm listener for periodic offline queue processing
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dsatracker_queue_retry') {
    await flushSyncQueue();
  } else if (alarm.name === DEVICE_ALARM) {
    const pending = await DSAStorage.getPendingDevice();
    if (pending) {
      runDevicePollLoop();
    } else {
      chrome.alarms.clear(DEVICE_ALARM);
    }
  }
});

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    return false;
  }

  if (PRIVILEGED_ACTIONS.has(message.action) && !isExtensionPage(sender)) {
    sendResponse({ success: false, error: 'Not allowed.' });
    return false;
  }
  if (message.action === 'GET_PLATFORM_STATUS') {
    const senderPlatform = isAllowedSyncSender(sender) ? ProblemParser.detectPlatform(sender.url) : null;
    if (!senderPlatform || message.platform !== senderPlatform) {
      sendResponse({ success: false, error: 'Not allowed.' });
      return false;
    }
  }

  (async () => {
    try {
      switch (message.action) {
        case 'DEVICE_FLOW_START': {
          const pending = await DSAAuth.startDeviceFlow();
          runDevicePollLoop();
          // The secret device_code never leaves the background worker
          sendResponse({
            success: true,
            data: { userCode: pending.userCode, verificationUri: pending.verificationUri, expiresAt: pending.expiresAt }
          });
          break;
        }

        case 'DEVICE_FLOW_STATUS': {
          const pending = await DSAStorage.getPendingDevice();
          if (pending) runDevicePollLoop();
          sendResponse({
            success: true,
            data: pending
              ? { userCode: pending.userCode, verificationUri: pending.verificationUri, expiresAt: pending.expiresAt }
              : null
          });
          break;
        }

        case 'DEVICE_FLOW_CANCEL': {
          await DSAAuth.cancelDeviceFlow();
          sendResponse({ success: true });
          break;
        }

        case 'SYNC_SUBMISSION': {
          if (!isAllowedSyncSender(sender)) {
            sendResponse({ success: false, error: 'Not allowed.' });
            break;
          }
          // Lock the platform to what the sender's own URL resolves to -
          // never trust the platform value embedded in the message payload.
          const senderPlatform = ProblemParser.detectPlatform(sender.url);
          if (!isValidSubmissionPayload(message.payload, senderPlatform, sender.url)) {
            sendResponse({ success: false, error: 'Invalid submission data.' });
            break;
          }
          const result = await handleSubmissionSync({ ...message.payload, platform: senderPlatform });
          sendResponse({ success: true, data: result });
          break;
        }

        case 'GET_PLATFORM_STATUS': {
          const settings = await DSAStorage.getSettings();
          const platformEnabled = await DSAStorage.getPlatformEnabled(ProblemParser.detectPlatform(sender.url));
          const extensionEnabled = settings.enabled !== false;
          // Automatic syncing needs: master switch ON + the global autosave
          // switch ON + this platform's own switch ON.
          sendResponse({
            success: true,
            data: {
              extensionEnabled,
              autoSave: extensionEnabled && settings.autoSync !== false && platformEnabled
            }
          });
          break;
        }

        case 'FLUSH_QUEUE':
        case 'SYNC_NOW': {
          const result = await flushSyncQueue();
          sendResponse({ success: true, data: result });
          break;
        }

        case 'GET_STATUS': {
          const auth = await DSAStorage.getAuth();
          const repo = await DSAStorage.getRepo();
          const stats = await DSAStorage.getStats();
          const queue = await DSAStorage.getSyncQueue();
          const settings = await DSAStorage.getSettings();
          sendResponse({
            success: true,
            data: {
              enabled: settings.enabled !== false,
              isAuthenticated: Boolean(auth && auth.token),
              username: auth ? auth.username : null,
              repo: repo || null,
              stats: stats,
              platforms: settings.platforms,
              pendingQueueCount: queue.length
            }
          });
          break;
        }

        case 'RESET_STATS': {
          const cleanStats = await DSAStorage.resetAllStats();
          await updateBadge();
          sendResponse({ success: true, data: cleanStats });
          break;
        }

        case 'UPDATE_BADGE': {
          await updateBadge();
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown action: ${message.action}` });
      }
    } catch (error) {
      console.warn('Background action failed:', message.action, error && error.name ? error.name : 'Error');
      sendResponse({ success: false, error: error.message || 'An unexpected error occurred.' });
    }
  })();

  // Return true to indicate asynchronous response
  return true;
});

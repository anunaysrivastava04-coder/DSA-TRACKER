/**
 * DSA Tracker - Popup Controller
 * CREATED BY ANUNAY SRIVASTAVA
 * Manages view switching (Auth, Repo Selection, Dashboard),
 * user authentication (OAuth & PAT), statistics display, and GitHub repository configuration.
 */

/* global DSAStorage, DSAGitHub, DSAAuth, ProblemParser */

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // --- DOM Elements ---
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const alertBanner = document.getElementById('alertBanner');
  const alertMessage = document.getElementById('alertMessage');
  const alertCloseBtn = document.getElementById('alertCloseBtn');

  // Master ON/OFF switch
  const toggleMaster = document.getElementById('toggleMaster');
  const masterStateText = document.getElementById('masterStateText');
  const masterSubText = document.getElementById('masterSubText');
  const lastSolvedText = document.getElementById('lastSolvedText');

  // Header Repo Link
  const headerRepoContainer = document.getElementById('headerRepoContainer');
  const headerRepoLink = document.getElementById('headerRepoLink');

  // Views
  const authView = document.getElementById('authView');
  const repoView = document.getElementById('repoView');
  const dashboardView = document.getElementById('dashboardView');

  // Auth Controls
  const oauthLoginBtn = document.getElementById('oauthLoginBtn');
  const deviceBox = document.getElementById('deviceBox');
  const deviceCode = document.getElementById('deviceCode');
  const deviceOpenBtn = document.getElementById('deviceOpenBtn');
  const deviceStatus = document.getElementById('deviceStatus');
  const deviceCancelBtn = document.getElementById('deviceCancelBtn');
  const togglePatBtn = document.getElementById('togglePatBtn');
  const patForm = document.getElementById('patForm');
  const patInput = document.getElementById('patInput');
  const patSubmitBtn = document.getElementById('patSubmitBtn');

  // Repo Setup Controls
  const repoUsername = document.getElementById('repoUsername');
  const radioRepoCreate = document.getElementById('radioRepoCreate');
  const radioRepoExisting = document.getElementById('radioRepoExisting');
  const createRepoFields = document.getElementById('createRepoFields');
  const existingRepoFields = document.getElementById('existingRepoFields');
  const newRepoName = document.getElementById('newRepoName');
  const existingRepoSelect = document.getElementById('existingRepoSelect');
  const saveRepoBtn = document.getElementById('saveRepoBtn');
  const cancelRepoBtn = document.getElementById('cancelRepoBtn');

  // Dashboard Controls & Stats
  const totalSolvedCount = document.getElementById('totalSolvedCount');
  const easyCount = document.getElementById('easyCount');
  const mediumCount = document.getElementById('mediumCount');
  const hardCount = document.getElementById('hardCount');
  const resetStatsBtn = document.getElementById('resetStatsBtn');
  const syncNowBtn = document.getElementById('syncNowBtn');
  const changeRepoBtn = document.getElementById('changeRepoBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const syncStatusDot = document.getElementById('syncStatusDot');
  const syncStatusText = document.getElementById('syncStatusText');

  // Platform toggles (connect/pause auto-tracking for each site independently)
  const togglePlatformGfg = document.getElementById('togglePlatformGfg');
  const togglePlatformLeetcode = document.getElementById('togglePlatformLeetcode');
  const togglePlatformHackerrank = document.getElementById('togglePlatformHackerrank');
  const toggleAutosave = document.getElementById('toggleAutosave');
  const gfgPlatformCount = document.getElementById('gfgPlatformCount');
  const leetcodePlatformCount = document.getElementById('leetcodePlatformCount');
  const hackerrankPlatformCount = document.getElementById('hackerrankPlatformCount');

  // Modal
  const confirmModal = document.getElementById('confirmModal');
  const cancelResetBtn = document.getElementById('cancelResetBtn');
  const confirmResetBtn = document.getElementById('confirmResetBtn');

  // --- State Variables ---
  let currentAuth = null;
  let currentRepo = null;

  // --- View Switcher ---
  function showView(viewName) {
    hideAlert();
    authView.classList.add('hidden');
    repoView.classList.add('hidden');
    dashboardView.classList.add('hidden');

    if (viewName === 'auth') {
      authView.classList.remove('hidden');
      headerRepoContainer.classList.add('hidden');
    } else if (viewName === 'repo') {
      repoView.classList.remove('hidden');
      headerRepoContainer.classList.add('hidden');
    } else if (viewName === 'dashboard') {
      dashboardView.classList.remove('hidden');
      headerRepoContainer.classList.remove('hidden');
    }
  }

  // Hide non-active views immediately
  showView('auth');

  // --- Alert System ---
  function showAlert(msg, isSuccess = false) {
    alertBanner.className = `alert-banner ${isSuccess ? 'success' : ''}`;
    alertMessage.textContent = msg;
    alertBanner.classList.remove('hidden');
  }

  function hideAlert() {
    alertBanner.classList.add('hidden');
    alertMessage.textContent = '';
  }

  alertCloseBtn.addEventListener('click', hideAlert);

  // --- Theme Management ---
  async function initTheme() {
    try {
      const settings = await DSAStorage.getSettings();
      document.body.setAttribute('data-theme', settings.theme || 'light');
    } catch {
      document.body.setAttribute('data-theme', 'light');
    }
  }

  themeToggleBtn.addEventListener('click', async () => {
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    try {
      await DSAStorage.updateSettings({ theme: newTheme });
    } catch {
      // Ignore in non-extension environments
    }
  });

  // --- Master ON / OFF switch ---
  let extensionOn = true;

  function applyMasterState(enabled) {
    extensionOn = enabled !== false;
    toggleMaster.checked = extensionOn;
    document.body.classList.toggle('ext-off', !extensionOn);
    masterStateText.textContent = extensionOn ? 'ON' : 'OFF';
    masterSubText.textContent = extensionOn
      ? 'Solutions sync to GitHub automatically'
      : 'Paused \u2014 nothing will be synced to GitHub';
    if (!extensionOn && syncStatusText) {
      syncStatusDot.style.backgroundColor = '#9ca3af';
      syncStatusText.textContent = 'Status: OFF';
    }
  }

  async function initMaster() {
    try {
      applyMasterState(await DSAStorage.isEnabled());
    } catch {
      applyMasterState(true);
    }
  }

  toggleMaster.addEventListener('change', async () => {
    const wantOn = toggleMaster.checked;
    try {
      await DSAStorage.setEnabled(wantOn);
      applyMasterState(wantOn);
      showAlert(wantOn ? 'DSA Tracker is ON. Solutions will sync to GitHub.' : 'DSA Tracker is OFF. Nothing will be synced.', true);
      refreshSyncStatus();
    } catch (err) {
      applyMasterState(!wantOn); // revert on failure
      showAlert(`Could not change ON/OFF state: ${err.message}`);
    }
  });

  // Keep the switch in sync if the setting changes elsewhere
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[DSAStorage.STORAGE_KEYS.SETTINGS]) {
        const next = changes[DSAStorage.STORAGE_KEYS.SETTINGS].newValue;
        const enabled = !next || next.enabled !== false;
        if (enabled !== extensionOn) applyMasterState(enabled);
      }
    });
  }

  // Query the service worker for queue / ON-OFF status and update the status card
  function refreshSyncStatus() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
    try {
      chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (res) => {
        if (chrome.runtime.lastError) return;
        if (res && res.data) {
          const queueCount = res.data.pendingQueueCount || 0;
          if (res.data.enabled === false) {
            syncStatusDot.style.backgroundColor = '#9ca3af';
            syncStatusText.textContent = 'Status: OFF';
          } else if (queueCount > 0) {
            syncStatusDot.style.backgroundColor = '#eab308';
            syncStatusText.textContent = `Status: ${queueCount} queued`;
          } else {
            syncStatusDot.style.backgroundColor = '#16a34a';
            syncStatusText.textContent = 'Status: Synced ✓';
          }
        }
      });
    } catch {
      // Ignore communication error
    }
  }

  // --- Dashboard Data Loading ---
  async function loadDashboard() {
    showView('dashboard');

    if (currentRepo) {
      headerRepoLink.textContent = `${currentRepo.owner}/${currentRepo.name}`;
      const fallbackRepoUrl = `https://github.com/${encodeURIComponent(currentRepo.owner || '')}/${encodeURIComponent(currentRepo.name || '')}`;
      let safeRepoUrl = fallbackRepoUrl;
      try {
        const candidate = new URL(currentRepo.url);
        if (candidate.origin === 'https://github.com' && /^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(candidate.pathname)) {
          safeRepoUrl = candidate.href;
        }
      } catch { /* use generated GitHub URL */ }
      headerRepoLink.href = safeRepoUrl;
    }

    try {
      const stats = await DSAStorage.getStats();
      totalSolvedCount.textContent = `${stats.totalSolved || 0}`;
      easyCount.textContent = `${stats.easy || 0}`;
      mediumCount.textContent = `${stats.medium || 0}`;
      hardCount.textContent = `${stats.hard || 0}`;

      if (stats.lastSyncTime) {
        const when = ProblemParser.formatSolvedDateTime(stats.lastSyncTime);
        lastSolvedText.textContent = '';
        const label = document.createTextNode('Last solved: ');
        const strong = document.createElement('strong');
        strong.textContent = when.full;
        lastSolvedText.appendChild(label);
        lastSolvedText.appendChild(strong);
      } else {
        lastSolvedText.textContent = 'No solutions synced yet';
      }

      const byPlatform = stats.byPlatform || {};
      gfgPlatformCount.textContent = `${byPlatform.gfg || 0} solved`;
      leetcodePlatformCount.textContent = `${byPlatform.leetcode || 0} solved`;
      hackerrankPlatformCount.textContent = `${byPlatform.hackerrank || 0} solved`;
    } catch (err) {
      console.warn('Could not load stats:', err);
    }

    try {
      const settings = await DSAStorage.getSettings();
      togglePlatformGfg.checked = settings.platforms.gfg !== false;
      togglePlatformLeetcode.checked = settings.platforms.leetcode !== false;
      togglePlatformHackerrank.checked = settings.platforms.hackerrank !== false;
      toggleAutosave.checked = settings.autoSync !== false;
    } catch (err) {
      console.warn('Could not load platform settings:', err);
    }

    refreshSyncStatus();
  }

  // --- Repo Setup View ---
  async function loadRepoSetup() {
    showView('repo');
    repoUsername.textContent = `@${currentAuth.username}`;

    existingRepoSelect.innerHTML = '<option value="">Loading repositories...</option>';
    try {
      const repos = await DSAGitHub.getRepositories(currentAuth.token);
      existingRepoSelect.innerHTML = '';
      if (repos.length === 0) {
        existingRepoSelect.innerHTML = '<option value="">No repositories found</option>';
      } else {
        repos.forEach((r) => {
          const opt = document.createElement('option');
          opt.value = r.name;
          opt.textContent = `${r.fullName} ${r.private ? '(Private)' : ''}`;
          existingRepoSelect.appendChild(opt);
        });
      }
    } catch (err) {
      existingRepoSelect.innerHTML = '<option value="">Error loading repositories</option>';
      showAlert(`Could not fetch repositories: ${err.message}`);
    }
  }

  // Repo View Radio Logic
  radioRepoCreate.addEventListener('change', () => {
    createRepoFields.classList.remove('hidden');
    existingRepoFields.classList.add('hidden');
  });

  radioRepoExisting.addEventListener('change', () => {
    createRepoFields.classList.add('hidden');
    existingRepoFields.classList.remove('hidden');
  });

  // Save / Create Repo Action
  saveRepoBtn.addEventListener('click', async () => {
    hideAlert();
    saveRepoBtn.disabled = true;
    saveRepoBtn.textContent = 'Setting up...';

    try {
      const isCreateMode = radioRepoCreate.checked;
      let selectedRepoData = null;

      if (isCreateMode) {
        const repoName = newRepoName.value.trim();
        if (!repoName) {
          throw new Error('Please enter a repository name.');
        }

        const isPrivate = document.querySelector('input[name="repoPrivacy"]:checked').value === 'private';
        const created = await DSAGitHub.createRepository(currentAuth.token, {
          name: repoName,
          isPrivate
        });

        selectedRepoData = {
          owner: created.owner,
          name: created.name,
          fullName: created.fullName,
          branch: created.defaultBranch || 'main',
          url: created.htmlUrl
        };
      } else {
        const repoName = existingRepoSelect.value;
        if (!repoName) {
          throw new Error('Please select an existing repository from the list.');
        }

        const details = await DSAGitHub.getRepository(currentAuth.token, currentAuth.username, repoName);
        selectedRepoData = {
          owner: details.owner,
          name: details.name,
          fullName: details.fullName,
          branch: details.defaultBranch || 'main',
          url: details.htmlUrl
        };
      }

      await DSAStorage.setRepo(selectedRepoData);
      currentRepo = selectedRepoData;
      showAlert('Repository connected successfully!', true);
      setTimeout(() => loadDashboard(), 600);
    } catch (err) {
      showAlert(err.message);
    } finally {
      saveRepoBtn.disabled = false;
      saveRepoBtn.textContent = 'Save and Get Started';
    }
  });

  cancelRepoBtn.addEventListener('click', async () => {
    await DSAAuth.disconnect();
    currentAuth = null;
    currentRepo = null;
    showView('auth');
  });

  // --- Authentication Actions ---

  // --- GitHub Device Flow (OAuth) ---
  let deviceFlow = null; // { userCode, verificationUri, expiresAt }
  let deviceTimer = null;

  function sendBg(action) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res || !res.success) return reject(new Error((res && res.error) || 'Request failed.'));
        resolve(res.data);
      });
    });
  }

  function showDeviceBox(flow) {
    deviceFlow = flow;
    deviceCode.textContent = flow.userCode;
    oauthLoginBtn.classList.add('hidden');
    deviceBox.classList.remove('hidden');
    clearInterval(deviceTimer);
    const tick = () => {
      const secs = Math.max(0, Math.round((flow.expiresAt - Date.now()) / 1000));
      deviceStatus.textContent = `Waiting for approval on GitHub… (code expires in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')})`;
      if (secs === 0) hideDeviceBox();
    };
    tick();
    deviceTimer = setInterval(tick, 1000);
  }

  function hideDeviceBox() {
    clearInterval(deviceTimer);
    deviceTimer = null;
    deviceFlow = null;
    deviceBox.classList.add('hidden');
    oauthLoginBtn.classList.remove('hidden');
  }

  oauthLoginBtn.addEventListener('click', async () => {
    hideAlert();
    oauthLoginBtn.disabled = true;
    try {
      const flow = await sendBg('DEVICE_FLOW_START');
      showDeviceBox(flow);
    } catch (err) {
      showAlert(err.message);
    } finally {
      oauthLoginBtn.disabled = false;
    }
  });

  deviceOpenBtn.addEventListener('click', async () => {
    if (!deviceFlow) return;
    try {
      await navigator.clipboard.writeText(deviceFlow.userCode);
    } catch {
      // Clipboard may be unavailable; the code is still shown and selectable
    }
    chrome.tabs.create({ url: deviceFlow.verificationUri });
  });

  deviceCancelBtn.addEventListener('click', async () => {
    try {
      await sendBg('DEVICE_FLOW_CANCEL');
    } catch {
      // ignore
    }
    hideDeviceBox();
  });

  // The background worker finishes the login; react when it stores the token
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local') return;
      if (changes[DSAStorage.STORAGE_KEYS.AUTH] && changes[DSAStorage.STORAGE_KEYS.AUTH].newValue) {
        hideDeviceBox();
        await checkAuthAndRoute();
      } else if (
        changes[DSAStorage.STORAGE_KEYS.PENDING_DEVICE] &&
        !changes[DSAStorage.STORAGE_KEYS.PENDING_DEVICE].newValue &&
        deviceFlow
      ) {
        const auth = await DSAStorage.getAuth();
        if (!auth) {
          hideDeviceBox();
          showAlert('GitHub authorization expired or was cancelled. Please try again.');
        }
      }
    });
  }

  // PAT Accordion Toggle
  togglePatBtn.addEventListener('click', () => {
    patForm.classList.toggle('hidden');
    if (!patForm.classList.contains('hidden')) {
      patInput.focus();
    }
  });

  // PAT Submit
  patSubmitBtn.addEventListener('click', async () => {
    hideAlert();
    const token = patInput.value.trim();
    if (!token) {
      showAlert('Please enter your GitHub token.');
      return;
    }

    patSubmitBtn.disabled = true;
    patSubmitBtn.textContent = 'Verifying...';

    try {
      const authRecord = await DSAAuth.authenticatePAT(token);
      currentAuth = authRecord;
      patInput.value = '';
      showAlert(`Authenticated as @${authRecord.username}!`, true);
      await checkAuthAndRoute();
    } catch (err) {
      showAlert(err.message);
    } finally {
      patSubmitBtn.disabled = false;
      patSubmitBtn.innerHTML = '<span>Connect Token</span><span>→</span>';
    }
  });

  // --- Dashboard Actions ---

  // Reset Stats Modal
  resetStatsBtn.addEventListener('click', () => {
    confirmModal.classList.remove('hidden');
  });

  cancelResetBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
  });

  confirmResetBtn.addEventListener('click', async () => {
    confirmModal.classList.add('hidden');
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'RESET_STATS' }, resolve);
        });
      } else {
        await DSAStorage.resetAllStats();
      }
      showAlert('All statistics have been reset.', true);
      await loadDashboard();
    } catch (err) {
      showAlert(`Reset failed: ${err.message}`);
    }
  });

  // Sync Now Button
  syncNowBtn.addEventListener('click', async () => {
    hideAlert();
    syncNowBtn.disabled = true;
    syncNowBtn.innerHTML = '<span>Syncing...</span>';
    syncStatusDot.style.backgroundColor = '#facc15';
    syncStatusText.textContent = 'Status: Syncing...';

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const res = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'SYNC_NOW' }, resolve);
        });

        if (res && res.success && res.data && res.data.reason === 'Extension is OFF') {
          showAlert('DSA Tracker is OFF. Turn it ON to sync.');
        } else if (res && res.success) {
          showAlert('Sync complete!', true);
        } else {
          showAlert(res?.error || 'Sync encountered an issue.');
        }
      } else {
        showAlert('Sync complete!', true);
      }
      await loadDashboard();
    } catch (err) {
      showAlert(err.message);
    } finally {
      syncNowBtn.disabled = false;
      syncNowBtn.innerHTML = '<span>⚡ Sync Now</span>';
    }
  });

  // --- Platform Toggle Listeners (connect/pause auto-tracking per site) ---
  function wirePlatformToggle(toggleEl, platformKey) {
    toggleEl.addEventListener('change', async () => {
      try {
        await DSAStorage.setPlatformEnabled(platformKey, toggleEl.checked);
        showAlert(
          `${toggleEl.checked ? 'Resumed' : 'Paused'} autosave for ${platformKey === 'gfg' ? 'GeeksforGeeks' : platformKey === 'leetcode' ? 'LeetCode' : 'HackerRank'}.`,
          true
        );
      } catch (err) {
        toggleEl.checked = !toggleEl.checked; // revert on failure
        showAlert(`Could not update setting: ${err.message}`);
      }
    });
  }

  wirePlatformToggle(togglePlatformGfg, 'gfg');
  wirePlatformToggle(togglePlatformLeetcode, 'leetcode');
  wirePlatformToggle(togglePlatformHackerrank, 'hackerrank');

  toggleAutosave.addEventListener('change', async () => {
    try {
      await DSAStorage.updateSettings({ autoSync: toggleAutosave.checked });
    } catch (err) {
      toggleAutosave.checked = !toggleAutosave.checked;
      showAlert(`Could not update setting: ${err.message}`);
    }
  });

  // Switch Repo
  changeRepoBtn.addEventListener('click', async () => {
    await loadRepoSetup();
  });

  // Disconnect
  disconnectBtn.addEventListener('click', async () => {
    await DSAAuth.disconnect();
    currentAuth = null;
    currentRepo = null;
    showView('auth');
    showAlert('Disconnected from GitHub.', true);
  });

  // --- Initial Routing ---
  async function checkAuthAndRoute() {
    try {
      currentAuth = await DSAStorage.getAuth();
      if (!currentAuth || !currentAuth.token) {
        showView('auth');
        return;
      }

      currentRepo = await DSAStorage.getRepo();
      if (!currentRepo || !currentRepo.name) {
        await loadRepoSetup();
        return;
      }

      await loadDashboard();
    } catch (err) {
      console.warn('Initial routing fallback:', err);
      showView('auth');
    }
  }

  // Initialize
  await initTheme();
  await initMaster();
  await checkAuthAndRoute();
  applyMasterState(extensionOn); // re-apply after views rendered

  // Resume the code panel if a GitHub login is still pending (popup was closed meanwhile)
  if (!currentAuth || !currentAuth.token) {
    try {
      const pending = await sendBg('DEVICE_FLOW_STATUS');
      if (pending) showDeviceBox(pending);
    } catch {
      // Not running as an extension (e.g. tests)
    }
  }
});

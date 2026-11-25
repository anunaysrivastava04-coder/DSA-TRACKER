/**
 * DSA Tracker - Content Script
 * CREATED BY ANUNAY SRIVASTAVA
 * Injected on GeeksforGeeks, LeetCode and HackerRank problem-solving pages.
 * Detects which platform it is running on, monitors submissions, extracts
 * problem details & solution code, communicates with the background service
 * worker, and displays the floating feedback HUD.
 */

/* global ProblemParser, chrome */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__DSATRACKER_INJECTED__) {
    return;
  }
  window.__DSATRACKER_INJECTED__ = true;

  const platform = ProblemParser.detectPlatform(window.location.href);
  // Unknown platform (defensive - manifest match patterns should prevent this): do nothing.
  if (!platform) {
    return;
  }

  const selectors = ProblemParser.SELECTORS[platform];
  const platformLabel = ProblemParser.PLATFORM_LABELS[platform] || platform;

  let isSyncing = false;
  let lastProcessedHash = null;
  let lastProcessedTimestamp = 0;
  let platformEnabled = true; // auto-save allowed for this platform (live-updated from settings)
  let extensionEnabled = true; // master ON/OFF switch (live-updated from settings)
  let manualBtnEl = null;

  // DOM Container for UI Badges & Toasts
  let uiContainer = null;
  let hudPill = null;
  let hudStatus = null;
  let hudDot = null;

  /**
   * Ask the background worker whether auto-tracking is enabled for this
   * platform (the user can flip this per-platform from the popup).
   */
  function refreshPlatformEnabled() {
    try {
      chrome.runtime.sendMessage({ action: 'GET_PLATFORM_STATUS', platform }, (res) => {
        if (chrome.runtime.lastError) return;
        if (res && res.success && res.data) {
          extensionEnabled = res.data.extensionEnabled !== false;
          platformEnabled = res.data.autoSave !== false;
          applyIdleState();
        }
      });
    } catch {
      // Not running as a live extension context (e.g. during hot reload)
    }
  }

  /** Label + dot colour that represent the current idle state of the HUD. */
  function applyIdleState() {
    if (manualBtnEl) {
      manualBtnEl.classList.toggle('dsatracker-hidden', !extensionEnabled);
    }
    if (hudPill) {
      hudPill.classList.toggle('dsatracker-off', !extensionEnabled);
    }
    if (!hudStatus) return;
    if (!extensionEnabled) {
      setHudStatus('Off', 'off');
    } else if (!platformEnabled) {
      setHudStatus('Paused', 'paused');
    } else {
      setHudStatus('Active', 'ready');
    }
  }

  /**
   * Initialize in-page UI elements
   */
  function initUI() {
    if (document.getElementById('dsatracker-container')) {
      return;
    }

    uiContainer = document.createElement('div');
    uiContainer.id = 'dsatracker-container';

    // Floating Pill HUD
    hudPill = document.createElement('div');
    hudPill.className = 'dsatracker-pill';

    hudDot = document.createElement('span');
    hudDot.className = 'dsatracker-pill-dot';

    const brand = document.createElement('span');
    brand.className = 'dsatracker-pill-brand';
    brand.title = 'DSA Tracker • Created by Anunay Srivastava';
    brand.textContent = '</>';

    const platformTag = document.createElement('span');
    platformTag.className = 'dsatracker-pill-platform';
    platformTag.textContent = platformLabel;

    hudStatus = document.createElement('span');
    hudStatus.className = 'dsatracker-pill-status';
    hudStatus.textContent = 'Active';

    // Manual Save Button (autosave is on by default; this forces an immediate sync)
    const manualBtn = document.createElement('button');
    manualBtn.className = 'dsatracker-manual-btn';
    manualBtnEl = manualBtn;
    manualBtn.title = 'Force sync current editor code to GitHub';
    manualBtn.innerHTML = '<span>⚡ Save to GitHub</span>';
    manualBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      manualSyncSolution();
    });

    hudPill.appendChild(hudDot);
    hudPill.appendChild(brand);
    hudPill.appendChild(platformTag);
    hudPill.appendChild(hudStatus);

    uiContainer.appendChild(manualBtn);
    uiContainer.appendChild(hudPill);
    document.body.appendChild(uiContainer);
  }

  /**
   * Update HUD status indicator
   */
  function setHudStatus(statusText, state = 'ready') {
    if (!hudStatus || !hudDot) return;
    hudStatus.textContent = statusText;
    hudDot.className = 'dsatracker-pill-dot';
    if (state === 'syncing') {
      hudDot.classList.add('syncing');
    } else if (state === 'error') {
      hudDot.classList.add('error');
    } else if (state === 'paused' || state === 'off') {
      hudDot.classList.add('paused');
    }
  }

  /**
   * Display floating in-page toast notification
   */
  function showToast(message, type = 'info', linkUrl = null, linkText = 'View on GitHub') {
    if (!uiContainer) initUI();

    const toast = document.createElement('div');
    toast.className = `dsatracker-toast ${type}`;

    const msgSpan = document.createElement('span');
    msgSpan.className = 'dsatracker-toast-msg';
    // textContent only - never innerHTML - so page-controlled text (problem
    // titles, error strings) can never execute as markup inside our own UI.
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    if (linkUrl && /^https:\/\/github\.com\//.test(linkUrl)) {
      const link = document.createElement('a');
      link.className = 'dsatracker-toast-link';
      link.href = linkUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = linkText;
      toast.appendChild(link);
    }

    uiContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(16px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 6000);
  }

  /**
   * Generic selector-list walker shared by all extractors below
   */
  function queryFirstText(selectorList) {
    for (const sel of selectorList) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim()) {
          return el.textContent.trim();
        }
      } catch {
        // Invalid selector for this DOM state - skip
      }
    }
    return '';
  }

  /**
   * Extract Problem Title from page
   */
  function extractProblemTitle() {
    const fromDom = queryFirstText(selectors.title);
    if (fromDom) return ProblemParser.sanitizeText(fromDom, 200);

    // Fallback: parse document.title (e.g. "Two Sum - LeetCode")
    if (document.title) {
      const parts = document.title.split(/\||-\s*LeetCode|\s*\|\s*HackerRank/);
      if (parts[0] && parts[0].trim().length > 1) {
        return ProblemParser.sanitizeText(parts[0].trim(), 200);
      }
    }

    // Fallback: slug formatting
    const slug = ProblemParser.extractSlugFromUrl(window.location.href);
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Extract Difficulty from page
   */
  function extractDifficulty() {
    const fromDom = queryFirstText(selectors.difficulty);
    if (fromDom && /easy|medium|hard|basic|school|expert/i.test(fromDom)) {
      return ProblemParser.normalizeDifficulty(fromDom);
    }

    // Fallback search across span/div elements with an exact difficulty word
    const nodes = document.querySelectorAll('span, div');
    for (const node of nodes) {
      const text = node.textContent ? node.textContent.trim().toLowerCase() : '';
      if (['school', 'basic', 'easy', 'medium', 'hard'].includes(text)) {
        return ProblemParser.normalizeDifficulty(text);
      }
    }

    return 'Easy';
  }

  /**
   * Extract Selected Programming Language
   */
  function extractLanguage() {
    const fromDom = queryFirstText(selectors.language);
    if (fromDom) return ProblemParser.sanitizeText(fromDom, 40);

    // Check dropdown or button with common language names
    const commonLangs = ['C++', 'Java', 'Python3', 'Python', 'C', 'JavaScript', 'TypeScript', 'C#', 'Go', 'Ruby', 'Swift', 'Kotlin'];
    const candidates = document.querySelectorAll('button, .ant-select-selection-item, .select__single-value');
    for (const el of candidates) {
      const text = el.textContent ? el.textContent.trim() : '';
      for (const lang of commonLangs) {
        if (text === lang || text.startsWith(lang)) {
          return lang;
        }
      }
    }

    return 'C++';
  }

  /**
   * Extract Code from Monaco, CodeMirror or Ace Editor DOM lines
   */
  function extractCodeFromEditor() {
    // 1. Monaco Editor lines (GFG, LeetCode, HackerRank new editor)
    const monacoLines = document.querySelectorAll('.monaco-editor .view-lines .view-line');
    if (monacoLines && monacoLines.length > 0) {
      const lines = Array.from(monacoLines).map((line) => line.textContent || '');
      const code = lines.join('\n').trim();
      if (code) return code;
    }

    // 2. CodeMirror Editor lines (HackerRank classic editor)
    const cmLines = document.querySelectorAll('.CodeMirror-line');
    if (cmLines && cmLines.length > 0) {
      const lines = Array.from(cmLines).map((line) => line.textContent || '');
      const code = lines.join('\n').trim();
      if (code) return code;
    }

    // 3. Ace Editor lines
    const aceLines = document.querySelectorAll('.ace_editor .ace_line');
    if (aceLines && aceLines.length > 0) {
      const lines = Array.from(aceLines).map((line) => line.textContent || '');
      const code = lines.join('\n').trim();
      if (code) return code;
    }

    // 4. Textarea editor fallback
    const textarea = document.querySelector('textarea.ace_text-input, .monaco-editor textarea, textarea.CodeMirror-textarea');
    if (textarea && textarea.value && textarea.value.trim().length > 10) {
      return textarea.value.trim();
    }

    // 5. Code block containers
    const codeContainer = document.querySelector('.problem-code, pre code');
    if (codeContainer && codeContainer.textContent.trim()) {
      return codeContainer.textContent.trim();
    }

    return '';
  }

  /**
   * Gather full problem payload from page
   */
  function getProblemDetails() {
    const title = extractProblemTitle();
    const difficulty = extractDifficulty();
    const language = extractLanguage();
    const url = window.location.href;
    const slug = ProblemParser.extractSlugFromUrl(url);
    const code = extractCodeFromEditor();

    return {
      platform,
      title,
      slug,
      url,
      difficulty,
      language,
      code,
      timestamp: Date.now()
    };
  }

  /**
   * Transmit submission to extension service worker
   */
  async function syncSolution(problemDetails) {
    if (isSyncing) return;
    isSyncing = true;
    setHudStatus('Syncing...', 'syncing');

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: 'SYNC_SUBMISSION',
            payload: problemDetails
          },
          (res) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(res || { success: false, error: 'Empty response from service worker' });
            }
          }
        );
      });

      if (response && response.success) {
        setHudStatus('Synced ✓', 'ready');
        const when = response.data && response.data.solvedAtText ? ` \u2022 ${response.data.solvedAtText}` : '';
        showToast(
          `DSA Tracker: Synced "${problemDetails.title}" (${platformLabel}) to GitHub!${when}`,
          'success',
          response.data?.commitUrl
        );
      } else {
        const errorMsg = response?.error || 'Failed to sync with GitHub';
        setHudStatus('Sync Failed', 'error');
        showToast(`DSA Tracker Error: ${errorMsg}`, 'error');
      }
    } catch (err) {
      setHudStatus('Sync Error', 'error');
      showToast(`DSA Tracker Error: ${err.message}`, 'error');
    } finally {
      isSyncing = false;
      setTimeout(applyIdleState, 4000);
    }
  }

  /**
   * Manual Sync trigger (via on-page button) - works even if autosave for
   * this platform is paused, since it is an explicit user action.
   */
  function manualSyncSolution() {
    if (!extensionEnabled) {
      showToast('DSA Tracker is OFF. Turn it on from the extension popup to sync.', 'error');
      return;
    }
    const details = getProblemDetails();
    if (!details.code) {
      showToast('Could not extract code from editor. Please verify the code is visible.', 'error');
      return;
    }
    syncSolution(details);
  }

  /**
   * Inspect page DOM for successful submission indicators
   */
  function checkSubmissionResults() {
    if (isSyncing || !extensionEnabled || !platformEnabled) return;

    for (const sel of selectors.resultContainer) {
      let container;
      try {
        container = document.querySelector(sel);
      } catch {
        continue;
      }
      if (!container) continue;

      const text = container.textContent || '';
      if (ProblemParser.isSubmissionAccepted(text)) {
        // Prevent duplicate sync within 15 seconds for same problem
        const details = getProblemDetails();
        const hash = `${platform}_${details.slug}_${details.language}_${details.code.length}`;
        const now = Date.now();

        if (hash === lastProcessedHash && now - lastProcessedTimestamp < 15000) {
          return;
        }

        lastProcessedHash = hash;
        lastProcessedTimestamp = now;

        if (details.code) {
          // Autosave: automatically push to GitHub the moment an accepted
          // submission is detected - no manual click required.
          syncSolution(details);
        }
        break;
      }
    }
  }

  /**
   * Setup MutationObserver to watch for submission results
   */
  function observeSubmissions() {
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          shouldCheck = true;
          break;
        }
      }
      if (shouldCheck) {
        checkSubmissionResults();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // React live if the user toggles this platform on/off from the popup
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.dsatracker_settings) {
        refreshPlatformEnabled();
      }
    });
  }

  // Initialize once DOM is ready
  function start() {
    initUI();
    refreshPlatformEnabled();
    observeSubmissions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

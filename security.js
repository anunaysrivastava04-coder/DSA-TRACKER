/**
 * DSA Tracker - Security boundary helpers (pure, testable).
 * These helpers validate background-message origins and payload shape; they do
 * not replace the browser extension's isolated-world/runtime security model.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DSASecurity = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';


  function isExtensionPopup(sender, runtimeId, popupUrl) {
    return Boolean(sender && sender.id === runtimeId && !sender.tab && sender.url === popupUrl);
  }


  function isValidProblemPage(url, platform) {
    if (!url || url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    if (platform === 'gfg') {
      return (host === 'www.geeksforgeeks.org' || host === 'practice.geeksforgeeks.org') &&
        (/^\/problems\/[a-z0-9-]+(?:\/|$)/i.test(path) || /^\/batch\//i.test(path));
    }
    if (platform === 'leetcode') {
      return (host === 'leetcode.com' || host === 'www.leetcode.com') && /^\/problems\/[a-z0-9-]+(?:\/|$)/i.test(path);
    }
    if (platform === 'hackerrank') {
      return host === 'www.hackerrank.com' &&
        (/^\/challenges\/[a-z0-9-]+(?:\/|$)/i.test(path) || /^\/contests\/[a-z0-9-]+\/challenges\/[a-z0-9-]+(?:\/|$)/i.test(path));
    }
    return false;
  }

  function isAllowedSyncSender(sender, runtimeId, detectPlatform) {
    if (!sender || sender.id !== runtimeId || !sender.tab || !sender.url || sender.frameId !== 0) return false;
    try {
      const url = new URL(sender.url);
      const allowedHost = ['www.geeksforgeeks.org', 'practice.geeksforgeeks.org', 'leetcode.com', 'www.hackerrank.com'].includes(url.hostname.toLowerCase());
      if (!allowedHost || url.protocol !== 'https:') return false;
      return isValidProblemPage(url, detectPlatform(url.href));
    } catch {
      return false;
    }
  }


  function isValidSubmissionPayload(payload, expectedPlatform = null, senderUrl = null, detectPlatform = null) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    if (typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 200) return false;
    if (typeof payload.code !== 'string' || !payload.code.trim() || payload.code.length > 200000) return false;
    if (typeof payload.language !== 'string' || !payload.language.trim() || payload.language.length > 80) return false;
    if (typeof payload.url !== 'string' || payload.url.length > 2048 || typeof detectPlatform !== 'function') return false;
    let problemUrl;
    try { problemUrl = new URL(payload.url); } catch { return false; }
    const platform = detectPlatform(problemUrl.href);
    if (!platform || (expectedPlatform && platform !== expectedPlatform) || !isValidProblemPage(problemUrl, platform)) return false;
    if (senderUrl) {
      let source;
      try { source = new URL(senderUrl); } catch { return false; }
      if (source.origin !== problemUrl.origin || source.pathname !== problemUrl.pathname || source.protocol !== 'https:') return false;
    }
    if (payload.slug != null && (typeof payload.slug !== 'string' || payload.slug.length > 200)) return false;
    if (payload.difficulty != null && (typeof payload.difficulty !== 'string' || payload.difficulty.length > 40)) return false;
    if (payload.timestamp != null && (!Number.isFinite(payload.timestamp) || payload.timestamp < 0)) return false;
    return true;
  }

  return { isExtensionPopup, isValidProblemPage, isAllowedSyncSender, isValidSubmissionPayload };
});

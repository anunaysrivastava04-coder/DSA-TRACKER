/**
 * DSA Tracker - Authentication Manager
 * CREATED BY ANUNAY SRIVASTAVA
 *
 * Authentication methods:
 *  1. GitHub OAuth *Device Flow* (primary). Needs ONLY the public Client ID.
 *     No Client Secret and no backend server are used or required, so there is
 *     nothing sensitive to leak from this extension.
 *  2. GitHub Personal Access Token (PAT) with immediate verification (fallback).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./storage.js'), require('./github.js'));
  } else {
    root.DSAAuth = factory(root.DSAStorage, root.DSAGitHub);
  }
})(typeof self !== 'undefined' ? self : this, function (storage, github) {
  'use strict';

  /**
   * NOTE ON SECURITY: an OAuth Client ID is a PUBLIC identifier (it is visible in
   * every GitHub authorize URL). It is safe to ship in the extension. The Client
   * SECRET is what must stay private, and Device Flow never uses it.
   * Never put a Client Secret in this file.
   */
  const OAUTH_CONFIG = Object.freeze({
    clientId: (typeof DSA_OAUTH_CONFIG !== 'undefined' && DSA_OAUTH_CONFIG.clientId) || '',
    scope: 'repo read:user',
    deviceCodeUrl: 'https://github.com/login/device/code',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    // The only verification page the extension will ever open
    verificationUrl: 'https://github.com/login/device',
    deviceGrantType: 'urn:ietf:params:oauth:grant-type:device_code',
    minIntervalSec: 5
  });

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!data || typeof data !== 'object') {
      throw new Error(`Unexpected response from GitHub (status ${response.status}).`);
    }
    return data;
  }

  /**
   * Step 1: ask GitHub for a device code + short user code.
   * Persists the pending flow locally and returns it.
   */
  async function startDeviceFlow() {
    if (!OAUTH_CONFIG.clientId || OAUTH_CONFIG.clientId === 'YOUR_GITHUB_OAUTH_CLIENT_ID') {
      throw new Error('GitHub OAuth Client ID is not configured. Copy oauth-config.example.js to oauth-config.js and add your Client ID.');
    }
    const data = await postJson(OAUTH_CONFIG.deviceCodeUrl, {
      client_id: OAUTH_CONFIG.clientId,
      scope: OAUTH_CONFIG.scope
    });

    if (data.error) {
      if (data.error === 'device_flow_disabled') {
        throw new Error('Device Flow is not enabled for this GitHub OAuth App. Enable it in the app settings.');
      }
      throw new Error(data.error_description || `GitHub error: ${data.error}`);
    }

    if (!data.device_code || !data.user_code) {
      throw new Error('GitHub did not return a device code. Please try again.');
    }

    const interval = Math.max(Number(data.interval) || OAUTH_CONFIG.minIntervalSec, OAUTH_CONFIG.minIntervalSec);
    const now = Date.now();
    const pending = {
      deviceCode: String(data.device_code),
      userCode: String(data.user_code),
      // Never trust a server-supplied URL: always use the fixed GitHub page.
      verificationUri: OAUTH_CONFIG.verificationUrl,
      interval,
      expiresAt: now + (Number(data.expires_in) || 900) * 1000,
      nextPollAt: now + interval * 1000
    };

    await storage.setPendingDevice(pending);
    return pending;
  }

  /**
   * Step 2: one poll attempt. Safe to call repeatedly; it respects GitHub's
   * polling interval. Returns { status, auth?, message? } where status is one of:
   * 'none' | 'pending' | 'success' | 'expired' | 'denied' | 'error'
   */
  async function pollDeviceFlowOnce() {
    const pending = await storage.getPendingDevice();
    if (!pending) return { status: 'none' };

    const now = Date.now();
    if (now >= pending.expiresAt) {
      await storage.clearPendingDevice();
      return { status: 'expired', message: 'The GitHub code expired. Please try again.' };
    }
    if (now < pending.nextPollAt) return { status: 'pending' };

    // Reserve the next slot first so concurrent callers do not hammer GitHub
    pending.nextPollAt = now + pending.interval * 1000;
    await storage.setPendingDevice(pending);

    let data;
    try {
      data = await postJson(OAUTH_CONFIG.tokenUrl, {
        client_id: OAUTH_CONFIG.clientId,
        device_code: pending.deviceCode,
        grant_type: OAUTH_CONFIG.deviceGrantType
      });
    } catch {
      return { status: 'pending' }; // transient network problem, retry later
    }

    if (data.access_token) {
      const user = await github.getUser(data.access_token);
      const authRecord = {
        token: data.access_token,
        username: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
        htmlUrl: user.htmlUrl,
        authMethod: 'oauth',
        connectedAt: Date.now()
      };
      await storage.setAuth(authRecord);
      await storage.clearPendingDevice();
      return { status: 'success', auth: authRecord };
    }

    switch (data.error) {
      case 'authorization_pending':
        return { status: 'pending' };
      case 'slow_down':
        pending.interval = Number(data.interval) || pending.interval + 5;
        pending.nextPollAt = Date.now() + pending.interval * 1000;
        await storage.setPendingDevice(pending);
        return { status: 'pending' };
      case 'expired_token':
        await storage.clearPendingDevice();
        return { status: 'expired', message: 'The GitHub code expired. Please try again.' };
      case 'access_denied':
        await storage.clearPendingDevice();
        return { status: 'denied', message: 'Authorization was denied on GitHub.' };
      default:
        await storage.clearPendingDevice();
        return { status: 'error', message: data.error_description || `GitHub error: ${data.error || 'unknown'}` };
    }
  }

  async function cancelDeviceFlow() {
    await storage.clearPendingDevice();
  }

  /**
   * Authenticate using GitHub Personal Access Token (Classic or Fine-Grained)
   */
  async function authenticatePAT(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('Please enter a valid GitHub Personal Access Token.');
    }

    const trimmed = token.trim();
    if (!trimmed.startsWith('github_pat_')) {
      throw new Error('Use a fine-grained GitHub Personal Access Token (github_pat_). Classic PATs are not accepted.');
    }

    const user = await github.getUser(trimmed);

    const authRecord = {
      token: trimmed,
      username: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      htmlUrl: user.htmlUrl,
      authMethod: 'pat',
      connectedAt: Date.now()
    };

    await storage.setAuth(authRecord);
    return authRecord;
  }

  /**
   * Disconnect and wipe stored credentials
   */
  async function disconnect() {
    await storage.clearPendingDevice();
    await storage.clearAuth();
    await storage.clearRepo();
  }

  return {
    OAUTH_CONFIG,
    startDeviceFlow,
    pollDeviceFlowOnce,
    cancelDeviceFlow,
    authenticatePAT,
    disconnect
  };
});

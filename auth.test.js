/**
 * Unit Tests for DSAAuth (GitHub Device Flow + PAT) using a mocked fetch
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
// Provide a test-only Client ID via the same config global used by the extension.
global.DSA_OAUTH_CONFIG = Object.freeze({ clientId: 'TEST_OAUTH_CLIENT_ID' });
const DSAStorage = require('../storage.js');
const DSAAuth = require('../auth.js');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'x',
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

async function runAuthTests() {
  console.log('\n--- Running DSAAuth Tests ---');
  DSAStorage._resetMemoryStore();

  // Config sanity: public client id only, never a secret
  assert.strictEqual(DSAAuth.OAUTH_CONFIG.clientId, 'TEST_OAUTH_CLIENT_ID');
  const src = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');
  assert.ok(!/client_secret\s*[:=]\s*['"][^'"]+['"]/i.test(src), 'auth.js must not contain a client secret');
  console.log('✓ Config uses public Client ID and no client secret');

  const calls = [];
  let tokenReplies = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    if (url === 'https://github.com/login/device/code') {
      return jsonResponse({
        device_code: 'DEV123',
        user_code: 'ABCD-1234',
        verification_uri: 'https://evil.example/phish',
        expires_in: 900,
        interval: 5
      });
    }
    if (url === 'https://github.com/login/oauth/access_token') {
      return jsonResponse(tokenReplies.shift() || { error: 'authorization_pending' });
    }
    if (url === 'https://api.github.com/user') {
      return jsonResponse({ login: 'octo', name: 'Octo Cat', avatar_url: 'a', html_url: 'h', id: 1 });
    }
    throw new Error('Unexpected URL ' + url);
  };

  // 1. Start flow: always uses fixed GitHub verification URL (ignores server-supplied URL)
  const pending = await DSAAuth.startDeviceFlow();
  assert.strictEqual(pending.userCode, 'ABCD-1234');
  assert.strictEqual(pending.verificationUri, 'https://github.com/login/device');
  assert.strictEqual(calls[0].body.client_id, 'TEST_OAUTH_CLIENT_ID');
  assert.ok(!('client_secret' in calls[0].body));
  console.log('✓ Device flow starts and pins the verification URL');

  // 2. Polling before the interval elapses does not call GitHub
  const before = calls.length;
  assert.strictEqual((await DSAAuth.pollDeviceFlowOnce()).status, 'pending');
  assert.strictEqual(calls.length, before);
  console.log('✓ Polling respects the interval');

  const forceDue = async () => {
    const p = await DSAStorage.getPendingDevice();
    p.nextPollAt = 0;
    await DSAStorage.setPendingDevice(p);
  };

  // 3. authorization_pending, then slow_down increases interval
  await forceDue();
  assert.strictEqual((await DSAAuth.pollDeviceFlowOnce()).status, 'pending');
  await forceDue();
  tokenReplies = [{ error: 'slow_down', interval: 10 }];
  assert.strictEqual((await DSAAuth.pollDeviceFlowOnce()).status, 'pending');
  assert.strictEqual((await DSAStorage.getPendingDevice()).interval, 10);
  console.log('✓ authorization_pending and slow_down handled');

  // 4. Success stores token and clears pending state
  await forceDue();
  tokenReplies = [{ access_token: 'gho_testtoken', token_type: 'bearer', scope: 'repo,read:user' }];
  const ok = await DSAAuth.pollDeviceFlowOnce();
  assert.strictEqual(ok.status, 'success');
  assert.strictEqual(ok.auth.username, 'octo');
  assert.strictEqual((await DSAStorage.getAuth()).token, 'gho_testtoken');
  assert.strictEqual(await DSAStorage.getPendingDevice(), null);
  console.log('✓ Successful authorization stores the token');

  // 5. Denied
  await DSAAuth.startDeviceFlow();
  await forceDue();
  tokenReplies = [{ error: 'access_denied' }];
  assert.strictEqual((await DSAAuth.pollDeviceFlowOnce()).status, 'denied');
  assert.strictEqual(await DSAStorage.getPendingDevice(), null);
  console.log('✓ access_denied clears pending flow');

  // 6. Expired locally
  await DSAAuth.startDeviceFlow();
  const p = await DSAStorage.getPendingDevice();
  p.expiresAt = Date.now() - 1;
  await DSAStorage.setPendingDevice(p);
  assert.strictEqual((await DSAAuth.pollDeviceFlowOnce()).status, 'expired');
  console.log('✓ Expired codes are cleaned up');

  // 7. Device flow disabled gives a helpful error
  const realFetch = global.fetch;
  global.fetch = async () => jsonResponse({ error: 'device_flow_disabled' });
  await assert.rejects(() => DSAAuth.startDeviceFlow(), /Device Flow is not enabled/);
  global.fetch = realFetch;
  console.log('✓ device_flow_disabled error is explained');

  // 8. Disconnect wipes credentials and pending flow
  await DSAAuth.startDeviceFlow();
  await DSAAuth.disconnect();
  assert.strictEqual(await DSAStorage.getAuth(), null);
  assert.strictEqual(await DSAStorage.getPendingDevice(), null);
  console.log('✓ Disconnect wipes credentials');

  // 9. PAT validation
  await assert.rejects(() => DSAAuth.authenticatePAT('not-a-token'), /Use a fine-grained GitHub Personal Access Token/);
  await assert.rejects(() => DSAAuth.authenticatePAT('ghp_classic_token'), /Classic PATs are not accepted/);
  const pat = await DSAAuth.authenticatePAT('github_pat_test123');
  assert.strictEqual(pat.authMethod, 'pat');
  console.log('✓ PAT authentication still works');

  delete global.fetch;
}

module.exports = runAuthTests;

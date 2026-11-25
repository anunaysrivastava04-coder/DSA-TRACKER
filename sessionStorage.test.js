/**
 * Test production-like chrome.storage.session credential handling in an isolated mock.
 */
const assert = require('assert');

async function runSessionStorageTests() {
  console.log('\n--- Running Chrome Session Storage Security Tests ---');
  const local = {};
  const session = {};
  function areaMock(area) {
    return {
      get(keys, callback) { const result = {}; for (const key of keys) if (area[key] !== undefined) result[key] = area[key]; callback(result); },
      set(values, callback) { Object.assign(area, values); callback(); },
      remove(keys, callback) { for (const key of keys) delete area[key]; callback(); }
    };
  }
  const priorChrome = global.chrome;
  global.chrome = {
    storage: { local: areaMock(local), session: areaMock(session) },
    runtime: { lastError: null }
  };
  const storagePath = require.resolve('../storage.js');
  delete require.cache[storagePath];
  const S = require('../storage.js');
  try {
    await S.setAuth({ token: 'gho_session_mock', username: 'tester' });
    const auth = await S.getAuth();
    assert.strictEqual(auth.token, 'gho_session_mock');
    assert.strictEqual(session.dsatracker_session_token, 'gho_session_mock');
    assert.strictEqual(local.dsatracker_auth.token, undefined, 'Bearer token must not be in local metadata');
    assert.strictEqual(local.dsatracker_auth.tokenStorage, 'session');

    await S.setPendingDevice({ deviceCode: 'device_secret_mock', userCode: 'ABCD-EFGH' });
    assert.strictEqual(session.dsatracker_pending_device.deviceCode, 'device_secret_mock');
    assert.strictEqual(local.dsatracker_pending_device, undefined, 'Device code must not be persisted locally');

    await S.clearAuth();
    assert.strictEqual(session.dsatracker_session_token, undefined, 'Disconnect removes the session token');
    await S.clearPendingDevice();
    assert.strictEqual(session.dsatracker_pending_device, undefined, 'Cancel removes the pending code');

    // Verify legacy XOR records migrate into session storage and remove local key/token.
    const legacyToken = 'gho_old_test_token';
    const legacyKey = '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';
    const keyBytes = Buffer.from(legacyKey, 'hex');
    const xorBytes = Buffer.from(legacyToken, 'utf8').map((b, i) => b ^ keyBytes[i % keyBytes.length]);
    local.dsatracker_device_key = legacyKey;
    local.dsatracker_auth = { token: xorBytes.toString('base64'), tokenObfuscated: true, username: 'olduser' };
    const migrated = await S.getAuth();
    assert.strictEqual(migrated.token, legacyToken);
    assert.strictEqual(session.dsatracker_session_token, legacyToken);
    assert.strictEqual(local.dsatracker_auth.token, undefined, 'Legacy token must be removed from local auth metadata');
    assert.strictEqual(local.dsatracker_device_key, undefined, 'Legacy XOR key must be deleted');
    await S.clearAuth();
    console.log('✓ Session-only tokens, device codes, disconnect clearing and legacy migration verified');
  } finally {
    global.chrome = priorChrome;
    delete require.cache[storagePath];
    require('../storage.js');
  }
}
module.exports = runSessionStorageTests;

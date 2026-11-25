const assert = require('assert');
const Security = require('../security.js');
const Parser = require('../problemParser.js');

function runSecurityTests() {
  console.log('\n--- Running Message Security Tests ---');
  const id = 'extension-id';
  const popup = { id, url: `chrome-extension://${id}/popup.html` };
  assert.strictEqual(Security.isExtensionPopup(popup, id, popup.url), true);
  assert.strictEqual(Security.isExtensionPopup({ ...popup, tab: { id: 1 } }, id, popup.url), false);
  assert.strictEqual(Security.isExtensionPopup({ ...popup, url: `chrome-extension://${id}/other.html` }, id, popup.url), false);

  const gfgSender = { id, tab: { id: 10 }, frameId: 0, url: 'https://www.geeksforgeeks.org/problems/two-sum/1' };
  assert.strictEqual(Security.isAllowedSyncSender(gfgSender, id, Parser.detectPlatform), true);
  assert.strictEqual(Security.isAllowedSyncSender({ ...gfgSender, frameId: 2 }, id, Parser.detectPlatform), false);
  assert.strictEqual(Security.isAllowedSyncSender({ ...gfgSender, url: 'https://www.geeksforgeeks.org/' }, id, Parser.detectPlatform), false);
  assert.strictEqual(Security.isAllowedSyncSender({ ...gfgSender, url: 'https://www.geeksforgeeks.evil/problems/two-sum/1' }, id, Parser.detectPlatform), false);


  const validPayload = { title: 'Two Sum', code: 'int main(){}', language: 'C++', url: gfgSender.url, platform: 'leetcode' };
  assert.strictEqual(Security.isValidSubmissionPayload(validPayload, 'gfg', gfgSender.url, Parser.detectPlatform), true);
  assert.strictEqual(Security.isValidSubmissionPayload({ ...validPayload, url: 'https://evil.example/problem' }, 'gfg', gfgSender.url, Parser.detectPlatform), false);
  assert.strictEqual(Security.isValidSubmissionPayload({ ...validPayload, code: 'x'.repeat(200001) }, 'gfg', gfgSender.url, Parser.detectPlatform), false);
  assert.strictEqual(Security.isValidSubmissionPayload({ ...validPayload, title: '' }, 'gfg', gfgSender.url, Parser.detectPlatform), false);
  console.log('✓ Popup-only actions, top-frame allowed sender, exact host, URL binding and payload limits verified');
}
module.exports = runSecurityTests;

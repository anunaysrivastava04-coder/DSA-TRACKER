/**
 * Unit Tests for DSAGitHub Client & README Generation
 */

const assert = require('assert');
const DSAGitHub = require('../github.js');

async function runGitHubTests() {
  console.log('\n--- Running DSAGitHub Tests ---');

  // 1. UTF-8 Base64 Encoding and Decoding
  const testString = 'int main() { /* Test UTF-8: 🚀 🌟 ñoño */ return 0; }';
  const encoded = DSAGitHub.utf8ToBase64(testString);
  const decoded = DSAGitHub.base64ToUtf8(encoded);
  assert.strictEqual(decoded, testString, 'Base64 encode/decode must preserve full UTF-8 Unicode characters');
  console.log('✓ UTF-8 Base64 encoding/decoding verified');

  // 2. README Markdown Generation (multi-platform)
  const mockProblems = {
    'gfg:two-sum': {
      platform: 'gfg',
      title: 'Two Sum',
      difficulty: 'Easy',
      language: 'C++',
      path: 'GeeksforGeeks/Easy/Two_Sum.cpp',
      url: 'https://geeksforgeeks.org/problems/two-sum/1',
      lastSolvedAt: Date.UTC(2026, 10, 25, 8, 3, 4), // 25 Nov 2026 08:03:04 UTC
      tzOffset: 330 // solved from India (UTC+05:30)
    },
    'hackerrank:word-ladder': {
      platform: 'hackerrank',
      title: 'Word Ladder',
      difficulty: 'Hard',
      language: 'Java',
      path: 'HackerRank/Hard/Word_Ladder.java',
      url: 'https://www.hackerrank.com/challenges/word-ladder'
    },
    'leetcode:subarrays': {
      platform: 'leetcode',
      title: 'Subarray with Given Sum',
      difficulty: 'Medium',
      language: 'Python3',
      path: 'LeetCode/Medium/Subarray_with_Given_Sum.py',
      url: 'https://leetcode.com/problems/subarrays/'
    }
  };

  const mockStats = {
    totalSolved: 3,
    easy: 1,
    medium: 1,
    hard: 1,
    byPlatform: { gfg: 1, leetcode: 1, hackerrank: 1 },
    lastSyncTime: 1700000000000
  };

  const readme = DSAGitHub.generateReadmeContent(mockProblems, mockStats, 'coder', 'DSA-Tracker-Solutions');

  assert(readme.includes('# DSA Solutions'), 'Must contain top title');
  assert(readme.includes('Total Solved:** 3'), 'Must contain total count');
  assert(readme.includes('Easy:** 1'), 'Must contain easy count');
  assert(readme.includes('Medium:** 1'), 'Must contain medium count');
  assert(readme.includes('Hard:** 1'), 'Must contain hard count');
  assert(readme.includes('GeeksforGeeks:** 1'), 'Must contain per-platform GFG count');
  assert(readme.includes('LeetCode:** 1'), 'Must contain per-platform LeetCode count');
  assert(readme.includes('HackerRank:** 1'), 'Must contain per-platform HackerRank count');
  assert(readme.includes('| 1 |') && readme.includes('GeeksforGeeks') && readme.includes('[Two Sum]'), 'Must contain GFG row with platform label');
  assert(readme.includes('[Solution](LeetCode/Medium/Subarray_with_Given_Sum.py)'), 'Must contain LeetCode solution link');
  assert(readme.includes('🔴 Hard'));
  assert(readme.includes('🟡 Medium'));
  assert(readme.includes('Anunay Srivastava'), 'Must contain author Anunay Srivastava');
  assert(readme.includes('https://www.instagram.com/anunay_srivastava108'), 'Must contain Instagram link');
  assert(readme.includes('https://www.linkedin.com/in/anunay-srivastava-2638a1362/'), 'Must contain LinkedIn link');
  assert(readme.includes('https://github.com/anunaysrivastava04-coder'), 'Must contain GitHub link');
  console.log('✓ README table (with Platform column), author attribution, and summary badge formatting verified');

  // 2b. Date & time of each solution in the README (solver's own timezone)
  assert(readme.includes('📅 Date') && readme.includes('🕐 Time'), 'Table must have Date and Time columns');
  assert(readme.includes('| 25 Nov 2026 | 01:33 PM (UTC+05:30) |'), 'Row must show local date, time and UTC offset');
  assert(readme.includes('Recent Solves'), 'Must contain a Recent Solves section');
  assert(readme.includes('**25 Nov 2026, 01:33 PM** (UTC+05:30)'), 'Recent Solves must show date and time');
  // A record without a timestamp must not break the table
  assert(readme.includes('| - | - | [Solution](HackerRank/Hard/Word_Ladder.java) |'), 'Missing timestamp renders as dashes');
  console.log('✓ README date & time columns and Recent Solves verified');

  // 3. Markdown injection resistance: a "|" or newline in a scraped title
  // must never break the table structure.
  const injProblems = {
    'gfg:evil': {
      platform: 'gfg',
      title: 'Weird | Title\nWith Newline',
      difficulty: 'Easy',
      language: 'C++',
      path: 'GeeksforGeeks/Easy/Weird.cpp',
      url: 'https://geeksforgeeks.org/problems/evil/1'
    }
  };
  const injReadme = DSAGitHub.generateReadmeContent(injProblems, { totalSolved: 1, easy: 1, medium: 0, hard: 0, byPlatform: { gfg: 1 } }, 'coder', 'test');
  assert(injReadme.includes('Weird \\| Title With Newline'), 'Pipe and newline in title must be escaped/collapsed');
  console.log('✓ README table injection resistance verified');

  // 4. Empty README Generation
  const emptyReadme = DSAGitHub.generateReadmeContent({}, { totalSolved: 0, easy: 0, medium: 0, hard: 0, byPlatform: {} }, 'coder', 'test');
  assert(emptyReadme.includes('No solutions synced yet'));
  assert(!emptyReadme.includes('Recent Solves'), 'No recent section when nothing is solved');
  console.log('✓ Empty README fallback verified');

  // 5. Bearer tokens must never be sent outside GitHub's API origin.
  const oldFetch = global.fetch;
  let fetchWasCalled = false;
  global.fetch = async () => { fetchWasCalled = true; throw new Error('unexpected fetch'); };
  await assert.rejects(() => DSAGitHub.request('https://evil.example/steal', {}, 'ghp_testtoken'), /Blocked request outside the GitHub API origin/);
  assert.strictEqual(fetchWasCalled, false, 'Blocked external endpoint before network request');
  await assert.rejects(() => DSAGitHub.getFile('token', 'owner', 'repo', '../secret.txt'), /Invalid repository file path/);
  global.fetch = oldFetch;
  console.log('✓ GitHub request origin and path traversal guards verified');
}


module.exports = runGitHubTests;

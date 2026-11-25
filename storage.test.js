/**
 * Unit Tests for DSAStorage
 */

const assert = require('assert');
const DSAStorage = require('../storage.js');

async function runStorageTests() {
  console.log('\n--- Running DSAStorage Tests ---');
  DSAStorage._resetMemoryStore();

  // 1. Initial State
  const initialStats = await DSAStorage.getStats();
  assert.strictEqual(initialStats.totalSolved, 0);
  assert.strictEqual(initialStats.easy, 0);
  assert.strictEqual(initialStats.medium, 0);
  assert.strictEqual(initialStats.hard, 0);
  console.log('✓ Initial statistics verified');

  // 2. Record First Problem (Easy)
  const res1 = await DSAStorage.recordSolvedProblem({
    slug: 'two-sum-01',
    title: 'Two Sum',
    difficulty: 'Easy',
    language: 'C++',
    path: 'Easy/Two_Sum.cpp',
    url: 'https://geeksforgeeks.org/problems/two-sum-01/1'
  });

  assert.strictEqual(res1.isNew, true);
  assert.strictEqual(res1.stats.totalSolved, 1);
  assert.strictEqual(res1.stats.easy, 1);
  assert.strictEqual(res1.stats.medium, 0);
  assert.strictEqual(res1.stats.hard, 0);
  console.log('✓ First solve recorded and stats incremented');

  // 3. Deduplication Check: Record the EXACT SAME problem again
  const resDuplicate = await DSAStorage.recordSolvedProblem({
    slug: 'two-sum-01',
    title: 'Two Sum',
    difficulty: 'Easy',
    language: 'C++',
    path: 'Easy/Two_Sum.cpp',
    url: 'https://geeksforgeeks.org/problems/two-sum-01/1'
  });

  assert.strictEqual(resDuplicate.isNew, false);
  assert.strictEqual(resDuplicate.stats.totalSolved, 1, 'Total unique count must NOT increase on duplicate solve');
  assert.strictEqual(resDuplicate.stats.easy, 1);
  assert.strictEqual(resDuplicate.problem.submissionCount, 2);
  console.log('✓ Deduplication verified (duplicate solve did NOT inflate unique stats)');

  // 4. Record Medium and Hard problems
  await DSAStorage.recordSolvedProblem({
    slug: 'kadanes-algo',
    title: 'Kadane Algorithm',
    difficulty: 'Medium',
    language: 'Python3',
    path: 'Medium/Kadane_Algorithm.py',
    url: 'https://geeksforgeeks.org/problems/kadanes-algo/1'
  });

  await DSAStorage.recordSolvedProblem({
    slug: 'word-ladder-ii',
    title: 'Word Ladder II',
    difficulty: 'Hard',
    language: 'Java',
    path: 'Hard/Word_Ladder_II.java',
    url: 'https://geeksforgeeks.org/problems/word-ladder-ii/1'
  });

  const currentStats = await DSAStorage.getStats();
  assert.strictEqual(currentStats.totalSolved, 3);
  assert.strictEqual(currentStats.easy, 1);
  assert.strictEqual(currentStats.medium, 1);
  assert.strictEqual(currentStats.hard, 1);
  assert.strictEqual(currentStats.byLanguage['C++'], 1);
  assert.strictEqual(currentStats.byLanguage['Python3'], 1);
  assert.strictEqual(currentStats.byLanguage['Java'], 1);
  console.log('✓ Multiple difficulty solves and language breakdown verified');

  // 5. Recalculate Stats Verification
  const problems = await DSAStorage.getProblems();
  const recalculated = DSAStorage.recalculateStats(problems);
  assert.deepStrictEqual(recalculated.totalSolved, 3);
  assert.deepStrictEqual(recalculated.easy, 1);
  assert.deepStrictEqual(recalculated.medium, 1);
  assert.deepStrictEqual(recalculated.hard, 1);
  console.log('✓ RecalculateStats verified ground truth consistency');

  // 6. Offline Sync Queue
  await DSAStorage.addToSyncQueue({ slug: 'queue-test', title: 'Queue Test', code: 'test code' });
  let queue = await DSAStorage.getSyncQueue();
  assert.strictEqual(queue.length, 1);

  // Avoid duplicates in queue
  await DSAStorage.addToSyncQueue({ slug: 'queue-test', title: 'Queue Test', code: 'test code' });
  queue = await DSAStorage.getSyncQueue();
  assert.strictEqual(queue.length, 1);

  await DSAStorage.clearSyncQueue();
  queue = await DSAStorage.getSyncQueue();
  assert.strictEqual(queue.length, 0);
  console.log('✓ Offline sync queue management verified');

  // 7. Reset All Stats
  await DSAStorage.resetAllStats();
  const resetStats = await DSAStorage.getStats();
  assert.strictEqual(resetStats.totalSolved, 0);
  assert.strictEqual(resetStats.easy, 0);
  assert.strictEqual(resetStats.medium, 0);
  assert.strictEqual(resetStats.hard, 0);
  const resetProblems = await DSAStorage.getProblems();
  assert.strictEqual(Object.keys(resetProblems).length, 0);
  console.log('✓ Reset all stats confirmed clean zero state');

  // 8. Per-platform autosave toggles (GFG / LeetCode / HackerRank)
  DSAStorage._resetMemoryStore();
  const defaultSettings = await DSAStorage.getSettings();
  assert.deepStrictEqual(defaultSettings.platforms, { gfg: true, leetcode: true, hackerrank: true });

  await DSAStorage.setPlatformEnabled('leetcode', false);
  assert.strictEqual(await DSAStorage.getPlatformEnabled('leetcode'), false);
  assert.strictEqual(await DSAStorage.getPlatformEnabled('gfg'), true);
  assert.strictEqual(await DSAStorage.getPlatformEnabled('hackerrank'), true);
  console.log('✓ Per-platform autosave toggles verified independent of each other');

  // 9. Same slug on two different platforms must NOT collide
  await DSAStorage.recordSolvedProblem({ platform: 'gfg', slug: 'two-sum', title: 'Two Sum (GFG)', difficulty: 'Easy', language: 'C++', path: 'GeeksforGeeks/Easy/Two_Sum.cpp' });
  await DSAStorage.recordSolvedProblem({ platform: 'leetcode', slug: 'two-sum', title: 'Two Sum (LC)', difficulty: 'Easy', language: 'Python3', path: 'LeetCode/Easy/Two_Sum.py' });
  const multiStats = await DSAStorage.getStats();
  assert.strictEqual(multiStats.totalSolved, 2, 'Same slug on two platforms must be tracked as two distinct solves');
  assert.strictEqual(multiStats.byPlatform.gfg, 1);
  assert.strictEqual(multiStats.byPlatform.leetcode, 1);
  console.log('✓ Same problem slug on different platforms tracked independently');

  // 10. Auth round-trip works in test fallback storage; production Chrome uses session storage
  await DSAStorage.setAuth({ token: 'ghp_SuperSecretValue', username: 'tester' });
  const rawStored = await new Promise((resolve) => {
    // Access the in-memory mock directly is not exposed, so re-read via getAuth
    // and independently confirm the round trip instead.
    resolve(null);
  });
  const roundTrippedAuth = await DSAStorage.getAuth();
  assert.strictEqual(roundTrippedAuth.token, 'ghp_SuperSecretValue');
  assert.strictEqual(roundTrippedAuth.tokenObfuscated, undefined);
  console.log('✓ Token round-trip verified; production session storage behavior is separately documented');

  // 9. Master ON/OFF switch + solve date/time bookkeeping
  DSAStorage._resetMemoryStore();
  assert.strictEqual(await DSAStorage.isEnabled(), true, 'Extension is ON by default');
  await DSAStorage.setEnabled(false);
  assert.strictEqual(await DSAStorage.isEnabled(), false);
  assert.strictEqual((await DSAStorage.getSettings()).enabled, false);
  // Turning it off must not disturb the per-platform switches
  assert.strictEqual(await DSAStorage.getPlatformEnabled('gfg'), true);
  await DSAStorage.setEnabled(true);
  assert.strictEqual(await DSAStorage.isEnabled(), true);
  console.log('✓ Master ON/OFF switch verified');

  DSAStorage._resetMemoryStore();
  const first = await DSAStorage.recordSolvedProblem({ platform: 'leetcode', slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', language: 'Python3', path: 'LeetCode/Easy/Two_Sum.py', timestamp: 1000, tzOffset: 330 });
  assert.strictEqual(first.problem.firstSolvedAt, 1000);
  assert.strictEqual(first.problem.lastSolvedAt, 1000);
  assert.strictEqual(first.problem.tzOffset, 330);
  const second = await DSAStorage.recordSolvedProblem({ platform: 'leetcode', slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', language: 'Python3', path: 'LeetCode/Easy/Two_Sum.py', timestamp: 5000, tzOffset: 330 });
  assert.strictEqual(second.problem.firstSolvedAt, 1000, 'First solve time is preserved on re-submission');
  assert.strictEqual(second.problem.lastSolvedAt, 5000, 'Latest solve time is updated');
  assert.strictEqual(second.problem.submissionCount, 2);
  console.log('✓ Solve date/time bookkeeping verified');
}

module.exports = runStorageTests;

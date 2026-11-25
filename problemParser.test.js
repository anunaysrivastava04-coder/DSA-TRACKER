/**
 * Unit Tests for ProblemParser
 */

const assert = require('assert');
const ProblemParser = require('../problemParser.js');

function runProblemParserTests() {
  console.log('\n--- Running ProblemParser Tests ---');

  // 1. Difficulty Normalization
  assert.strictEqual(ProblemParser.normalizeDifficulty('Easy'), 'Easy');
  assert.strictEqual(ProblemParser.normalizeDifficulty('basic'), 'Easy');
  assert.strictEqual(ProblemParser.normalizeDifficulty('School'), 'Easy');
  assert.strictEqual(ProblemParser.normalizeDifficulty('Medium'), 'Medium');
  assert.strictEqual(ProblemParser.normalizeDifficulty('med'), 'Medium');
  assert.strictEqual(ProblemParser.normalizeDifficulty('Hard'), 'Hard');
  assert.strictEqual(ProblemParser.normalizeDifficulty(null), 'Easy');
  console.log('✓ Difficulty normalization passed');

  // 2. Language Normalization & Extensions
  const cppInfo = ProblemParser.normalizeLanguage('C++');
  assert.strictEqual(cppInfo.ext, '.cpp');
  assert.strictEqual(cppInfo.name, 'C++');

  const pyInfo = ProblemParser.normalizeLanguage('Python3');
  assert.strictEqual(pyInfo.ext, '.py');

  const javaInfo = ProblemParser.normalizeLanguage('Java');
  assert.strictEqual(javaInfo.ext, '.java');

  const jsInfo = ProblemParser.normalizeLanguage('JavaScript');
  assert.strictEqual(jsInfo.ext, '.js');
  console.log('✓ Language mapping and extensions passed');

  // 3. Filename Sanitization
  assert.strictEqual(
    ProblemParser.sanitizeTitleToFilename('Two Sum - Pairs with 0 Sum'),
    'Two_Sum_Pairs_with_0_Sum'
  );
  assert.strictEqual(
    ProblemParser.sanitizeTitleToFilename('1. 0/1 Knapsack Problem!!!'),
    '0_1_Knapsack_Problem'
  );
  assert.strictEqual(
    ProblemParser.sanitizeTitleToFilename('Detect Cycle in a Directed Graph?'),
    'Detect_Cycle_in_a_Directed_Graph'
  );
  // Security: path traversal / reserved-name attempts never escape the folder
  assert.strictEqual(ProblemParser.sanitizeTitleToFilename('../../etc/passwd'), 'etc_passwd');
  assert.strictEqual(ProblemParser.sanitizeTitleToFilename('...'), 'Solution');
  console.log('✓ Filename sanitization passed (including path-traversal guard)');

  // 4. URL Slug Extraction & Platform Detection
  assert.strictEqual(
    ProblemParser.extractSlugFromUrl('https://www.geeksforgeeks.org/problems/two-sum-pairs-with-0-sum0012/1'),
    'two-sum-pairs-with-0-sum0012'
  );
  assert.strictEqual(
    ProblemParser.extractSlugFromUrl('https://practice.geeksforgeeks.org/problems/kadanes-algorithm-1587115620/1'),
    'kadanes-algorithm-1587115620'
  );
  assert.strictEqual(
    ProblemParser.extractSlugFromUrl('https://leetcode.com/problems/two-sum/'),
    'two-sum'
  );
  assert.strictEqual(
    ProblemParser.extractSlugFromUrl('https://www.hackerrank.com/challenges/simple-array-sum/problem'),
    'simple-array-sum'
  );

  assert.strictEqual(ProblemParser.detectPlatform('https://www.geeksforgeeks.org/problems/two-sum'), 'gfg');
  assert.strictEqual(ProblemParser.detectPlatform('https://practice.geeksforgeeks.org/problems/two-sum'), 'gfg');
  assert.strictEqual(ProblemParser.detectPlatform('https://leetcode.com/problems/two-sum/'), 'leetcode');
  assert.strictEqual(ProblemParser.detectPlatform('https://www.hackerrank.com/challenges/two-sum'), 'hackerrank');
  assert.strictEqual(ProblemParser.detectPlatform('https://evil.example.com/leetcode.com/problems/x'), null);
  assert.strictEqual(ProblemParser.detectPlatform(''), null);
  console.log('✓ Slug extraction & platform detection (incl. spoof resistance) passed');

  // 5. Repository File Path Formatting (now platform-aware)
  assert.strictEqual(
    ProblemParser.getRepositoryFilePath('gfg', 'Easy', 'Two Sum', 'C++'),
    'GeeksforGeeks/Easy/Two_Sum.cpp'
  );
  assert.strictEqual(
    ProblemParser.getRepositoryFilePath('leetcode', 'Medium', 'Kadane\'s Algorithm', 'Python3'),
    'LeetCode/Medium/Kadane_s_Algorithm.py'
  );
  assert.strictEqual(
    ProblemParser.getRepositoryFilePath('hackerrank', 'Hard', 'Word Ladder II', 'Java'),
    'HackerRank/Hard/Word_Ladder_II.java'
  );
  console.log('✓ Platform-aware repository file path generation passed');

  // 6. Metadata Header Generation
  const cppHeader = ProblemParser.generateCodeHeader({
    title: 'Two Sum',
    url: 'https://geeksforgeeks.org/problems/two-sum',
    difficulty: 'Easy',
    language: 'C++',
    timestamp: 1700000000000,
    platform: 'gfg'
  });
  assert(cppHeader.includes('/*'));
  assert(cppHeader.includes('* Problem: Two Sum'));
  assert(cppHeader.includes('* Source: GeeksforGeeks'));
  assert(cppHeader.includes('* Difficulty: Easy'));
  assert(cppHeader.includes('* Language: C++'));
  assert(cppHeader.includes('* Created by Anunay Srivastava'));
  assert(cppHeader.includes('*/'));

  const pyHeader = ProblemParser.generateCodeHeader({
    title: 'Two Sum',
    url: 'https://leetcode.com/problems/two-sum',
    difficulty: 'Easy',
    language: 'Python3',
    timestamp: 1700000000000,
    platform: 'leetcode'
  });
  assert(pyHeader.startsWith('# Problem: Two Sum'));
  assert(pyHeader.includes('# Source: LeetCode'));

  // Security: control characters / injected newlines in a scraped title never
  // reach the generated header unsanitized.
  const injectedHeader = ProblemParser.generateCodeHeader({
    title: 'Evil\u0000Title\nFAKE: injected',
    url: 'https://leetcode.com/problems/x',
    difficulty: 'Easy',
    language: 'Python3',
    timestamp: 1700000000000,
    platform: 'leetcode'
  });
  assert(!injectedHeader.includes('\u0000'));
  console.log('✓ Language-specific, platform-aware & sanitized header generation passed');

  // 6b. Date & time formatting (solver's own timezone, explicit UTC offset)
  const ts = Date.UTC(2026, 10, 25, 8, 3, 4); // 25 Nov 2026 08:03:04 UTC
  const ist = ProblemParser.formatSolvedDateTime(ts, 330);
  assert.strictEqual(ist.date, '25 Nov 2026');
  assert.strictEqual(ist.time, '01:33 PM');
  assert.strictEqual(ist.timeSeconds, '01:33:04 PM');
  assert.strictEqual(ist.tz, 'UTC+05:30');
  assert.strictEqual(ist.full, '25 Nov 2026, 01:33 PM (UTC+05:30)');
  assert.strictEqual(ist.utc, '2026-11-25 08:03:04 UTC');
  assert.strictEqual(ProblemParser.formatSolvedDateTime(ts, 0).time, '08:03 AM');
  assert.strictEqual(ProblemParser.formatSolvedDateTime(ts, -300).full, '25 Nov 2026, 03:03 AM (UTC-05:00)');
  // midnight / noon edge cases
  assert.strictEqual(ProblemParser.formatSolvedDateTime(Date.UTC(2026, 0, 1, 0, 5, 0), 0).time, '12:05 AM');
  assert.strictEqual(ProblemParser.formatSolvedDateTime(Date.UTC(2026, 0, 1, 12, 5, 0), 0).time, '12:05 PM');
  // day rollover caused by the offset
  assert.strictEqual(ProblemParser.formatSolvedDateTime(Date.UTC(2026, 11, 31, 20, 0, 0), 330).date, '01 Jan 2027');
  assert.strictEqual(ProblemParser.formatOffsetLabel(0), 'UTC');
  assert.strictEqual(ProblemParser.formatOffsetLabel(330), 'UTC+05:30');
  assert.strictEqual(ProblemParser.formatOffsetLabel(-210), 'UTC-03:30');

  const stamped = ProblemParser.generateCodeHeader({
    title: 'Two Sum',
    url: 'https://leetcode.com/problems/two-sum',
    difficulty: 'Easy',
    language: 'Python3',
    timestamp: ts,
    platform: 'leetcode',
    tzOffset: 330
  });
  assert(stamped.includes('# Solved on: 25 Nov 2026'));
  assert(stamped.includes('# Solved at: 01:33:04 PM (UTC+05:30)'));
  assert(stamped.includes('# Solved at (UTC): 2026-11-25 08:03:04 UTC'));
  console.log('✓ Solution date & time formatting and header stamps passed');

  // 7. Submission Result Acceptance Detection (GFG, LeetCode, HackerRank wording)
  assert.strictEqual(ProblemParser.isSubmissionAccepted('Problem Solved Successfully'), true);
  assert.strictEqual(ProblemParser.isSubmissionAccepted('Correct Answer. Total Points Scored: 4/4'), true);
  assert.strictEqual(ProblemParser.isSubmissionAccepted('All test cases passed'), true);
  assert.strictEqual(ProblemParser.isSubmissionAccepted('Accepted'), true);
  assert.strictEqual(ProblemParser.isSubmissionAccepted('All tests passed'), true);
  assert.strictEqual(ProblemParser.isSubmissionAccepted('Wrong Answer on testcase 14'), false);
  assert.strictEqual(ProblemParser.isSubmissionAccepted('Compilation Error: line 4 error'), false);
  assert.strictEqual(ProblemParser.isSubmissionAccepted('Time Limit Exceeded'), false);
  assert.strictEqual(ProblemParser.isSubmissionAccepted('Partially solved (50/100)'), false);
  console.log('✓ Submission result acceptance/rejection detection passed (3 platforms)');
}

module.exports = runProblemParserTests;

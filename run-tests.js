/**
 * DSA Tracker - Automated Test Suite Runner
 * Runs all unit and integration tests across parser, storage, and GitHub client.
 */

const runProblemParserTests = require('./problemParser.test.js');
const runStorageTests = require('./storage.test.js');
const runGitHubTests = require('./github.test.js');
const runAuthTests = require('./auth.test.js');
const runSessionStorageTests = require('./sessionStorage.test.js');
const runSecurityTests = require('./security.test.js');

async function main() {
  console.log('==============================================');
  console.log('       DSA Tracker - Test Suite Execution      ');
  console.log('==============================================');

  try {
    runProblemParserTests();
    await runStorageTests();
    await runGitHubTests();
    await runAuthTests();
    await runSessionStorageTests();
    runSecurityTests();

    console.log('\n==============================================');
    console.log('  🎉 ALL TESTS PASSED SUCCESSFULLY! (100%)    ');
    console.log('==============================================\n');
  } catch (error) {
    console.error('\n❌ TEST FAILURE:', error);
    process.exit(1);
  }
}

main();

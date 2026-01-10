require('dotenv').config();
const axios = require('axios');

const {
  TESTRAIL_DOMAIN,
  TESTRAIL_USERNAME,
  TESTRAIL_PASSWORD,
  TESTRAIL_PROJECT_ID,
  ADHOC_TESTRUNID
} = process.env;

const AUTH = {
  username: TESTRAIL_USERNAME,
  password: TESTRAIL_PASSWORD
};

// -------------------------
// Helpers
// -------------------------

// Extract TestRail Case ID from [C####]
function extractCaseId(fullTitle) {
  if (!fullTitle) return null;
  const match = fullTitle.match(/\[?C(\d+)\]?/i);
  return match ? parseInt(match[1], 10) : null;
}

// Extract Project and Suite IDs from [P####] and [S####]
function extractProjectAndSuite(fullTitle) {
  let projectId = TESTRAIL_PROJECT_ID ? parseInt(TESTRAIL_PROJECT_ID, 10) : null;
  let suiteId = 1;

  const pMatch = fullTitle.match(/\[P(\d+)\]/i);
  const sMatch = fullTitle.match(/\[S(\d+)\]/i);

  if (pMatch) projectId = parseInt(pMatch[1], 10);
  if (sMatch) suiteId = parseInt(sMatch[1], 10);

  return { projectId, suiteId };
}

// Build a readable run name from the test file path
function extractRunNameFromTests(tests = []) {
  const now = new Date().toLocaleString();
  for (const test of tests) {
    const filePath = test.file?.replace(/\\/g, '/') || '';
    const match = filePath.toLowerCase().split('cypress/e2e/')[1];
    if (match) {
      const parts = match.split('/');
      const group = parts[0].toUpperCase();
      const subgroup = parts[1]?.toUpperCase();
      return subgroup
        ? `${group}-${subgroup} Automated Run (${now})`
        : `${group} Automated Run (${now})`;
    }
  }
  return `Automated Cypress Run (${now})`;
}

// Fetch valid TestRail case IDs for a given project and suite
async function getValidCaseIds(projectId, suiteId, caseIds) {
  try {
    const res = await axios.get(
      `${TESTRAIL_DOMAIN}/index.php?/api/v2/get_cases/${projectId}&suite_id=${suiteId}`,
      { auth: AUTH }
    );

    let cases = [];
    if (Array.isArray(res.data)) {
      cases = res.data;
    } else if (res.data && Array.isArray(res.data.cases)) {
      cases = res.data.cases;
    } else if (res.data && res.data.id) {
      // sometimes returns a single object
      cases = [res.data];
    } else {
      console.error('❌ Unexpected response shape for get_cases:', res.data);
      return [];
    }

    const validSet = new Set(cases.map(c => c.id));
    return caseIds.filter(id => validSet.has(id));
  } catch (err) {
    console.error('❌ Failed to fetch TestRail cases:', err?.response?.data || err.message);
    return [];
  }
}

// Create a TestRail run
async function createTestRun(projectId, caseIds = [], suiteId = 1, runName = null) {
  const payload = {
    name: runName || `Automated Cypress Run - ${new Date().toLocaleString()}`,
    suite_id: suiteId,
    include_all: false,
    case_ids: caseIds
  };

  console.log('📤 Creating TestRail Run');
  console.log(`   ➤ Project ID: ${projectId}`);
  console.log(`   ➤ Suite ID: ${suiteId}`);
  console.log(`   ➤ Run Name: ${payload.name}`);
  console.log(`   ➤ Case IDs: ${caseIds.join(', ')}`);

  if (!projectId || !suiteId || caseIds.length === 0) {
    console.error('❌ Missing required data for TestRail run creation.');
    return null;
  }

  try {
    const res = await axios.post(
      `${TESTRAIL_DOMAIN}/index.php?/api/v2/add_run/${projectId}`,
      payload,
      { auth: AUTH }
    );
    return res.data.id;
  } catch (err) {
    console.error('❌ TestRail Run creation failed:', err?.response?.data || err.message);
    return null;
  }
}

// -------------------------
// NEW: ADHOC mode
// -------------------------

/**
 * adhocTestResults()
 * - GET /api/v2/get_tests/{ADHOC_TESTRUNID}
 * - Builds mapping: testRunID (tests[i].id), testRunCaseID (tests[i].case_id)
 * - Extracts Cypress case IDs from mochawesome using extractCaseId()
 * - POST results only for mochawesome cases that exist in this adhoc run
 */
async function adhocTestResults(passed = [], failed = [], adhocRunIdArg = null) {
  const adhocRunId = adhocRunIdArg || ADHOC_TESTRUNID;

  if (!TESTRAIL_DOMAIN || !TESTRAIL_USERNAME || !TESTRAIL_PASSWORD) {
    console.warn('⚠ TestRail not fully configured. Skipping.');
    return;
  }
  if (!adhocRunId) {
    console.warn('⚠ ADHOC_TESTRUNID not provided. Skipping adhoc reporting.');
    return;
  }

  const allTests = [...passed, ...failed];

  // 1) Collect mochawesome case ids
  const mochawesomeCaseIds = Array.from(
    new Set(
      allTests
        .map(t => extractCaseId(t.title || t.name || t.fullTitle || ''))
        .filter(Boolean)
    )
  );

  console.log(`🧩 ADHOC Run Mode: RunID=${adhocRunId}`);
  console.log(`🔍 Mochawesome unique case IDs (${mochawesomeCaseIds.length}):`, mochawesomeCaseIds);

  if (mochawesomeCaseIds.length === 0) {
    console.warn('⚠ No valid [C####] case IDs found in mochawesome results. Nothing to report.');
    return;
  }

  // 2) GET get_tests/{runId} with pagination
  const runTests = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const url = `${TESTRAIL_DOMAIN}/index.php?/api/v2/get_tests/${adhocRunId}&limit=${limit}&offset=${offset}`;
    const res = await axios.get(url, { auth: AUTH });

    const testsArr = res.data?.tests || [];
    if (!Array.isArray(testsArr)) {
      console.error('❌ Unexpected response for get_tests:', res.data);
      break;
    }

    // Map to your requested names
    for (const t of testsArr) {
      runTests.push({
        testRunID: t.id,           // <-- TestRail test.id (run-specific)
        testRunCaseID: t.case_id,  // <-- TestRail case_id (the C####)
        status_id: t.status_id,
        title: t.title
      });
    }

    // Stop paging when no more
    const size = res.data?.size;
    const got = testsArr.length;
    if (!got) break;

    // If TestRail gives size, stop when we've covered it
    if (typeof size === 'number') {
      offset += got;
      if (offset >= size) break;
    } else {
      // fallback: stop if less than limit
      if (got < limit) break;
      offset += limit;
    }
  }

  console.log(`📥 ADHOC get_tests fetched ${runTests.length} test(s) from RunID ${adhocRunId}`);

  // Build lookups
  const runCaseIdSet = new Set(runTests.map(t => t.testRunCaseID));
  const caseIdToTestId = new Map(); // optional mapping case_id -> test.id
  for (const t of runTests) {
    if (!caseIdToTestId.has(t.testRunCaseID)) {
      caseIdToTestId.set(t.testRunCaseID, t.testRunID);
    }
  }

  // 3) Only keep mochawesome cases that exist in the adhoc run
  const matchedCaseIds = mochawesomeCaseIds.filter(cid => runCaseIdSet.has(cid));
  const missingInRun = mochawesomeCaseIds.filter(cid => !runCaseIdSet.has(cid));

  if (missingInRun.length) {
    console.warn(`⚠ These mochawesome case IDs are NOT in ADHOC run ${adhocRunId} (skipping):`, missingInRun);
  }
  if (!matchedCaseIds.length) {
    console.warn(`⚠ No mochawesome cases matched ADHOC run ${adhocRunId}. Nothing to report.`);
    return;
  }

  // 4) Build results only for matched case ids
  const results = [];
  for (const test of allTests) {
    const caseId = extractCaseId(test.title || test.name || test.fullTitle || '');
    if (!caseId) continue;
    if (!runCaseIdSet.has(caseId)) continue;

    // optional: show which test.id in the run this case maps to
    const testRunID = caseIdToTestId.get(caseId);

    results.push({
      case_id: caseId,
      status_id: test.state === 'passed' ? 1 : 5,
      comment: test.error || (test.state === 'passed' ? `Test passed ✅ (RunTestID ${testRunID})` : `Failed ❌ (RunTestID ${testRunID})`)
    });
  }

  // Deduplicate results by case_id (keep last)
  const deduped = [];
  const seen = new Map();
  for (const r of results) seen.set(r.case_id, r);
  for (const [, v] of seen) deduped.push(v);

  console.log(`📦 ADHOC matched cases to report: ${matchedCaseIds.length}`);
  console.log(`📦 ADHOC results payload count (deduped): ${deduped.length}`);

  // 5) POST results for cases in this adhoc run only
  try {
    await axios.post(
      `${TESTRAIL_DOMAIN}/index.php?/api/v2/add_results_for_cases/${adhocRunId}`,
      { results: deduped },
      { auth: AUTH }
    );
    console.log(`✅ ADHOC: Reported ${deduped.length} result(s) to TestRail RunID ${adhocRunId}`);
  } catch (err) {
    console.error('❌ ADHOC: Error reporting results to TestRail:', err?.response?.data || err.message);
  }
}

// -------------------------
// Existing Reporter (group by P/S, create runs, etc.)
// -------------------------

exports.reportToTestRail = async (passed = [], failed = []) => {
  if (!TESTRAIL_DOMAIN || !TESTRAIL_USERNAME || !TESTRAIL_PASSWORD) {
    console.warn('⚠ TestRail not fully configured. Skipping.');
    return;
  }

  const allTests = [...passed, ...failed];
  const entries = allTests
    .map(test => {
      const fullTitle = test.fullTitle || test.name || '';
      const caseId = extractCaseId(fullTitle);
      if (!caseId) return null;

      const { projectId, suiteId } = extractProjectAndSuite(fullTitle);
      const state = test.state;
      const comment = test.error || (state === 'passed' ? 'Test passed ✅' : '');
      return { projectId, suiteId, caseId, state, comment, file: test.file, test };
    })
    .filter(Boolean);

  // Group by project-suite
  const groups = {};
  for (const e of entries) {
    const key = `${e.projectId}-${e.suiteId}`;
    if (!groups[key]) groups[key] = { projectId: e.projectId, suiteId: e.suiteId, entries: [] };
    groups[key].entries.push(e);
  }

  for (const key of Object.keys(groups)) {
    const { projectId, suiteId, entries } = groups[key];
    const caseIds = Array.from(new Set(entries.map(e => e.caseId)));
    console.log(`🔍 Found ${caseIds.length} unique TestRail Case IDs for P${projectId}/S${suiteId}:`, caseIds);

    const validCaseIds = await getValidCaseIds(projectId, suiteId, caseIds);
    const invalid = caseIds.filter(id => !validCaseIds.includes(id));
    if (invalid.length) console.warn('⚠ Omitting unrecognized TestRail IDs:', invalid);
    if (!validCaseIds.length) {
      console.warn(`⚠ No valid cases for P${projectId}/S${suiteId}. Skipping run.`);
      continue;
    }

    const runName = extractRunNameFromTests(entries.map(e => e.test));
    const runId = await createTestRun(projectId, validCaseIds, suiteId, runName);
    if (!runId) {
      console.warn('⚠ Skipping result upload due to failed run creation.');
      continue;
    }

    const entriesForResults = entries.filter(e => validCaseIds.includes(e.caseId));
    const results = entriesForResults.map(e => ({
      case_id: e.caseId,
      status_id: e.state === 'passed' ? 1 : 5,
      comment: e.comment
    }));

    try {
      await axios.post(
        `${TESTRAIL_DOMAIN}/index.php?/api/v2/add_results_for_cases/${runId}`,
        { results },
        { auth: AUTH }
      );
      console.log(`✅ Reported ${results.length} results to TestRail RunID ${runId}, ProjectID ${projectId}`);
    } catch (err) {
      console.error('❌ Error reporting results to TestRail:', err?.response?.data || err.message);
    }
  }
};

// Export the new adhoc function
exports.adhocTestResults = adhocTestResults;

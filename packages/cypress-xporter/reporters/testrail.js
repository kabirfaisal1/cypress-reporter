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

// Prevent duplicate run creation per (projectId-suiteId) within the same execution
// key => runId
const createdRunsByGroupKey = new Map();

// -------------------------
// Helpers
// -------------------------

function extractCaseId(fullTitle) {
  if (!fullTitle) return null;
  const match = fullTitle.match(/\[?C(\d+)\]?/i);
  return match ? parseInt(match[1], 10) : null;
}

function extractProjectAndSuite(fullTitle) {
  let projectId = TESTRAIL_PROJECT_ID ? parseInt(TESTRAIL_PROJECT_ID, 10) : null;
  let suiteId = 1;

  const pMatch = fullTitle.match(/\[P(\d+)\]/i);
  const sMatch = fullTitle.match(/\[S(\d+)\]/i);

  if (pMatch) projectId = parseInt(pMatch[1], 10);
  if (sMatch) suiteId = parseInt(sMatch[1], 10);

  return { projectId, suiteId };
}

function extractRunNameFromTests(tests = []) {
  const now = new Date().toLocaleString();

  for (const test of tests) {
    const filePath = test.file?.replace(/\\/g, '/') || '';
    const match = filePath.toLowerCase().split('cypress/e2e/')[1];
    if (match) {
      const parts = match.split('/');
      const group = parts[0].toUpperCase();
      const subgroup = parts[1]?.toUpperCase();

      // Original naming (no XPORTER tag)
      return subgroup
        ? `${group}-${subgroup} Automated Run (${now})`
        : `${group} Automated Run (${now})`;
    }
  }

  return `Automated Cypress Run (${now})`;
}

/**
 * ✅ PAGINATED get_cases
 * Fixes missing/“unrecognized” IDs when your suite has > 250 cases.
 */
async function getValidCaseIds(projectId, suiteId, caseIds) {
  try {
    const validSet = new Set();
    let offset = 0;
    const limit = 250;

    while (true) {
      const url =
        `${TESTRAIL_DOMAIN}/index.php?/api/v2/get_cases/${projectId}` +
        `&suite_id=${suiteId}&limit=${limit}&offset=${offset}`;

      const res = await axios.get(url, { auth: AUTH });

      // TestRail usually returns: { offset, limit, size, _links, cases: [] }
      // but some setups might return arrays or slightly different shapes.
      const casesArr = Array.isArray(res.data)
        ? res.data
        : (res.data?.cases || []);

      if (!Array.isArray(casesArr)) {
        console.error('❌ Unexpected response shape for get_cases:', res.data);
        break;
      }

      // Add ids from this page
      for (const c of casesArr) {
        if (c && typeof c.id === 'number') validSet.add(c.id);
      }

      // Stop conditions
      const size = res.data?.size;
      const got = casesArr.length;

      if (!got) break;

      if (typeof size === 'number') {
        offset += got;
        if (offset >= size) break;
      } else {
        // fallback: stop when last page smaller than limit
        if (got < limit) break;
        offset += limit;
      }
    }

    console.log(`✅ Loaded ${validSet.size} TestRail case(s) for P${projectId}/S${suiteId}`);

    return caseIds.filter(id => validSet.has(id));
  } catch (err) {
    console.error('❌ Failed to fetch TestRail cases:', err?.response?.data || err.message);
    return [];
  }
}

async function createTestRun(projectId, caseIds = [], suiteId = 1, runName = null, groupKey = null) {
  // If we already created a run for this project/suite in THIS execution, reuse it
  if (groupKey && createdRunsByGroupKey.has(groupKey)) {
    const existingRunId = createdRunsByGroupKey.get(groupKey);
    console.log(`🟡 Reusing already-created TestRail RunID ${existingRunId} for ${groupKey} (prevents duplicate run).`);
    return existingRunId;
  }

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

    const runId = res.data.id;
    if (groupKey) createdRunsByGroupKey.set(groupKey, runId);

    return runId;
  } catch (err) {
    console.error('❌ TestRail Run creation failed:', err?.response?.data || err.message);
    return null;
  }
}

async function closeTestRun(runId) {
  try {
    await axios.post(
      `${TESTRAIL_DOMAIN}/index.php?/api/v2/close_run/${runId}`,
      {},
      { auth: AUTH }
    );
    console.log(`🔒 Closed TestRail RunID ${runId}`);
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error(`❌ Failed to close TestRail run ${runId} (HTTP ${status}):`, data || err.message);
  }
}

// -------------------------
// ADHOC mode (NO run creation, NO closing)
// -------------------------

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

    for (const t of testsArr) {
      runTests.push({
        testRunID: t.id,
        testRunCaseID: t.case_id,
        status_id: t.status_id,
        title: t.title
      });
    }

    const size = res.data?.size;
    const got = testsArr.length;
    if (!got) break;

    if (typeof size === 'number') {
      offset += got;
      if (offset >= size) break;
    } else {
      if (got < limit) break;
      offset += limit;
    }
  }

  console.log(`📥 ADHOC get_tests fetched ${runTests.length} test(s) from RunID ${adhocRunId}`);

  const runCaseIdSet = new Set(runTests.map(t => t.testRunCaseID));
  const caseIdToTestId = new Map();
  for (const t of runTests) {
    if (!caseIdToTestId.has(t.testRunCaseID)) {
      caseIdToTestId.set(t.testRunCaseID, t.testRunID);
    }
  }

  const matchedCaseIds = mochawesomeCaseIds.filter(cid => runCaseIdSet.has(cid));
  const missingInRun = mochawesomeCaseIds.filter(cid => !runCaseIdSet.has(cid));

  if (missingInRun.length) {
    console.warn(`⚠ These mochawesome case IDs are NOT in ADHOC run ${adhocRunId} (skipping):`, missingInRun);
  }
  if (!matchedCaseIds.length) {
    console.warn(`⚠ No mochawesome cases matched ADHOC run ${adhocRunId}. Nothing to report.`);
    return;
  }

  const results = [];
  for (const test of allTests) {
    const caseId = extractCaseId(test.title || test.name || test.fullTitle || '');
    if (!caseId) continue;
    if (!runCaseIdSet.has(caseId)) continue;

    const testRunID = caseIdToTestId.get(caseId);

    results.push({
      case_id: caseId,
      status_id: test.state === 'passed' ? 1 : 5,
      comment:
        test.error ||
        (test.state === 'passed'
          ? `Test passed ✅ (RunTestID ${testRunID})`
          : `Failed ❌ (RunTestID ${testRunID})`)
    });
  }

  const seen = new Map();
  for (const r of results) seen.set(r.case_id, r);
  const deduped = Array.from(seen.values());

  console.log(`📦 ADHOC matched cases to report: ${matchedCaseIds.length}`);
  console.log(`📦 ADHOC results payload count (deduped): ${deduped.length}`);

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
// Normal mode (create + close runs)
// -------------------------

exports.reportToTestRail = async (passed = [], failed = []) => {
  if (!TESTRAIL_DOMAIN || !TESTRAIL_USERNAME || !TESTRAIL_PASSWORD) {
    console.warn('⚠ TestRail not fully configured. Skipping.');
    return;
  }

  const all = [...passed, ...failed]
    .map(t => {
      const full = t.fullTitle || t.name || '';
      const cid = extractCaseId(full);
      if (!cid) return null;

      const { projectId, suiteId } = extractProjectAndSuite(full);
      return {
        projectId,
        suiteId,
        caseId: cid,
        state: t.state,
        comment: t.error || (t.state === 'passed' ? 'Test passed ✅' : ''),
        file: t.file,
        raw: t
      };
    })
    .filter(Boolean);

  const groups = {};
  for (const e of all) {
    const key = `${e.projectId}-${e.suiteId}`;
    groups[key] = groups[key] || { projectId: e.projectId, suiteId: e.suiteId, entries: [] };
    groups[key].entries.push(e);
  }

  for (const groupKey of Object.keys(groups)) {
    const { projectId, suiteId, entries } = groups[groupKey];
    const caseIds = Array.from(new Set(entries.map(e => e.caseId)));
    console.log(`🔍 Found ${caseIds.length} unique TestRail Case IDs for P${projectId}/S${suiteId}:`, caseIds);

    const valid = await getValidCaseIds(projectId, suiteId, caseIds);
    const invalid = caseIds.filter(id => !valid.includes(id));
    if (invalid.length) console.warn('⚠ Omitting unrecognized TestRail IDs:', invalid);
    if (!valid.length) {
      console.warn(`⚠ No valid cases for P${projectId}/S${suiteId}. Skipping run.`);
      continue;
    }

    const runName = extractRunNameFromTests(entries.map(e => e.raw));
    const runId = await createTestRun(projectId, valid, suiteId, runName, groupKey);

    if (!runId) {
      console.warn('⚠ Skipping result upload due to failed run creation.');
      continue;
    }

    const toReport = entries
      .filter(e => valid.includes(e.caseId))
      .map(e => ({
        case_id: e.caseId,
        status_id: e.state === 'passed' ? 1 : 5,
        comment: e.comment
      }));

    try {
      await axios.post(
        `${TESTRAIL_DOMAIN}/index.php?/api/v2/add_results_for_cases/${runId}`,
        { results: toReport },
        { auth: AUTH }
      );
      console.log(`✅ Reported ${toReport.length} results to TestRail RunID ${runId}, ProjectID ${projectId}`);
    } catch (err) {
      console.error('❌ Error reporting results to TestRail:', err?.response?.data || err.message);
    } finally {
      await closeTestRun(runId);
    }
  }
};

exports.adhocTestResults = adhocTestResults;

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
const createdRunsByGroupKey = new Map();

// Cache: get_case lookups (caseId -> case object | null)
const caseByIdCache = new Map();

// -------------------------
// Helpers
// -------------------------

function extractCaseIds(fullTitle) {
  if (!fullTitle) return [];
  const matches = [...fullTitle.matchAll(/\[?C(\d+)\]?/gi)];
  return matches.map(m => parseInt(m[1], 10));
}

// Backwards-compatible single-id helper (returns first match or null)
function extractCaseId(fullTitle) {
  const ids = extractCaseIds(fullTitle);
  return ids.length ? ids[0] : null;
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
    const lower = filePath.toLowerCase();
    const match = lower.split('cypress/e2e/')[1];

    if (match) {
      const parts = match.split('/');
      const group = (parts[0] || '').toUpperCase();
      const subgroup = (parts[1] || '').toUpperCase();

      return subgroup
        ? `${group}-${subgroup} Automated Run (${now})`
        : `${group} Automated Run (${now})`;
    }
  }

  return `Automated Cypress Run (${now})`;
}

/**
 * GET /get_case/{case_id}
 * Reliable validator for a specific case id.
 */
async function getCaseById(caseId) {
  if (caseByIdCache.has(caseId)) return caseByIdCache.get(caseId);

  try {
    const res = await axios.get(
      `${TESTRAIL_DOMAIN}/index.php?/api/v2/get_case/${caseId}`,
      { auth: AUTH }
    );
    caseByIdCache.set(caseId, res.data);
    return res.data;
  } catch (err) {
    // 404, permission, etc.
    caseByIdCache.set(caseId, null);
    return null;
  }
}

/**
 * Fast-path (optional): try get_cases first.
 * BUT: In some environments it stops at 250 and doesn't page correctly.
 * We'll use it if it returns a strong signal, otherwise we fallback to get_case/{id}.
 */
async function tryGetCasesFast(projectId, suiteId) {
  try {
    // Just request first page (limit=250). Some servers ignore paging anyway.
    const limit = 250;
    const url =
      `${TESTRAIL_DOMAIN}/index.php?/api/v2/get_cases/${projectId}` +
      `&suite_id=${suiteId}&limit=${limit}&offset=0`;

    const res = await axios.get(url, { auth: AUTH });

    const casesArr = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res.data?.cases)
        ? res.data.cases
        : [];

    if (!Array.isArray(casesArr)) return null;

    const size = res.data?.size; // total cases (if TestRail returns it)
    const got = casesArr.length;

    // Helpful debug:
    if (typeof size === 'number') {
      console.log(`ℹ️ get_cases P${projectId}/S${suiteId}: returned ${got} (size=${size})`);
    } else {
      console.log(`ℹ️ get_cases P${projectId}/S${suiteId}: returned ${got} (size=unknown)`);
    }

    const set = new Set(casesArr.map(c => c.id));

    // If the API tells us total size <= got, this page is effectively complete.
    if (typeof size === 'number' && size <= got) return set;

    // If got is tiny, probably filtered/permissions; not trustworthy for validation.
    if (got < 50) return null;

    // Otherwise: return as “partial hint set” (we still fallback per-id for misses)
    return set;
  } catch (err) {
    return null;
  }
}

/**
 *  The validator you actually need:
 * - For the case IDs you want to report, ensure they exist and belong to THIS suite.
 * - Uses get_case/{id} which you confirmed works in Postman (e.g. 5718).
 */
async function getValidCaseIds(projectId, suiteId, caseIds) {
  // optional fast set (may be partial)
  const fastSet = await tryGetCasesFast(projectId, suiteId);

  const valid = [];
  const invalid = [];

  // Validate only what you need (usually small list)
  for (const id of caseIds) {
    // If fastSet says it’s valid, accept immediately
    if (fastSet && fastSet.has(id)) {
      valid.push(id);
      continue;
    }

    // Fallback: get_case/{id}
    const c = await getCaseById(id);
    if (!c) {
      invalid.push(id);
      continue;
    }

    // Must match suite
    if (c.suite_id === suiteId) {
      valid.push(id);
    } else {
      // exists, but in different suite
      invalid.push(id);
      console.warn(`⚠ Case C${id} exists but suite_id=${c.suite_id} (expected S${suiteId}). Dropping.`);
    }
  }

  // Log validation summary
  console.log(`✅ Valid cases for P${projectId}/S${suiteId}: ${valid.length}/${caseIds.length}`);
  if (invalid.length) console.warn('⚠ excludeing unrecognized/mismatched TestRail IDs:', invalid);

  return valid;
}

async function createTestRun(projectId, caseIds = [], suiteId = 1, runName = null, groupKey = null) {
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

    const runId = res.data?.id;
    if (runId && groupKey) createdRunsByGroupKey.set(groupKey, runId);
    return runId || null;
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
        .flatMap(t => extractCaseIds(t.title || t.name || t.fullTitle || ''))
    )
  );

  console.log(`🧩 ADHOC Run Mode: RunID=${adhocRunId}`);
  console.log(`🔍 Mochawesome unique case IDs (${mochawesomeCaseIds.length}):`, mochawesomeCaseIds);

  if (!mochawesomeCaseIds.length) {
    console.warn('⚠ No valid [C####] case IDs found in mochawesome results. Nothing to report.');
    return;
  }

  // Pull all tests in the run (paged)
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

    offset += got;
    if (typeof size === 'number' && offset >= size) break;
    if (got < limit) break;
  }

  console.log(`📥 ADHOC get_tests fetched ${runTests.length} test(s) from RunID ${adhocRunId}`);

  const runCaseIdSet = new Set(runTests.map(t => t.testRunCaseID));
  const caseIdToTestId = new Map();
  for (const t of runTests) {
    if (!caseIdToTestId.has(t.testRunCaseID)) caseIdToTestId.set(t.testRunCaseID, t.testRunID);
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
    const caseIds = extractCaseIds(test.title || test.name || test.fullTitle || '');
    if (!caseIds.length) continue;

    for (const caseId of caseIds) {
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
  }

  // Deduplicate by case_id
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
    .flatMap(t => {
      const full = t.fullTitle || t.name || '';
      const cids = extractCaseIds(full);
      if (!cids.length) return [];

      const { projectId, suiteId } = extractProjectAndSuite(full);
      return cids.map(cid => ({
        projectId,
        suiteId,
        caseId: cid,
        state: t.state,
        comment: t.error || (t.state === 'passed' ? 'Test passed ✅' : ''),
        raw: t
      }));
    });

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

    // ✅ Key change: validates by get_case/{id} fallback, so no false drops
    const valid = await getValidCaseIds(projectId, suiteId, caseIds);

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

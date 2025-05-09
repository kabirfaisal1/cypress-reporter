require( 'dotenv' ).config();
const axios = require( 'axios' );
const fs = require( 'fs' );
const path = require( 'path' );

const {
  TESTRAIL_DOMAIN,
  TESTRAIL_USERNAME,
  TESTRAIL_PASSWORD,
  TESTRAIL_PROJECT_ID
} = process.env;

const AUTH = {
  username: TESTRAIL_USERNAME,
  password: TESTRAIL_PASSWORD
};

// ✅ Extract TestRail Case ID from test name (e.g., [C1234])
function extractCaseId ( testName )
{
  if ( !testName ) return null;
  const match = testName.match( /\[?C(\d+)\]?/i );
  return match ? parseInt( match[1], 10 ) : null;
}

// ✅ Extract Suite ID from test titles
function extractSuiteIdFromTestNames ( tests = [] )
{
  for ( const test of tests )
  {
    const title = test.fullTitle || test.name || '';
    const match = title.match( /\[S(\d+)\]/i );
    if ( match && match[1] )
    {
      console.log( `📌 Suite ID "${ match[1] }" extracted from test title: "${ title }"` );
      return parseInt( match[1], 10 );
    }
  }
  return 1; // fallback
}

// ✅ Extract Project ID from test titles
function extractProjectIdFromTestNames ( tests = [] )
{
  for ( const test of tests )
  {
    const title = test.fullTitle || test.name || '';
    const match = title.match( /\[P(\d+)\]/i );
    if ( match && match[1] )
    {
      console.log( `📌 Project ID "${ match[1] }" extracted from test title: "${ title }"` );
      return parseInt( match[1], 10 );
    }
  }
  return TESTRAIL_PROJECT_ID || null;
}

// ✅ Extract Run Name from file path (e.g., "SERVICES-PatientServiceAPI Automated Run")
function extractRunNameFromTests ( tests = [] )
{
  const now = new Date().toLocaleString();

  for ( const test of tests )
  {
    const file = test.file?.replace( /\\/g, "/" ) || "";
    const match = file.toLowerCase().split( "cypress/e2e/" )[1];

    if ( match )
    {
      const parts = match.split( "/" );

      if ( parts.length >= 2 )
      {
        return `${ parts[0].toUpperCase() }-${ parts[1].toUpperCase() } Automated Run (${ now })`;
      } else if ( parts.length === 1 )
      {
        return `${ parts[0].toUpperCase() } Automated Run (${ now })`;
      }
    }
  }

  return `Automated Cypress Run (${ now })`;
}

// ✅ Create TestRail Run
async function createTestRun ( projectId, caseIds = [], suiteId = 1, runName = null )
{
  const payload = {
    name: runName || `Automated Cypress Run - ${ new Date().toLocaleString() }`,
    suite_id: suiteId,
    include_all: false,
    case_ids: caseIds
  };

  console.log( `📤 Creating TestRail Run` );
  console.log( `   ➤ Project ID: ${ projectId }` );
  console.log( `   ➤ Suite ID: ${ suiteId }` );
  console.log( `   ➤ Case IDs: ${ caseIds.join( ', ' ) }` );
  console.log( `   ➤ Run Name: ${ payload.name }` );
  console.log( `   ➤ Run payload suite_id: ${ payload.suite_id }` );
  console.log( `   ➤ Run case_ids case_ids: ${ payload.case_ids }` );

  if ( !projectId || !suiteId || caseIds.length === 0 )
  {
    console.error( '❌ Missing required data for TestRail run creation.' );
    return null;
  }

  try
  {
    const res = await axios.post(
      `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_run/${ projectId }`,
      payload,
      { auth: AUTH }
    );
    return res.data.id;
  } catch ( err )
  {
    console.error( '❌ TestRail Run creation failed:', err?.response?.data || err.message || err );
    return null;
  }
}

// ✅ Main Exported Entry
exports.reportToTestRail = async ( passed = [], failed = [] ) =>
{
  if ( !TESTRAIL_DOMAIN || !TESTRAIL_USERNAME || !TESTRAIL_PASSWORD )
  {
    console.log( '⚠ TestRail not fully configured.' );
    return;
  }

  const allTests = [...passed, ...failed];

  const caseIds = Array.from(
    new Set(
      allTests
        .map( test => extractCaseId( test?.name ) )
        .filter( Boolean )
    )
  );

  console.log( `🔍 Found ${ caseIds.length } unique TestRail Case IDs:`, caseIds );

  if ( caseIds.length === 0 )
  {
    console.log( '⚠ No valid case IDs found.' );
    return;
  }

  const suiteId = extractSuiteIdFromTestNames( allTests );
  const projectId = extractProjectIdFromTestNames( allTests );

  if ( !projectId )
  {
    console.log( '❌ Project ID could not be determined from test titles or .env' );
    return;
  }

  const runName = extractRunNameFromTests( allTests );

  const runId = await createTestRun( projectId, caseIds, suiteId, runName );

  if ( !runId )
  {
    console.log( '⚠ Skipping result upload due to failed run creation.' );
    return;
  }

  const results = allTests
    .map( test =>
    {
      const caseId = extractCaseId( test.name );
      if ( !caseId ) return null;
      return {
        case_id: caseId,
        status_id: test.state === 'passed' ? 1 : 5,
        comment: test.error || 'Test passed ✅'
      };
    } )
    .filter( Boolean );

  try
  {
    await axios.post(
      `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_results_for_cases/${ runId }`,
      { results },
      { auth: AUTH }
    );
    console.log( `✅ Reported ${ results.length } results to TestRail for RunID ${ runId }, ProjectID ${ projectId }` );
  } catch ( err )
  {
    console.error( '❌ Error reporting results to TestRail:', err?.response?.data || err.message || err );
  }
};

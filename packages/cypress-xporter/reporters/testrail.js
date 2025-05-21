require( 'dotenv' ).config();
const axios = require( 'axios' );

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

// Extract TestRail Case ID from [C####]
function extractCaseId ( fullTitle )
{
  const match = fullTitle.match( /\[C(\d+)\]/i );
  return match ? parseInt( match[1], 10 ) : null;
}

// Extract Project and Suite IDs from [P####] and [S####]
function extractProjectAndSuite ( fullTitle )
{
  let projectId = TESTRAIL_PROJECT_ID ? parseInt( TESTRAIL_PROJECT_ID, 10 ) : null;
  let suiteId = 1;

  const pMatch = fullTitle.match( /\[P(\d+)\]/i );
  const sMatch = fullTitle.match( /\[S(\d+)\]/i );

  if ( pMatch ) projectId = parseInt( pMatch[1], 10 );
  if ( sMatch ) suiteId = parseInt( sMatch[1], 10 );

  console.log( `📌 Extracted Project ID ${ projectId }, Suite ID ${ suiteId } from "${ fullTitle }"` );
  return { projectId, suiteId };
}

// Build a readable run name from the test file path
function extractRunNameFromTests ( tests = [] )
{
  const now = new Date().toLocaleString();
  for ( const test of tests )
  {
    const filePath = test.file?.replace( /\\/g, '/' ) || '';
    const match = filePath.toLowerCase().split( 'cypress/e2e/' )[1];
    if ( match )
    {
      const parts = match.split( '/' );
      const group = parts[0].toUpperCase();
      const subgroup = parts[1]?.toUpperCase();
      return subgroup ? `${ group }-${ subgroup } Automated Run (${ now })` : `${ group } Automated Run (${ now })`;
    }
  }
  return `Automated Cypress Run (${ now })`;
}

// Fetch valid TestRail case IDs for a given project and suite
async function getValidCaseIds ( projectId, suiteId, caseIds )
{
  try
  {
    const res = await axios.get(
      `${ TESTRAIL_DOMAIN }/index.php?/api/v2/get_cases/${ projectId }&suite_id=${ suiteId }`,
      { auth: AUTH }
    );
    let cases = [];
    if ( Array.isArray( res.data ) )
    {
      cases = res.data;
    } else if ( res.data && Array.isArray( res.data.cases ) )
    {
      cases = res.data.cases;
    } else
    {
      console.error( '❌ Unexpected response shape for get_cases:', res.data );
      return [];
    }
    const validSet = new Set( cases.map( c => c.id ) );
    return caseIds.filter( id => validSet.has( id ) );
  } catch ( err )
  {
    console.error( '❌ Failed to fetch TestRail cases:', err?.response?.data || err.message );
    return [];
  }
}

// Create a TestRail run
async function createTestRun ( projectId, caseIds = [], suiteId = 1, runName = null )
{
  const payload = {
    name: runName || `Automated Cypress Run - ${ new Date().toLocaleString() }`,
    suite_id: suiteId,
    include_all: false,
    case_ids: caseIds
  };

  console.log( '📤 Creating TestRail Run' );
  console.log( `   ➤ Project ID: ${ projectId }` );
  console.log( `   ➤ Suite ID: ${ suiteId }` );
  console.log( `   ➤ Run Name: ${ payload.name }` );
  console.log( `   ➤ Case IDs: ${ caseIds.join( ', ' ) }` );

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
    console.error( '❌ TestRail Run creation failed:', err?.response?.data || err.message );
    return null;
  }
}

exports.reportToTestRail = async ( passed = [], failed = [] ) =>
{
  if ( !TESTRAIL_DOMAIN || !TESTRAIL_USERNAME || !TESTRAIL_PASSWORD )
  {
    console.warn( '⚠ TestRail not fully configured. Skipping.' );
    return;
  }

  const allTests = [...passed, ...failed];
  const entries = allTests.map( test =>
  {
    const fullTitle = test.fullTitle || test.name || '';
    const caseId = extractCaseId( fullTitle );
    if ( !caseId ) return null;
    const { projectId, suiteId } = extractProjectAndSuite( fullTitle );
    const state = test.state;
    const comment = test.error || ( state === 'passed' ? 'Test passed ✅' : '' );
    return { projectId, suiteId, caseId, state, comment, file: test.file, test };
  } ).filter( Boolean );

  // Group by project-suite
  const groups = {};
  for ( const e of entries )
  {
    const key = `${ e.projectId }-${ e.suiteId }`;
    if ( !groups[key] ) groups[key] = { projectId: e.projectId, suiteId: e.suiteId, entries: [] };
    groups[key].entries.push( e );
  }

  for ( const key of Object.keys( groups ) )
  {
    const { projectId, suiteId, entries } = groups[key];
    const caseIds = Array.from( new Set( entries.map( e => e.caseId ) ) );
    console.log( `🔍 Found ${ caseIds.length } unique TestRail Case IDs for P${ projectId }/S${ suiteId }:`, caseIds );

    const validCaseIds = await getValidCaseIds( projectId, suiteId, caseIds );
    const invalid = caseIds.filter( id => !validCaseIds.includes( id ) );
    if ( invalid.length ) console.warn( '⚠ Omitting unrecognized TestRail IDs:', invalid );
    if ( !validCaseIds.length )
    {
      console.warn( `⚠ No valid cases for P${ projectId }/S${ suiteId }. Skipping run.` );
      continue;
    }

    const runName = extractRunNameFromTests( entries.map( e => e.test ) );
    const runId = await createTestRun( projectId, validCaseIds, suiteId, runName );
    if ( !runId )
    {
      console.warn( '⚠ Skipping result upload due to failed run creation.' );
      continue;
    }

    // Only report results for valid cases
    const entriesForResults = entries.filter( e => validCaseIds.includes( e.caseId ) );
    if ( !entriesForResults.length )
    {
      console.warn( '⚠ No test results to report for RunID', runId );
      continue;
    }

    const results = entriesForResults.map( e => ( {
      case_id: e.caseId,
      status_id: e.state === 'passed' ? 1 : 5,
      comment: e.comment
    } ) );

    try
    {
      await axios.post(
        `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_results_for_cases/${ runId }`,
        { results },
        { auth: AUTH }
      );
      console.log( `✅ Reported ${ results.length } results to TestRail RunID ${ runId }, ProjectID ${ projectId }` );
    } catch ( err )
    {
      console.error( '❌ Error reporting results to TestRail:', err?.response?.data || err.message );
    }
  }
};

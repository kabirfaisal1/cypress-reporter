require( "dotenv" ).config();
const axios = require( "axios" );

const { TESTRAIL_DOMAIN, TESTRAIL_USERNAME, TESTRAIL_PASSWORD } = process.env;

const AUTH = {
  username: TESTRAIL_USERNAME,
  password: TESTRAIL_PASSWORD,
};

// ✅ Extracts TestRail Case ID from test title
function extractCaseId ( testName )
{
  if ( typeof testName !== "string" ) return null;
  const match = testName.match( /\[?C(\d+)\]?/i );
  return match ? parseInt( match[1], 10 ) : null;
}

// ✅ Extracts TestRail Suite ID from fullTitle (e.g., [S269])
function extractSuiteId ( tests )
{
  for ( const test of tests )
  {
    const fullTitle = test.fullTitle || test.name || "";
    const match = fullTitle.match( /\[S(\d+)\]/i );
    if ( match && match[1] )
    {
      return parseInt( match[1], 10 );
    }
  }
  return null; // Return null if not found
}

// ✅ Generates a run name based on file path
function extractRunNameFromTests ( tests )
{
  const now = new Date().toLocaleString();

  for ( const test of tests )
  {
    const file = test.file?.replace( /\\/g, "/" );
    if ( !file ) continue;

    const match = file.toLowerCase().split( "cypress/e2e/" )[1];
    const parts = match?.split( "/" );

    if ( parts?.length >= 2 )
    {
      return `${ parts[0].toUpperCase() }-${ parts[1].toUpperCase() } Automated Run (${ now })`;
    } else if ( parts?.length === 1 )
    {
      return `${ parts[0].toUpperCase() } Automated Run (${ now })`;
    }
  }

  return `Automated Cypress Run - (${ now })`;
}

// ✅ Creates a TestRail run, conditionally includes suite_id
async function createTestRun ( projectId, caseIds = [], suiteId = null, runName = null )
{
  const payload = {
    name: runName || `Automated Cypress Run - ${ new Date().toLocaleString() }`,
    include_all: false,
    case_ids: caseIds,
  };

  if ( typeof suiteId === "number" && suiteId > 0 )
  {
    payload.suite_id = suiteId;
  } else
  {
    console.warn( "⚠️ suite_id is missing or invalid. Not including in payload." );
  }

  console.log( "🧩 Creating Test Run with payload:", payload );

  const res = await axios.post(
    `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_run/${ projectId }`,
    payload,
    { auth: AUTH }
  );

  return res.data.id;
}

// ✅ Main export function
exports.reportToTestRail = async ( passed = [], failed = [], projectId ) =>
{
  if ( !TESTRAIL_DOMAIN || !TESTRAIL_USERNAME || !TESTRAIL_PASSWORD || !projectId )
  {
    console.log( "⚠️ TestRail not fully configured or missing Project ID." );
    return;
  }

  const allTests = [...passed, ...failed];

  const caseIds = Array.from(
    new Set(
      allTests
        .map( ( test ) =>
        {
          if ( !test.name )
          {
            console.warn( "⚠️ Skipping test with missing name:", test );
            return null;
          }
          return extractCaseId( test.name );
        } )
        .filter( Boolean )
    )
  );

  if ( caseIds.length === 0 )
  {
    console.log( "⚠️ No valid case IDs found." );
    return;
  }

  const suiteId = extractSuiteId( allTests ); // may be null if not found
  const runName = extractRunNameFromTests( allTests );

  console.log(
    `🧩 Creating TestRail Run for Project ${ projectId } with case IDs: ${ caseIds.join( ", " ) }${ suiteId ? ` and Suite ID: ${ suiteId }` : ""
    }`
  );

  const runId = await createTestRun( projectId, caseIds, suiteId, runName );
  console.log( `🚀 Created TestRail Run ID: ${ runId }` );

  const results = allTests
    .map( ( test ) =>
    {
      const caseId = extractCaseId( test.name );
      if ( !caseId ) return null;

      return {
        case_id: caseId,
        status_id: test.state === "passed" ? 1 : 5,
        comment: test.error || "Test passed ✅",
      };
    } )
    .filter( Boolean );

  await axios.post(
    `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_results_for_cases/${ runId }`,
    { results },
    { auth: AUTH }
  );

  console.log( `✅ Reported ${ results.length } results to TestRail for Project ID ${ projectId }` );
};

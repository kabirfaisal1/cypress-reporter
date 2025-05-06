require( 'dotenv' ).config();
const axios = require( 'axios' );

const {
    TESTRAIL_DOMAIN,
    TESTRAIL_USERNAME,
    TESTRAIL_PASSWORD,
} = process.env;

const AUTH = {
    username: TESTRAIL_USERNAME,
    password: TESTRAIL_PASSWORD
};

// Extracts TestRail Case ID from test title
function extractCaseId ( testName )
{
    const match = testName.match( /\[?C(\d+)\]?/i );
    return match ? parseInt( match[1], 10 ) : null;
}

// Extracts TestRail Suite ID from any test name (e.g., [S269])
function extractSuiteId ( tests )
{
    for ( const test of tests )
    {
        const match = test.name?.match( /\[S(\d+)\]/i );
        if ( match && match[1] )
        {
            return parseInt( match[1], 10 );
        }
    }
    return null;
}

async function createTestRun ( projectId, caseIds = [], suiteId = null )
{
    const runName = `Automated Cypress Run - ${ new Date().toLocaleString() }`;

    const payload = {
        name: runName,
        include_all: false,
        case_ids: caseIds
    };

    if ( suiteId )
    {
        payload.suite_id = suiteId; // ✅ Only include if detected
    }

    console.log( `🧩 Creating Test Run with payload:`, payload );

    const res = await axios.post(
        `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_run/${ projectId }`,
        payload,
        { auth: AUTH }
    );

    return res.data.id;
}

exports.reportToTestRail = async ( passed = [], failed = [], projectId ) =>
{
    if ( !TESTRAIL_DOMAIN || !TESTRAIL_USERNAME || !TESTRAIL_PASSWORD || !projectId )
    {
        console.log( '⚠️ TestRail not fully configured or missing Project ID.' );
        return;
    }

    const allTests = [...passed, ...failed];

    const caseIds = Array.from(
        new Set(
            allTests.map( test => extractCaseId( test.name ) ).filter( Boolean )
        )
    );

    if ( caseIds.length === 0 )
    {
        console.log( '⚠️ No valid case IDs found.' );
        return;
    }

    const suiteId = extractSuiteId( allTests ); // ⛏️ Dynamically detect [S###]

    console.log( `🧩 Creating TestRail Run for Project ${ projectId } with case IDs: ${ caseIds.join( ', ' ) }${ suiteId ? ` and Suite ID: ${ suiteId }` : '' }` );

    const runId = await createTestRun( projectId, caseIds, suiteId );

    console.log( `🚀 Created TestRail Run ID: ${ runId }` );

    const results = allTests.map( test =>
    {
        const caseId = extractCaseId( test.name );
        if ( !caseId ) return null;

        return {
            case_id: caseId,
            status_id: test.state === 'passed' ? 1 : 5,
            comment: test.error || 'Test passed ✅'
        };
    } ).filter( Boolean );

    await axios.post(
        `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_results_for_cases/${ runId }`,
        { results },
        { auth: AUTH }
    );

    console.log( `✅ Reported ${ results.length } results to TestRail for Project ID ${ projectId }` );
};

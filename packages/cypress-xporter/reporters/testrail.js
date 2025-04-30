require( 'dotenv' ).config();
const axios = require( 'axios' );

const {
    TESTRAIL_DOMAIN,
    TESTRAIL_USERNAME,
    TESTRAIL_PASSWORD,
    TESTRAIL_API_KEY
} = process.env;

const AUTH = {
    username: TESTRAIL_USERNAME,
    password: TESTRAIL_PASSWORD
};

function extractCaseId ( testName )
{
    const match = testName.match( /\[?C(\d+)\]?/i );
    return match ? parseInt( match[1], 10 ) : null;
}

async function createTestRun ( projectId, caseIds = [] )
{
    const runName = `Automated Cypress Run - ${ new Date().toLocaleString() }`;

    const payload = {
        name: runName,
        include_all: true,
        case_ids: caseIds
    };

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
    if ( !TESTRAIL_DOMAIN || !TESTRAIL_USERNAME || !TESTRAIL_API_KEY || !projectId )
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

    console.log( `🧩 Creating TestRail Run for Project ${ projectId } with case IDs: ${ caseIds.join( ', ' ) }` );

    const runId = await createTestRun( projectId, caseIds );

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

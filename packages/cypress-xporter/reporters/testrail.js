require( 'dotenv' ).config();
const axios = require( 'axios' );

const {
    TESTRAIL_DOMAIN,
    TESTRAIL_USERNAME,
    TESTRAIL_API_KEY
} = process.env;

const AUTH = {
    username: TESTRAIL_USERNAME,
    password: TESTRAIL_API_KEY
};

// Supports both "C123" and "[C123]" formats
function extractCaseId ( testName )
{
    const match = testName.match( /\[?C(\d+)\]?/i );
    return match ? parseInt( match[1], 10 ) : null;
}

async function createTestRun ( projectId )
{
    const runName = `Automated Cypress Run - ${ new Date().toLocaleString() }`;

    const res = await axios.post(
        `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_run/${ projectId }`,
        {
            name: runName,
            include_all: true
        },
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

    const runId = await createTestRun( projectId );
    console.log( `🚀 Reporting to TestRail Run: ${ runId }` );

    const results = [];

    for ( const test of [...passed, ...failed] )
    {
        const caseId = extractCaseId( test.name );
        if ( !caseId )
        {
            console.warn( `⚠️ Skipping test without TestRail Case ID: ${ test.name }` );
            continue;
        }

        results.push( {
            case_id: caseId,
            status_id: test.state === 'passed' ? 1 : 5,
            comment: test.error || 'Test passed ✅'
        } );
    }

    if ( results.length === 0 )
    {
        console.log( '⚠️ No TestRail test cases matched.' );
        return;
    }

    await axios.post(
        `${ TESTRAIL_DOMAIN }/index.php?/api/v2/add_results_for_cases/${ runId }`,
        { results },
        { auth: AUTH }
    );

    console.log( `✅ Reported ${ results.length } results to TestRail` );
};

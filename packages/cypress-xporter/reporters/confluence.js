const axios = require( 'axios' );
const fs = require( 'fs' );
const path = require( 'path' );
require( 'dotenv' ).config();

const {
    CONFLUENCE_BASE_URL,
    CONFLUENCE_USERNAME,
    CONFLUENCE_API_TOKEN,
    CONFLUENCE_SPACE_KEY,
    CONFLUENCE_PARENT_PAGE_ID
} = process.env;

const AUTH = {
    username: CONFLUENCE_USERNAME,
    password: CONFLUENCE_API_TOKEN
};

function generateTimestampTitle ()
{
    const now = new Date();
    const mm = String( now.getMonth() + 1 ).padStart( 2, '0' );
    const dd = String( now.getDate() ).padStart( 2, '0' );
    const yyyy = now.getFullYear();
    const hh = String( now.getHours() ).padStart( 2, '0' );
    const min = String( now.getMinutes() ).padStart( 2, '0' );
    const ss = String( now.getSeconds() ).padStart( 2, '0' );
    const ms = String( now.getMilliseconds() ).padStart( 3, '0' );
    return `${ mm }-${ dd }-${ yyyy }-${ hh }:${ min }:${ ss }_${ ms }_Cypress_Test_Log`;
}

function buildFailedTestsTable ( failed )
{
    if ( !failed.length ) return '<p>No failed tests 🎉</p>';

    const rows = failed.map( test =>
    {
        const error = ( test.error || '' ).replace( /\n/g, '<br/>' );
        const jira = test.jira || 'N/A';
        return `
      <tr>
        <td>${ test.file }</td>
        <td>${ test.name }</td>
        <td><pre>${ error }</pre></td>
        <td>${ jira }</td>
      </tr>`;
    } ).join( '' );

    return `
    <h2>❌ Cypress Test Failures</h2>
    <table>
      <colgroup><col /><col /><col /><col /></colgroup>
      <tbody>
        <tr>
          <th>📄 Spec File</th>
          <th>🧪 Test Name</th>
          <th>💥 Error</th>
          <th>🐞 Jira ID</th>
        </tr>
        ${ rows }
      </tbody>
    </table>
  `;
}

function buildSpecSummaryTable ( passedTests, failedTests )
{
    const specs = {};
    const allTests = [...passedTests, ...failedTests];

    for ( const test of allTests )
    {
        const specFile = path.basename( test.file || 'Unknown Spec' );

        if ( !specs[specFile] )
        {
            specs[specFile] = {
                total: 0,
                passed: 0,
                failed: 0,
                pending: 0,
                skipped: 0,
                duration: 0
            };
        }

        specs[specFile].total += 1;
        specs[specFile][test.state] += 1;
        specs[specFile].duration += 1; // assume 1 sec per test for now
    }

    const rows = Object.entries( specs ).map( ( [specName, data] ) =>
    {
        const formattedTime = formatDuration( data.duration );
        return `
            <tr>
                <td>${ specName }</td>
                <td>${ formattedTime }</td>
                <td>${ data.total }</td>
                <td>${ data.passed }</td>
                <td>${ data.failed }</td>
                <td>${ data.pending || '-' }</td>
                <td>${ data.skipped || '-' }</td>
            </tr>`;
    } ).join( '' );

    const totalTests = allTests.length;
    const totalPassed = passedTests.length;
    const totalFailed = failedTests.length;
    const totalPending = 0;
    const totalSkipped = 0;
    const totalDuration = formatDuration( allTests.length );

    const totalRow = `
        <tr>
            <td><b>Total</b></td>
            <td><b>${ totalDuration }</b></td>
            <td><b>${ totalTests }</b></td>
            <td><b>${ totalPassed }</b></td>
            <td><b>${ totalFailed }</b></td>
            <td><b>${ totalPending }</b></td>
            <td><b>${ totalSkipped }</b></td>
        </tr>`;

    return `
    <h2>🧪 Cypress Spec Summary</h2>
    <table>
      <colgroup><col /><col /><col /><col /><col /><col /><col /></colgroup>
      <tbody>
        <tr>
          <th>📄 Spec</th>
          <th>⏱ Time</th>
          <th>Total</th>
          <th>Passing</th>
          <th>Failing</th>
          <th>Pending</th>
          <th>Skipped</th>
        </tr>
        ${ rows }
        ${ totalRow }
      </tbody>
    </table>
    `;
}

function formatDuration ( seconds )
{
    const mins = Math.floor( seconds / 60 );
    const secs = seconds % 60;
    return `${ String( mins ).padStart( 2, '0' ) }:${ String( secs ).padStart( 2, '0' ) }`;
}

function generateDashboardHTML ( passed, failed, testRail = null, chartPath = null )
{
    const htmlTemplatePath = path.join( __dirname, '..', 'templates', 'dashboard.html' );

    if ( !fs.existsSync( htmlTemplatePath ) )
    {
        console.error( '❌ dashboard.html template not found at:', htmlTemplatePath );
        process.exit( 1 );
    }

    let html = fs.readFileSync( htmlTemplatePath, 'utf-8' );
    html = html.replace( /{{TOTAL_TESTS}}/g, passed.length + failed.length );
    html = html.replace( /{{PASSED_TESTS}}/g, passed.length );
    html = html.replace( /{{FAILED_TESTS}}/g, failed.length );
    html = html.replace( '{{SPEC_SUMMARY}}', buildSpecSummaryTable( passed, failed ) );
    html = html.replace( '{{FAILED_TEST_LOG}}', buildFailedTestsTable( failed ) );

    if ( testRail )
    {
        html = html.replace( '{{TESTRAIL_RUN_ID}}', testRail.runId || 'N/A' );
        html = html.replace( '{{TESTRAIL_TOTAL}}', testRail.total || 0 );
        html = html.replace( '{{TESTRAIL_PASSED}}', testRail.passed || 0 );
        html = html.replace( '{{TESTRAIL_FAILED}}', testRail.failed || 0 );
        html = html.replace( '{{TESTRAIL_CHART}}',
            chartPath
                ? `<ac:image><ri:attachment ri:filename="${ path.basename( chartPath ) }" /></ac:image>`
                : ''
        );
    } else
    {
        html = html.replace( '{{TESTRAIL_RUN_ID}}', 'N/A' );
        html = html.replace( '{{TESTRAIL_TOTAL}}', 'N/A' );
        html = html.replace( '{{TESTRAIL_PASSED}}', 'N/A' );
        html = html.replace( '{{TESTRAIL_FAILED}}', 'N/A' );
        html = html.replace( '{{TESTRAIL_CHART}}', '' );
    }

    return html;
}

async function createNewPage ( title, htmlBody )
{
    const res = await axios.post(
        `${ CONFLUENCE_BASE_URL }/rest/api/content`,
        {
            title,
            type: 'page',
            space: { key: CONFLUENCE_SPACE_KEY },
            ancestors: [{ id: CONFLUENCE_PARENT_PAGE_ID }],
            body: {
                storage: {
                    value: htmlBody,
                    representation: 'storage'
                }
            }
        },
        { auth: AUTH }
    );

    return res.data;
}

exports.uploadTestLogToConfluence = async ( passed, failed, testRail = null, chartPath = null ) =>
{
    if (
        !CONFLUENCE_BASE_URL ||
        !CONFLUENCE_USERNAME ||
        !CONFLUENCE_API_TOKEN ||
        !CONFLUENCE_SPACE_KEY ||
        !CONFLUENCE_PARENT_PAGE_ID
    )
    {
        console.log( '⚠️ Missing Confluence config in .env' );
        return;
    }

    try
    {
        const html = generateDashboardHTML( passed, failed, testRail, chartPath );
        const title = generateTimestampTitle();

        const outputDir = path.join( process.cwd(), 'CypressTest' );
        if ( !fs.existsSync( outputDir ) ) fs.mkdirSync( outputDir, { recursive: true } );

        const outputFile = path.join( outputDir, `${ title }.html` );
        fs.writeFileSync( outputFile, html );

        await createNewPage( title, html );
        console.log( `✅ Confluence test log page "${ title }" created successfully!` );

        if ( fs.existsSync( outputDir ) )
        {
            fs.rmSync( outputDir, { recursive: true, force: true } );
            console.log( `🧹 Cleaned up local report directory: ${ outputDir }` );
        }

    } catch ( err )
    {
        console.error( '❌ Failed to create Confluence page:', err.response?.data || err.message );
    }
};

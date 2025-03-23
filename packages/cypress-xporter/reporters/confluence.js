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
    const ms = now.getMilliseconds();
    return `${ mm }_${ dd }_${ yyyy }_${ ms }_Cypress Test Log`;
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
    html = html.replace( '{{TEST_LOG}}', buildFailedTestsTable( failed ) );

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

        const outputDir = path.join( __dirname, '..', 'CypressTest' );
        if ( !fs.existsSync( outputDir ) ) fs.mkdirSync( outputDir, { recursive: true } );

        const outputFile = path.join( outputDir, `${ title }.html` );
        fs.writeFileSync( outputFile, html );

        await createNewPage( title, html );
        console.log( `✅ Confluence test log page "${ title }" created successfully!` );

        // 🔥 Remove the entire CypressTest folder after upload
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

const axios = require( 'axios' );
const fs = require( 'fs' );
const path = require( 'path' );
require( 'dotenv' ).config();

const {
    CONFLUENCE_BASE_URL,
    CONFLUENCE_USERNAME,
    CONFLUENCE_API_TOKEN,
    CONFLUENCE_SPACE_KEY,
    CONFLUENCE_PARENT_ID
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

function generateDashboardHTML ( passed, failed )
{
    const htmlTemplatePath = path.join( __dirname, '..', 'templates', 'dashboard.html' );

    if ( !fs.existsSync( htmlTemplatePath ) )
    {
        console.error( '❌ dashboard.html template not found at:', htmlTemplatePath );
        process.exit( 1 );
    }

    let html = fs.readFileSync( htmlTemplatePath, 'utf-8' );
    const total = passed.length + failed.length;

    html = html.replace( /{{TOTAL_TESTS}}/g, total );
    html = html.replace( /{{PASSED_TESTS}}/g, passed.length );
    html = html.replace( /{{FAILED_TESTS}}/g, failed.length );
    html = html.replace(
        '{{TEST_LOG}}',
        failed.map( t => `❌ ${ t.name }<br/><pre>${ t.error || '' }</pre>` ).join( '<br/><br/>' )
    );

    // TestRail placeholders
    html = html.replace( '{{TESTRAIL_RUN_ID}}', 'N/A' );
    html = html.replace( '{{TESTRAIL_TOTAL}}', 'N/A' );
    html = html.replace( '{{TESTRAIL_PASSED}}', 'N/A' );
    html = html.replace( '{{TESTRAIL_FAILED}}', 'N/A' );
    html = html.replace( '{{TESTRAIL_CHART}}', '' );

    return html;
}

async function createNewPage ( title, htmlBody )
{
    const res = await axios.post(
        `${ CONFLUENCE_BASE_URL }/rest/api/content`,
        {
            title,
            type: 'page',
            ancestors: [{ id: CONFLUENCE_PARENT_ID }],
            space: { key: CONFLUENCE_SPACE_KEY },
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

exports.uploadTestLogToConfluence = async ( passed, failed ) =>
{
    if ( !CONFLUENCE_BASE_URL || !CONFLUENCE_USERNAME || !CONFLUENCE_API_TOKEN || !CONFLUENCE_SPACE_KEY )
    {
        console.log( '⚠️ Missing Confluence config in .env' );
        return;
    }

    try
    {
        const html = generateDashboardHTML( passed, failed );
        const title = generateTimestampTitle();

        // Save to local "CypressTest" folder
        const outputDir = path.join( __dirname, '..', 'CypressTest' );
        if ( !fs.existsSync( outputDir ) )
        {
            fs.mkdirSync( outputDir, { recursive: true } );
        }
        const outputFile = path.join( outputDir, `${ title }.html` );
        fs.writeFileSync( outputFile, html );
        console.log( `🗂️ Saved report locally at: ${ outputFile }` );

        await createNewPage( title, html );
        console.log( `✅ Confluence page "${ title }" created successfully!` );
    } catch ( err )
    {
        console.error( '❌ Failed to create Confluence page:', err.response?.data || err.message );
    }
};

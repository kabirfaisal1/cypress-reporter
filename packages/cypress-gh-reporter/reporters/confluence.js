const axios = require( 'axios' );
const fs = require( 'fs' );
const path = require( 'path' );

const {
    CONFLUENCE_BASE_URL,
    CONFLUENCE_USERNAME,
    CONFLUENCE_API_TOKEN,
    CONFLUENCE_SPACE_KEY,
    CONFLUENCE_PAGE_ID
} = process.env;

const AUTH = {
    username: CONFLUENCE_USERNAME,
    password: CONFLUENCE_API_TOKEN
};

function generateDashboardHTML ( passed, failed )
{
    const htmlTemplatePath = path.join( __dirname, 'templates', 'dashboard.html' );

    if ( !fs.existsSync( htmlTemplatePath ) )
    {
        console.error( '❌ dashboard.html template not found at:', htmlTemplatePath );
        process.exit( 1 );
    }

    const htmlTemplate = fs.readFileSync( htmlTemplatePath, 'utf-8' );
    const total = passed.length + failed.length;

    return htmlTemplate
        .replace( /{{TOTAL_TESTS}}/g, total )
        .replace( /{{PASSED_TESTS}}/g, passed.length )
        .replace( /{{FAILED_TESTS}}/g, failed.length );
}

async function getPageInfo ( pageId )
{
    const res = await axios.get(
        `${ CONFLUENCE_BASE_URL }/rest/api/content/${ pageId }?expand=version`,
        { auth: AUTH }
    );
    return res.data;
}

async function updatePage ( page, htmlBody )
{
    const newVersion = page.version.number + 1;

    const res = await axios.put(
        `${ CONFLUENCE_BASE_URL }/rest/api/content/${ CONFLUENCE_PAGE_ID }`,
        {
            version: { number: newVersion },
            title: page.title,
            type: 'page',
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

exports.updateConfluenceDashboard = async ( passed, failed ) =>
{
    if ( !CONFLUENCE_BASE_URL || !CONFLUENCE_PAGE_ID || !CONFLUENCE_USERNAME )
    {
        console.log( '⚠️ Missing Confluence config in .env' );
        return;
    }

    try
    {
        const html = generateDashboardHTML( passed, failed );
        const page = await getPageInfo( CONFLUENCE_PAGE_ID );
        await updatePage( page, html );
        console.log( '✅ Confluence dashboard updated successfully!' );
    } catch ( err )
    {
        console.error( '❌ Failed to update Confluence:', err.response?.data || err.message );
    }
};

require( 'dotenv' ).config();
const axios = require( 'axios' );
const fs = require( 'fs' );
const FormData = require( 'form-data' );
const { findScreenshotForTest } = require( '../utils/screenshotUtils' );

const {
    JIRA_BASE_URL,
    JIRA_EMAIL,
    JIRA_API_TOKEN,
    JIRA_PROJECT_KEY
} = process.env;

const AUTH = {
    username: JIRA_EMAIL,
    password: JIRA_API_TOKEN
};

// 🔥 Upload screenshot and return { id, content }
async function uploadScreenshotAndGetUrl ( issueKey, filePath )
{
    if ( !filePath || !fs.existsSync( filePath ) ) return null;

    const form = new FormData();
    form.append( 'file', fs.createReadStream( filePath ) );

    try
    {
        const res = await axios.post(
            `${ JIRA_BASE_URL }/rest/api/3/issue/${ issueKey }/attachments`,
            form,
            {
                auth: AUTH,
                headers: {
                    ...form.getHeaders(),
                    'X-Atlassian-Token': 'no-check'
                }
            }
        );

        const attachment = res.data?.[0];
        if ( attachment )
        {
            console.log( `📎 Uploaded screenshot: ${ attachment.content }` );
            return {
                id: attachment.id,
                content: attachment.content
            };
        }

        return null;
    } catch ( err )
    {
        console.error( '❌ Failed to upload screenshot:', err.response?.data || err.message );
        return null;
    }
}

// ✍️ Create ADF Description with Screenshot Link
function createADFDescription ( test, screenshotUrl )
{
    const adfContent = [];

    adfContent.push( {
        type: 'paragraph',
        content: [
            { type: 'text', text: '❌ Cypress Test Failed' }
        ]
    } );

    if ( test.file )
    {
        adfContent.push( {
            type: 'paragraph',
            content: [
                { type: 'text', text: `📄 Spec File: ${ test.file }` }
            ]
        } );
    }

    if ( test.name )
    {
        adfContent.push( {
            type: 'paragraph',
            content: [
                { type: 'text', text: `🧪 Test Name: ${ test.name }` }
            ]
        } );
    }

    adfContent.push( {
        type: 'paragraph',
        content: [
            { type: 'text', text: '💥 Error:' }
        ]
    } );

    adfContent.push( {
        type: 'paragraph',
        content: [
            { type: 'text', text: test.error || 'No error message provided' }
        ]
    } );

    adfContent.push( {
        type: 'paragraph',
        content: [
            { type: 'text', text: '🧬 Test Body:' }
        ]
    } );

    adfContent.push( {
        type: 'codeBlock',
        attrs: { language: 'javascript' },
        content: [
            { type: 'text', text: test.body?.slice( 0, 1000 ) || 'No body available' }
        ]
    } );

    if ( screenshotUrl?.content )
    {
        adfContent.push( {
            type: 'paragraph',
            content: [
                { type: 'text', text: '🖼️ View Screenshot: ' },
                {
                    type: 'text',
                    text: 'Click Here',
                    marks: [
                        {
                            type: 'link',
                            attrs: {
                                href: screenshotUrl.content
                            }
                        }
                    ]
                }
            ]
        } );
    }

    return {
        version: 1,
        type: 'doc',
        content: adfContent
    };
}

// 🧹 Sanitize Summary for JQL Search
function sanitizeForJQL ( text )
{
    return text
        .replace( /[^\w\s\-:()]/g, '' )
        .replace( /\s+/g, ' ' )
        .trim();
}

// 🔍 Check if an Issue Already Exists
async function issueAlreadyExists ( summary )
{
    const cleanSummary = sanitizeForJQL( summary );
    const jql = `project = "${ JIRA_PROJECT_KEY }" AND summary ~ "${ cleanSummary }"`;

    try
    {
        console.info( `🔍 Checking for existing Jira issues with JQL: ${ jql }` );
        const res = await axios.get( `${ JIRA_BASE_URL }/rest/api/3/search`, {
            params: { jql, fields: 'summary,status' },
            auth: AUTH,
            headers: { Accept: 'application/json' }
        } );

        const openIssue = res.data.issues?.find( issue =>
        {
            const status = issue.fields?.status?.name?.toLowerCase() || '';
            return !['done', 'closed', "won't fix", 'wontfix'].includes( status );
        } );

        if ( openIssue )
        {
            console.log( `⚠️ Skipping duplicate: found existing open issue ${ openIssue.key } with status "${ openIssue.fields.status.name }"` );
            return true;
        }

        return false;
    } catch ( err )
    {
        console.warn( `⚠️ Failed to check for existing Jira issues: ${ err.response?.status } ${ err.response?.statusText }` );
        return false;
    }
}

// 📎 Attach Log File
async function attachLogsToIssue ( issueKey, logString )
{
    const tempFile = `.tmp-cypress-log-${ Date.now() }.txt`;
    fs.writeFileSync( tempFile, logString );

    const form = new FormData();
    form.append( 'file', fs.createReadStream( tempFile ) );

    try
    {
        await axios.post(
            `${ JIRA_BASE_URL }/rest/api/3/issue/${ issueKey }/attachments`,
            form,
            {
                auth: AUTH,
                headers: {
                    ...form.getHeaders(),
                    'X-Atlassian-Token': 'no-check'
                }
            }
        );
        console.log( `📎 Attached log file to Jira issue: ${ issueKey }` );
    } catch ( err )
    {
        console.error( `❌ Failed to attach log file to ${ issueKey }` );
        console.error( err.response?.data || err.message );
    } finally
    {
        fs.unlinkSync( tempFile );
    }
}

// 🐞 Create Jira Bug
async function createJiraBug ( test )
{
    const summary = `❌ [Cypress] ${ test.name }`;

    const exists = await issueAlreadyExists( summary );
    if ( exists )
    {
        console.log( `⚠️ Skipping duplicate Jira bug for: ${ test.name }` );
        return null;
    }

    try
    {
        // 1️⃣ Create an Empty Jira Ticket
        const issueRes = await axios.post(
            `${ JIRA_BASE_URL }/rest/api/3/issue`,
            {
                fields: {
                    project: { key: JIRA_PROJECT_KEY },
                    summary,
                    issuetype: { name: 'Bug' },
                    labels: ['automated-test', 'cypress']
                }
            },
            {
                auth: AUTH,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );

        const issueKey = issueRes.data.key;
        console.log( `✅ Created Jira issue: ${ issueKey }` );

        // 2️⃣ Upload Screenshot if available
        const screenshotPath = findScreenshotForTest( test );
        let screenshotUrl = null;
        if ( screenshotPath )
        {
            screenshotUrl = await uploadScreenshotAndGetUrl( issueKey, screenshotPath );
        }

        // 3️⃣ Upload Logs
        await attachLogsToIssue( issueKey, test.error || test.body || 'No log data.' );

        // 4️⃣ Update Description
        const updatedDescription = createADFDescription( test, screenshotUrl );
        await axios.put(
            `${ JIRA_BASE_URL }/rest/api/3/issue/${ issueKey }`,
            {
                fields: { description: updatedDescription }
            },
            {
                auth: AUTH,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log( `📝 Updated Jira description for: ${ issueKey }` );

        return issueKey;
    } catch ( err )
    {
        console.error( `❌ Failed to create Jira issue for test: ${ test.name }` );
        console.error( err.response?.data || err.message );
        return null;
    }
}

// 🚀 Main Export
exports.reportToJira = async ( failedTests = [] ) =>
{
    if ( !JIRA_BASE_URL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY || !JIRA_EMAIL )
    {
        console.log( '⚠️ Jira not fully configured in .env' );
        return failedTests;
    }

    if ( !failedTests.length )
    {
        console.log( '✅ No failed tests to report to Jira.' );
        return failedTests;
    }

    console.log( `🐞 Creating Jira issues for ${ failedTests.length } failed test(s)...` );

    const updatedTests = [];

    for ( const test of failedTests )
    {
        const issueKey = await createJiraBug( test );
        test.jira = issueKey || 'N/A';
        updatedTests.push( test );
    }

    return updatedTests;
};

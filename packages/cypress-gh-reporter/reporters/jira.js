require( 'dotenv' ).config();
const axios = require( 'axios' );
const fs = require( 'fs' );
const FormData = require( 'form-data' );

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

function createADFDescription ( test )
{
    const lines = [
        `❌ Cypress Test Failed`,
        ``,
        `📄 Spec File: ${ test.file }`,
        ``,
        `🧪 Test Name: ${ test.name }`,
        ``,
        `💥 Error:`,
        test.error || 'No error message provided',
        ``,
        `🧬 Test Body:`,
        test.body?.slice( 0, 1000 ) || 'No body available'
    ];

    return {
        type: 'doc',
        version: 1,
        content: [
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: lines.join( '\n' )
                    }
                ]
            }
        ]
    };
}

async function issueAlreadyExists ( summary )
{
    // Remove problematic characters for Jira JQL (quotes, backslashes)
    const escapedSummary = summary.replace( /["\\]/g, '' );
    const jql = `project = ${ JIRA_PROJECT_KEY } AND summary ~ "${ escapedSummary }"`;

    try
    {
        const res = await axios.get( `${ JIRA_BASE_URL }/rest/api/3/search`, {
            params: { jql },
            auth: AUTH,
            headers: { Accept: 'application/json' }
        } );

        return res.data.issues?.length > 0;
    } catch ( err )
    {
        console.warn(
            `⚠️ Failed to check for existing Jira issues: ${ err.response?.status } ${ err.response?.statusText }`
        );
        return false;
    }
}

async function attachLogsToIssue ( issueKey, logString )
{
    const form = new FormData();
    const tempFile = `.tmp-cypress-log-${ Date.now() }.txt`;
    fs.writeFileSync( tempFile, logString );

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
        console.log( `📎 Attached log to Jira issue: ${ issueKey }` );
    } catch ( err )
    {
        console.error( `❌ Failed to attach log to ${ issueKey }` );
        console.error( err.response?.data || err.message );
    } finally
    {
        fs.unlinkSync( tempFile );
    }
}

exports.reportToJira = async ( failedTests = [] ) =>
{
    if ( !JIRA_BASE_URL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY || !JIRA_EMAIL )
    {
        console.log( '🔍 Jira Env:', {
            JIRA_BASE_URL,
            JIRA_EMAIL,
            JIRA_API_TOKEN,
            JIRA_PROJECT_KEY
        } );
        console.log( '⚠️ Jira not fully configured in .env' );
        return;
    }

    if ( !failedTests.length )
    {
        console.log( '✅ No failed tests to report to Jira.' );
        return;
    }

    console.log( `🐞 Creating Jira issues for ${ failedTests.length } failed test(s)...` );

    for ( const test of failedTests )
    {
        const summary = `❌ [Cypress] ${ test.name }`;
        const descriptionADF = createADFDescription( test );

        const exists = await issueAlreadyExists( summary );
        if ( exists )
        {
            console.log( `⚠️ Skipping duplicate Jira bug for: ${ test.name }` );
            continue;
        }

        try
        {
            const res = await axios.post(
                `${ JIRA_BASE_URL }/rest/api/3/issue`,
                {
                    fields: {
                        project: { key: JIRA_PROJECT_KEY },
                        summary,
                        description: descriptionADF,
                        issuetype: { name: 'Bug' },
                        labels: ['automated-test', 'cypress'],
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

            const issueKey = res.data.key;
            console.log( `✅ Created Jira issue: ${ issueKey }` );

            await attachLogsToIssue( issueKey, test.error || test.body || 'No log data.' );
        } catch ( err )
        {
            console.error( `❌ Failed to create Jira issue for test: ${ test.name }` );
            console.error( err.response?.data || err.message );
        }
    }
};

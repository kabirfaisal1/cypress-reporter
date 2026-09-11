require( "dotenv" ).config();
const axios = require( "axios" );
const fs = require( "fs" );
const FormData = require( "form-data" );
const path = require( "path" );
const { uploadScreenshotAndGetUrl } = require( "../utils/uploadUtils" );
const { findScreenshotForTest } = require( "../utils/screenshotUtils" );

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = process.env;

const AUTH = {
  username: JIRA_EMAIL,
  password: JIRA_API_TOKEN,
};

function normalizeTitleForComparison ( text )
{
  return text
    ?.toLowerCase()
    .replace( /[^a-z0-9 ]/gi, "" )
    .replace( /\s+/g, " " )
    .trim();
}

const SUMMARY_PREFIX = "❌ [Cypress] ";
const MAX_ISSUES_TO_SCAN = 5000;

// Status names treated as "done" when Jira does not expose a status category.
const DONE_STATUS_NAMES = [
  "done",
  "closed",
  "resolved",
  "won't fix",
  "wont fix",
  "wontfix",
  "cancelled",
  "canceled",
];

function buildSummary ( title )
{
  return `${ SUMMARY_PREFIX }${ title }`;
}

function isDoneStatus ( status )
{
  const category = status?.statusCategory?.key?.toLowerCase();
  if ( category === "done" ) return true;
  const name = status?.name?.toLowerCase() || "";
  return DONE_STATUS_NAMES.includes( name );
}

/**
 * Fetch every Bug in the project once so each failed test can be checked
 * against the same list. Uses the /search/jql endpoint, which paginates with
 * nextPageToken (startAt/total are not supported there).
 *
 * Resolves to an array of issues, or null when the fetch failed.
 */
async function fetchProjectBugs ()
{
  const base = String( JIRA_BASE_URL || "" ).replace( /\/+$/, "" );
  const url = `${ base }/rest/api/3/search/jql`;
  const jql = `project = "${ JIRA_PROJECT_KEY }" AND issuetype = Bug ORDER BY created DESC`;

  const allIssues = [];
  let nextPageToken = null;

  try
  {
    while ( true )
    {
      const params = {
        jql,
        fields: "summary,status",
        maxResults: 100,
      };
      if ( nextPageToken ) params.nextPageToken = nextPageToken;

      const res = await axios.get( url, {
        params,
        auth: AUTH,
        headers: { Accept: "application/json" },
      } );

      const issues = res.data?.issues || [];
      allIssues.push( ...issues );

      nextPageToken = res.data?.nextPageToken || null;
      const isLast = res.data?.isLast === true || !nextPageToken || issues.length === 0;

      if ( isLast ) break;
      if ( allIssues.length >= MAX_ISSUES_TO_SCAN )
      {
        console.warn( `⚠️ Stopped scanning Jira bugs after ${ allIssues.length } issues.` );
        break;
      }
    }

    console.log( `🔍 Loaded ${ allIssues.length } existing Jira bug(s) from project ${ JIRA_PROJECT_KEY }` );
    return allIssues;
  } catch ( err )
  {
    console.error(
      `❌ Failed to fetch Jira issues: ${ err.response?.status || "" } ${ err.response?.statusText || err.message }`
    );
    if ( err.response?.data )
    {
      console.error( "Jira response:", JSON.stringify( err.response.data, null, 2 ) );
    }
    return null;
  }
}

// Same pattern the extractors use for TestRail case IDs, e.g. "[C45689]".
function extractCaseIdsFromTitle ( title )
{
  if ( typeof title !== "string" ) return [];
  return [...title.matchAll( /\[?C(\d+)\]?/gi )].map( ( m ) => parseInt( m[1], 10 ) );
}

/**
 * Find existing bugs that refer to the same test. Only the summary is
 * compared (never the description) so a changed error message does not
 * produce a new ticket. A bug matches when either:
 *  - its summary equals the test title after normalisation, with or without
 *    the "[Cypress]" prefix (so "login" does not match "login with sso"), or
 *  - it shares a TestRail case ID with the test title (e.g. [C45689]), so a
 *    reworded test title still maps to the same bug.
 */
function findMatchingIssues ( issues, testTitle )
{
  const normalizedTitle = normalizeTitleForComparison( testTitle );
  if ( !normalizedTitle ) return [];

  const normalizedSummary = normalizeTitleForComparison( buildSummary( testTitle ) );
  const caseIds = extractCaseIdsFromTitle( testTitle );

  return issues.filter( ( issue ) =>
  {
    const rawSummary = issue.fields?.summary || "";
    const summary = normalizeTitleForComparison( rawSummary );
    if ( summary === normalizedSummary || summary === normalizedTitle ) return true;

    if ( !caseIds.length ) return false;
    const summaryCaseIds = extractCaseIdsFromTitle( rawSummary );
    return summaryCaseIds.some( ( id ) => caseIds.includes( id ) );
  } );
}

function createFailureComment ( test )
{
  const content = [
    {
      type: "paragraph",
      content: [
        { type: "text", text: `🔁 Cypress test failed again on ${ new Date().toISOString() }` },
      ],
    },
  ];

  if ( test.file )
  {
    content.push( {
      type: "paragraph",
      content: [{ type: "text", text: `📄 Spec File: ${ test.file }` }],
    } );
  }

  content.push(
    {
      type: "paragraph",
      content: [{ type: "text", text: "💥 Error:" }],
    },
    {
      type: "codeBlock",
      content: [{ type: "text", text: ( test.error || "No error message provided" ).slice( 0, 2000 ) }],
    }
  );

  return { version: 1, type: "doc", content };
}

async function addFailureCommentToIssue ( issueKey, test )
{
  try
  {
    await axios.post(
      `${ JIRA_BASE_URL }/rest/api/3/issue/${ issueKey }/comment`,
      { body: createFailureComment( test ) },
      {
        auth: AUTH,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );
    console.log( `💬 Added failure comment to existing Jira issue: ${ issueKey }` );
    return true;
  } catch ( err )
  {
    console.error( `❌ Failed to add comment to ${ issueKey }` );
    console.error( err.response?.data || err.message );
    return false;
  }
}

function createADFDescription ( test, screenshotUrl )
{
  const adfContent = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "❌ Cypress Test Failed" }],
    },
  ];

  if ( test.file )
  {
    adfContent.push( {
      type: "paragraph",
      content: [{ type: "text", text: `📄 Spec File: ${ test.file }` }],
    } );
  }

  if ( test.title )
  {
    adfContent.push( {
      type: "paragraph",
      content: [{ type: "text", text: `🧪 Test Name: ${ test.title }` }],
    } );
  }

  adfContent.push(
    {
      type: "paragraph",
      content: [{ type: "text", text: "💥 Error:" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: test.error || "No error message provided" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "🧬 Test Body:" }],
    },
    {
      type: "codeBlock",
      attrs: { language: "javascript" },
      content: [{ type: "text", text: test.body?.slice( 0, 1000 ) || "No body available" }],
    }
  );

  if ( screenshotUrl?.content )
  {
    adfContent.push( {
      type: "paragraph",
      content: [
        { type: "text", text: "🖼️ View Screenshot: " },
        {
          type: "text",
          text: "Click Here",
          marks: [
            {
              type: "link",
              attrs: {
                href: screenshotUrl.content,
              },
            },
          ],
        },
      ],
    } );
  }

  return {
    version: 1,
    type: "doc",
    content: adfContent,
  };
}

async function attachLogsToIssue ( issueKey, logString )
{
  const tempFile = `.tmp-cypress-log-${ Date.now() }.txt`;
  fs.writeFileSync( tempFile, logString );

  const form = new FormData();
  form.append( "file", fs.createReadStream( tempFile ) );

  try
  {
    await axios.post( `${ JIRA_BASE_URL }/rest/api/3/issue/${ issueKey }/attachments`, form, {
      auth: AUTH,
      headers: {
        ...form.getHeaders(),
        "X-Atlassian-Token": "no-check",
      },
    } );
    // console.log( `📎 Attached log file to Jira issue: ${ issueKey }` );
  } catch ( err )
  {
    console.error( `❌ Failed to attach log file to ${ issueKey }` );
    console.error( err.response?.data || err.message );
  } finally
  {
    fs.unlinkSync( tempFile );
  }
}

/**
 * Create a bug for the failed test, or comment on an existing open one.
 *
 * - Matching open bug (Backlog, To Do, On Hold, In Progress, ...): add a
 *   comment with the latest failure and return its key. No new ticket.
 * - Matching bug(s) only in a Done status (or no match at all): create a new
 *   bug.
 *
 * `existingIssues` is the per-run cache from fetchProjectBugs(); newly created
 * issues are pushed onto it so later tests in the same run see them.
 */
async function createJiraBug ( test, existingIssues )
{
  const title = test.title?.trim();
  const summary = buildSummary( title );

  const matches = findMatchingIssues( existingIssues, title );
  const openMatch = matches.find( ( issue ) => !isDoneStatus( issue.fields?.status ) );

  if ( openMatch )
  {
    const statusName = openMatch.fields?.status?.name || "unknown";
    console.log(
      `⚠️ Existing open bug ${ openMatch.key } (status: ${ statusName }) found for: ${ title } — adding a comment instead of creating a new bug`
    );
    await addFailureCommentToIssue( openMatch.key, test );
    return openMatch.key;
  }

  if ( matches.length )
  {
    console.log(
      `ℹ️ ${ matches.length } matching bug(s) for "${ title }" are already Done (${ matches.map( ( i ) => i.key ).join( ", " ) }) — creating a new bug`
    );
  }

  try
  {
    const issueRes = await axios.post(
      `${ JIRA_BASE_URL }/rest/api/3/issue`,
      {
        fields: {
          project: { key: JIRA_PROJECT_KEY },
          summary,
          issuetype: { name: "Bug" },
          labels: ["automated-test", "cypress"],
        },
      },
      {
        auth: AUTH,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    const issueKey = issueRes.data.key;
    console.log( `✅ Created Jira issue: ${ issueKey }` );

    // Remember it so another failed test with the same title in this run
    // comments on this bug instead of creating a second one.
    existingIssues.push( {
      key: issueKey,
      fields: { summary, status: { name: "To Do", statusCategory: { key: "new" } } },
    } );

    await attachLogsToIssue( issueKey, test.error || test.body || "No log data." );

    const screenshotPath = findScreenshotForTest( test );
    let screenshotUrl = null;
    if ( screenshotPath )
    {
      screenshotUrl = await uploadScreenshotAndGetUrl( issueKey, screenshotPath );
    }

    const updatedDescription = createADFDescription( test, screenshotUrl );
    await axios.put(
      `${ JIRA_BASE_URL }/rest/api/3/issue/${ issueKey }`,
      { fields: { description: updatedDescription } },
      {
        auth: AUTH,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    console.log( `📝 Updated Jira description for: ${ issueKey }` );
    return issueKey;
  } catch ( err )
  {
    console.error( `❌ Failed to create Jira issue for test: ${ test.title }` );
    console.error( err.response?.data || err.message );
    return null;
  }
}

exports.reportToJira = async ( failedTests = [] ) =>
{
  if ( !JIRA_BASE_URL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY || !JIRA_EMAIL )
  {
    console.log( "⚠️ Jira not fully configured in .env" );
    return failedTests;
  }

  if ( !failedTests.length )
  {
    console.log( "✅ No failed tests to report to Jira." );
    return failedTests;
  }

  console.log( `🐞 Reporting ${ failedTests.length } failed test(s) to Jira...` );

  const existingIssues = await fetchProjectBugs();
  if ( !existingIssues )
  {
    console.error(
      "❌ Could not load existing Jira bugs, so no bugs were created (this avoids creating duplicates)."
    );
    return failedTests.map( ( test ) => ( { ...test, jira: "N/A" } ) );
  }

  const updatedTests = [];

  for ( const test of failedTests )
  {
    test.title = test.title?.trim();
    const issueKey = await createJiraBug( test, existingIssues );
    test.jira = issueKey || "N/A";
    updatedTests.push( test );
  }

  return updatedTests;
};

// Exported for testing
exports._internal = {
  normalizeTitleForComparison,
  isDoneStatus,
  findMatchingIssues,
  extractCaseIdsFromTitle,
  buildSummary,
  fetchProjectBugs,
  createJiraBug,
};

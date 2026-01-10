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

// 🧠 Fallback search to compare summaries manually
// 🧠 Fallback search to compare summaries manually
async function issueAlreadyExists(testTitle) {
  const normalizedTitle = normalizeTitleForComparison(testTitle);

  // Safety: avoid double slashes if base url ends with "/"
  const base = String(JIRA_BASE_URL || "").replace(/\/+$/, "");

  // ✅ New endpoint (replaces /rest/api/3/search)
  const url = `${base}/rest/api/3/search/jql`;

  try {
    console.info(`🔍 Fetching all Jira bugs in project ${JIRA_PROJECT_KEY}...`);

    let startAt = 0;
    const maxResults = 100; // keep it sane; loop for pagination
    let allIssues = [];

    while (true) {
      const res = await axios.get(url, {
        params: {
          jql: `project = "${JIRA_PROJECT_KEY}" AND issuetype = Bug`,
          fields: "summary,status",
          startAt,
          maxResults,
        },
        auth: AUTH,
        headers: { Accept: "application/json" },
      });

      const issues = res.data?.issues || [];
      allIssues.push(...issues);

      if (issues.length < maxResults) break; // no more pages
      startAt += maxResults;
      if (startAt > 5000) break; // hard guard to prevent runaway in huge projects
    }

    for (const issue of allIssues) {
      const issueSummary = normalizeTitleForComparison(issue.fields?.summary || "");
      const status = issue.fields?.status?.name?.toLowerCase() || "";

      if (
        issueSummary.includes(normalizedTitle) &&
        !["done", "closed", "won't fix", "wontfix"].includes(status)
      ) {
        console.log(`⚠️ Skipping duplicate: found ${issue.key}`);
        return true;
      }
    }

    return false;
  } catch (err) {
    console.warn(
      `⚠️ Failed to fetch Jira issues: ${err.response?.status} ${err.response?.statusText}`
    );

    // Helpful debug (optional): Jira often returns a message body
    if (err.response?.data) {
      console.warn("Jira response:", JSON.stringify(err.response.data, null, 2));
    }

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

async function createJiraBug ( test )
{
  const title = test.title?.trim();
  const summary = `❌ [Cypress] ${ title }`;

  const exists = await issueAlreadyExists( title );
  if ( exists )
  {
    console.log( `⚠️ Skipping duplicate Jira bug for: ${ title }` );
    return null;
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

  console.log( `🐞 Creating Jira issues for ${ failedTests.length } failed test(s)...` );
  const updatedTests = [];

  for ( const test of failedTests )
  {
    test.title = test.title?.trim();
    const issueKey = await createJiraBug( test );
    test.jira = issueKey || "N/A";
    updatedTests.push( test );
  }

  return updatedTests;
};

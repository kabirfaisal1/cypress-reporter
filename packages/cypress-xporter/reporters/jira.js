require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } =
  process.env;

const AUTH = {
  username: JIRA_EMAIL,
  password: JIRA_API_TOKEN,
};

// 🔍 Case-insensitive screenshots path resolver
function resolveScreenshotsDir() {
  const baseDir = process.cwd();
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  const cypressDir = entries.find(
    (e) => e.isDirectory() && e.name.toLowerCase() === "cypress"
  );

  if (!cypressDir) return null;

  const screenshotsPath = path.join(baseDir, cypressDir.name, "screenshots");
  return fs.existsSync(screenshotsPath) ? screenshotsPath : null;
}

// 📸 Find screenshot file containing the test.title (lowercased match)
function findScreenshotForTest(test) {
  const screenshotsDir = resolveScreenshotsDir();
  const searchText = test.title?.trim().toLowerCase();

  console.log(`📂 Entering findScreenshotForTest`);

  if (!screenshotsDir) {
    console.error(`❌ Screenshots directory does not exist.`);
    return null;
  }

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let matches = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        matches = matches.concat(walk(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".png")) {
        matches.push(fullPath);
      }
    }

    return matches;
  }

  const allScreenshots = walk(screenshotsDir);

  const match = allScreenshots.find((filePath) =>
    filePath.toLowerCase().includes(searchText)
  );

  if (match) {
    console.log(`✅ Found matching screenshot: ${match}`);
    return match;
  }

  console.error(`❌ No screenshot found for test "${test.title}"`);
  return null;
}

// 🧹 Clean text for JQL
function sanitizeForJQL(text) {
  return text
    .replace(/[^\w\s\-\[\]:()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 🔍 Check for existing Jira issue (case-insensitive)
async function issueAlreadyExists(testTitle) {
  const cleanSummary = sanitizeForJQL(
    `❌ [Cypress] ${testTitle}`
  ).toLowerCase();
  const jql = `project = "${JIRA_PROJECT_KEY}" AND summary ~ "${cleanSummary}"`;

  try {
    console.info(`🔍 Checking for existing Jira issues with JQL: ${jql}`);
    const res = await axios.get(`${JIRA_BASE_URL}/rest/api/3/search`, {
      params: { jql, fields: "summary,status" },
      auth: AUTH,
      headers: { Accept: "application/json" },
    });

    const openIssue = res.data.issues?.find((issue) => {
      const issueSummary = issue.fields?.summary?.toLowerCase() || "";
      const status = issue.fields?.status?.name?.toLowerCase() || "";
      return (
        issueSummary.includes(cleanSummary) &&
        !["done", "closed", "won't fix", "wontfix"].includes(status)
      );
    });

    if (openIssue) {
      console.log(`⚠️ Skipping duplicate: found ${openIssue.key}`);
      return true;
    }

    return false;
  } catch (err) {
    console.warn(
      `⚠️ JQL search error: ${err.response?.status} ${err.response?.statusText}`
    );
    return false;
  }
}

// ✍️ Build ADF-rich Jira description
function createADFDescription(test, screenshotUrl) {
  const adfContent = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "❌ Cypress Test Failed" }],
    },
  ];

  if (test.file) {
    adfContent.push({
      type: "paragraph",
      content: [{ type: "text", text: `📄 Spec File: ${test.file}` }],
    });
  }

  if (test.title) {
    adfContent.push({
      type: "paragraph",
      content: [{ type: "text", text: `🧪 Test Name: ${test.title}` }],
    });
  }

  adfContent.push(
    {
      type: "paragraph",
      content: [{ type: "text", text: "💥 Error:" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: test.error || "No error message provided" },
      ],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "🧬 Test Body:" }],
    },
    {
      type: "codeBlock",
      attrs: { language: "javascript" },
      content: [
        {
          type: "text",
          text: test.body?.slice(0, 1000) || "No body available",
        },
      ],
    }
  );

  if (screenshotUrl?.content) {
    adfContent.push({
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
    });
  }

  return {
    version: 1,
    type: "doc",
    content: adfContent,
  };
}

// 📎 Attach text log
async function attachLogsToIssue(issueKey, logString) {
  const tempFile = `.tmp-cypress-log-${Date.now()}.txt`;
  fs.writeFileSync(tempFile, logString);

  const form = new FormData();
  form.append("file", fs.createReadStream(tempFile));

  try {
    await axios.post(
      `${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/attachments`,
      form,
      {
        auth: AUTH,
        headers: {
          ...form.getHeaders(),
          "X-Atlassian-Token": "no-check",
        },
      }
    );
    console.log(`📎 Attached log file to Jira issue: ${issueKey}`);
  } catch (err) {
    console.error(`❌ Failed to attach log file to ${issueKey}`);
    console.error(err.response?.data || err.message);
  } finally {
    fs.unlinkSync(tempFile);
  }
}

// 🐞 Create Jira Bug for failed test
async function createJiraBug(test) {
  const title = test.title?.trim();
  const summary = `❌ [Cypress] ${title}`;

  const exists = await issueAlreadyExists(title);
  if (exists) {
    console.log(`⚠️ Skipping duplicate Jira bug for: ${title}`);
    return null;
  }

  try {
    // Create issue
    const issueRes = await axios.post(
      `${JIRA_BASE_URL}/rest/api/3/issue`,
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
    console.log(`✅ Created Jira issue: ${issueKey}`);

    // Attach log
    await attachLogsToIssue(
      issueKey,
      test.error || test.body || "No log data."
    );

    // Attach screenshot only if issue was just created
    const screenshotPath = findScreenshotForTest(test);
    let screenshotUrl = null;
    if (screenshotPath) {
      screenshotUrl = await uploadScreenshotAndGetUrl(issueKey, screenshotPath);
    }

    // Update description
    const updatedDescription = createADFDescription(test, screenshotUrl);
    await axios.put(
      `${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}`,
      { fields: { description: updatedDescription } },
      {
        auth: AUTH,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`📝 Updated Jira description for: ${issueKey}`);
    return issueKey;
  } catch (err) {
    console.error(`❌ Failed to create Jira issue for test: ${test.title}`);
    console.error(err.response?.data || err.message);
    return null;
  }
}

// 🚀 Entry point
exports.reportToJira = async (failedTests = []) => {
  if (!JIRA_BASE_URL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY || !JIRA_EMAIL) {
    console.log("⚠️ Jira not fully configured in .env");
    return failedTests;
  }

  if (!failedTests.length) {
    console.log("✅ No failed tests to report to Jira.");
    return failedTests;
  }

  console.log(
    `🐞 Creating Jira issues for ${failedTests.length} failed test(s)...`
  );
  const updatedTests = [];

  for (const test of failedTests) {
    test.title = test.title?.trim();
    const issueKey = await createJiraBug(test);
    test.jira = issueKey || "N/A";
    updatedTests.push(test);
  }

  return updatedTests;
};

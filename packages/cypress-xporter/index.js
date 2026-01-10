#!/usr/bin/env node
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const minimist = require("minimist");
const fg = require("fast-glob");

const { reportToJira } = require("./reporters/jira");
const { reportToTestRail, adhocTestResults } = require("./reporters/testrail");
const { uploadTestLogToConfluence } = require("./reporters/confluence");
const { extractUniqueFailedTests } = require("./utils/extractUniqueFailedTests");
const { extractTests } = require("./utils/extractTests");

const argv = minimist(process.argv.slice(2));
const useJira = argv.jira || false;
const useConfluence = argv.confluence || false;
const useTestRail = argv.testrail || false;

// ADHOC run id can come from CLI or .env
const adhocRunIdArg = argv.adhoc || argv.adhocRunId || process.env.ADHOC_TESTRUNID || null;
if (adhocRunIdArg) {
  process.env.ADHOC_TESTRUNID = String(adhocRunIdArg);
}

async function findReportFiles() {
  const pattern = "**/mochawesome*.json";
  const ignore = ["**/node_modules/**", "**/dist/**", "**/CypressTest/**"];

  const files = await fg(pattern, {
    cwd: process.cwd(),
    onlyFiles: true,
    absolute: true,
    dot: true,
    ignore,
  });

  if (!files.length) {
    throw new Error("❌ No mochawesome JSON report files found.");
  }

  console.log(`🔍 Found ${files.length} mochawesome report file(s):`);
  files.forEach((file) => console.log(`  - ${file}`));
  return files;
}

function mergeAllReports(reportFiles) {
  const reports = [];

  for (const file of reportFiles) {
    try {
      const content = fs.readFileSync(file, "utf8");
      reports.push(JSON.parse(content));
    } catch (err) {
      console.error(chalk.red(`❌ Failed to parse ${file}: ${err.message}`));
      throw err;
    }
  }

  const merged = reports.reduce(
    (acc, curr) => {
      acc.stats.tests += curr.stats.tests;
      acc.stats.passes += curr.stats.passes;
      acc.stats.failures += curr.stats.failures;
      acc.stats.pending += curr.stats.pending;
      acc.stats.suites += curr.stats.suites;
      acc.stats.duration += curr.stats.duration;
      acc.stats.testsRegistered += curr.stats.testsRegistered;
      acc.stats.skipped = (acc.stats.skipped || 0) + (curr.stats.skipped || 0);
      acc.stats.hasSkipped = acc.stats.hasSkipped || curr.stats.hasSkipped;

      // keep only valid result objects
      if (Array.isArray(curr.results)) {
        const valid = curr.results.filter((r) => r && typeof r === "object");
        acc.results.push(...valid);
      }

      return acc;
    },
    {
      stats: {
        tests: 0,
        passes: 0,
        failures: 0,
        pending: 0,
        suites: 0,
        duration: 0,
        testsRegistered: 0,
        skipped: 0,
        hasSkipped: false,
      },
      results: [],
      meta: reports[0]?.meta,
    }
  );

  if (merged.stats.tests > 0) {
    merged.stats.passPercent = (merged.stats.passes / merged.stats.tests) * 100;
    merged.stats.pendingPercent = (merged.stats.pending / merged.stats.tests) * 100;
  }

  return merged;
}

const run = async () => {
  let reportFiles;

  try {
    console.log(chalk.yellow("🔄 Searching for mochawesome reports..."));
    reportFiles = await findReportFiles();
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }

  const outputDir = path.dirname(reportFiles[0]);
  const mergedReportPath = path.join(outputDir, "merged-mochawesome.json");

  try {
    console.log(chalk.yellow("📦 Merging all mochawesome reports..."));
    const mergedReport = mergeAllReports(reportFiles);
    fs.writeFileSync(mergedReportPath, JSON.stringify(mergedReport, null, 2));
    console.log(chalk.green(`✅ Merged report saved to: ${mergedReportPath}`));
  } catch (err) {
    console.error(chalk.red("❌ Failed to merge mochawesome reports."));
    console.error(err.message);
    process.exit(1);
  }

  const failedTests = extractUniqueFailedTests(mergedReportPath);

  const allTests = JSON.parse(fs.readFileSync(mergedReportPath))
    .results.flatMap((suite) => extractTests(suite, suite.file));

  const passedTests = allTests.filter((t) => t.state === "passed");

  console.log(chalk.blue(`📋 Found ${allTests.length} total test(s)`));
  console.log(chalk.green(`✅ Passed: ${passedTests.length}`));
  console.log(chalk.red(`❌ Failed: ${failedTests.length}`));

  let updatedFailedTests = failedTests;

  if (useJira) {
    updatedFailedTests = await reportToJira(failedTests);
  }

  /**
   * ✅ TestRail reporting
   *
   * IMPORTANT FIX (prevents duplicate runs):
   * - DO NOT loop project-by-project here.
   * - Call reportToTestRail() exactly once in NORMAL mode.
   * - In ADHOC mode, call adhocTestResults() only (no run creation, no closing).
   */
  if (useTestRail) {
    const adhocRunId = process.env.ADHOC_TESTRUNID;

    if (adhocRunId) {
      console.log(
        chalk.magenta(
          `🧩 ADHOC mode enabled. Posting results ONLY to existing TestRail RunID=${adhocRunId} (no run creation, no closing).`
        )
      );
      await adhocTestResults(passedTests, updatedFailedTests, adhocRunId);
    } else {
      console.log(
        chalk.cyan(
          `🚀 Reporting ${passedTests.length} passed and ${updatedFailedTests.length} failed test(s) to TestRail (normal mode: create run(s) + close them).`
        )
      );
      // CALL ONCE (testrail.js groups by Project/Suite internally)
      await reportToTestRail(passedTests, updatedFailedTests);
    }
  }

  if (useConfluence) {
    await uploadTestLogToConfluence(passedTests, updatedFailedTests);
  }
};

run();

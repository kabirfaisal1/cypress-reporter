// utils/extractFailedTests.js
const fs = require( "fs" );
const path = require( "path" );

// 🧠 Recursively collect failed tests from nested suites
function collectFailedTests ( suite, failedTests = [], inheritedProjectId = null, filePath = null )
{
    let dynamicProjectId = inheritedProjectId;
    const match = suite.title?.match( /\[(P\d+)\]/i ); // Captures P12, P99, etc.
    if ( match && match[1] )
    {
        dynamicProjectId = match[1];
    }

    if ( suite.tests )
    {
        suite.tests.forEach( ( test ) =>
        {
            if ( test.fail || test.state === "failed" )
            {
                failedTests.push( {
                    title: test.title?.trim(),
                    fullTitle: test.fullTitle,
                    error: test.err?.message || "",
                    body: test.code || "",
                    file: filePath || suite.file || "",
                    projectId: dynamicProjectId || process.env.TESTRAIL_PROJECT_ID,
                    state: "failed"
                } );
            }
        } );
    }

    if ( suite.suites )
    {
        suite.suites.forEach( ( nestedSuite ) =>
            collectFailedTests( nestedSuite, failedTests, dynamicProjectId, filePath || suite.file )
        );
    }

    return failedTests;
}

// 🧹 Normalize title for dedup/screenshot/reporting
function normalizeTitle ( title )
{
    return title?.trim().toLowerCase();
}

// 📦 Extract and deduplicate by title (case-insensitive)
function extractUniqueFailedTests ( reportPath )
{
    const data = JSON.parse( fs.readFileSync( reportPath, "utf8" ) );
    const allSuites = data.results || [];

    const failed = [];
    for ( const suite of allSuites )
    {
        failed.push( ...collectFailedTests( suite, [], null, suite.file ) );
    }

    // 🔁 Deduplicate by normalized test.title
    const seen = new Set();
    const unique = failed.filter( ( test ) =>
    {
        const key = normalizeTitle( test.title );
        if ( seen.has( key ) ) return false;
        seen.add( key );
        return true;
    } );

    return unique;
}

// 🧪 Run from CLI
if ( require.main === module )
{
    const reportPath = path.resolve( "cypress", "reports", ".jsons", "merged-mochawesome.json" );
    const failedTests = extractUniqueFailedTests( reportPath );

    console.log( `❌ Extracted ${ failedTests.length } unique failed test(s):` );
    failedTests.forEach( ( t, i ) => console.log( `${ i + 1 }. ${ t.title }` ) );
}

module.exports = { extractUniqueFailedTests };

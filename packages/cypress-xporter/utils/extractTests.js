function extractTests ( suite, filePath, inheritedProjectId = null )
{
    const tests = [];

    let dynamicProjectId = inheritedProjectId;
    const match = suite.title?.match( /\[(P\d+)\]/i ); // Captures P12, P99, etc.
    if ( match && match[1] )
    {
        dynamicProjectId = match[1]; // "P12"
    }

    if ( suite.tests )
    {
        tests.push(
            ...suite.tests.map( test => ( {
                name: test.fullTitle || test.title || 'Untitled Test',
                state: test.state?.toLowerCase() || 'unknown',
                file: filePath,
                body: test.code || '',
                error: test.err?.message || '',
                projectId: dynamicProjectId || process.env.TESTRAIL_PROJECT_ID
            } ) )
        );
    }

    if ( suite.suites )
    {
        suite.suites.forEach( subSuite =>
        {
            tests.push( ...extractTests( subSuite, filePath, dynamicProjectId ) );
        } );
    }

    return tests;
}

module.exports = { extractTests };

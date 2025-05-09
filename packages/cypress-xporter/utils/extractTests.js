const { extractProjectId } = require( './extractProjectId' ); // If needed

function extractTests ( suite, filePath )
{
    const tests = [];

    if ( suite.tests )
    {
        for ( const test of suite.tests )
        {
            const testName = test.title || test.fullTitle || null;

            tests.push( {
                name: testName,
                fullTitle: test.fullTitle || '',
                title: test.title || '',
                error: test.err?.message || '',
                file: filePath || suite.file || '',
                state: test.state,
                jira: test.jira || 'N/A',
                projectId: extractProjectId( test.fullTitle || test.title || '' ),
            } );
        }
    }

    if ( suite.suites )
    {
        for ( const child of suite.suites )
        {
            tests.push( ...extractTests( child, filePath ) );
        }
    }

    return tests;
}

module.exports = { extractTests };

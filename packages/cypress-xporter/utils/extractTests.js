function extractProjectIdFromTitle ( title )
{
    if ( typeof title !== 'string' ) return null;
    const match = title.match( /\[P(\d+)\]/i );
    return match ? `P${ match[1] }` : null;
}

function extractTests ( suite, filePath )
{
    const tests = [];

    if ( suite.tests )
    {
        for ( const test of suite.tests )
        {
            const title = test.title || test.fullTitle || '';
            const testName = title || null;

            tests.push( {
                name: testName,
                fullTitle: test.fullTitle || '',
                title: test.title || '',
                error: test.err?.message || '',
                file: filePath || suite.file || '',
                state: test.state,
                jira: test.jira || 'N/A',
                projectId: extractProjectIdFromTitle( title ),
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

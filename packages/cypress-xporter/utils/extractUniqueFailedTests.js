const fs = require( "fs" );

function extractUniqueFailedTests ( reportPath )
{
    const report = JSON.parse( fs.readFileSync( reportPath ) );
    const failedTests = [];

    function recurseSuites ( suites, file )
    {
        for ( const suite of suites )
        {
            if ( suite.tests )
            {
                for ( const test of suite.tests )
                {
                    if ( test.fail )
                    {
                        failedTests.push( {
                            title: test.title,
                            fullTitle: test.fullTitle,
                            file: file,
                            state: "failed",
                            error: test.err ? test.err.message || test.err.estack : "Test failed",
                        } );
                    }
                }
            }

            if ( suite.suites?.length )
            {
                recurseSuites( suite.suites, file );
            }
        }
    }

    for ( const result of report.results )
    {
        recurseSuites( result.suites, result.file );
    }

    return failedTests;
}

module.exports = {
    extractUniqueFailedTests,
};

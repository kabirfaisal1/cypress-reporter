exports.reportToJira = async ( failedTests ) =>
{
    if ( failedTests.length === 0 ) return;

    console.log( '🐞 Creating Jira bugs...' );
    for ( const test of failedTests )
    {
        console.log( `🪲 Would create Jira bug for: ${ test.name }` );
        // TODO: Use Jira REST API to open issues
    }
};

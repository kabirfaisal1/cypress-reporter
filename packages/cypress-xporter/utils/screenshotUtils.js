const path = require( 'path' );
const fs = require( 'fs' );

function findScreenshotForTest ( test )
{
    const screenshotsDir = path.join( process.cwd(), 'cypress', 'screenshots' );

    if ( !test || !test.name )
    {
        return null;
    }

    const normalizedTestName = test.name.replace( /[\/\\?%*:|"<>]/g, '' ); // Remove illegal filename characters
    const specPath = test.file ? path.dirname( test.file ) : '';

    const possiblePath = path.join( screenshotsDir, specPath, `${ normalizedTestName } (failed).png` );

    if ( fs.existsSync( possiblePath ) )
    {
        return possiblePath;
    }

    return null;
}

module.exports = {
    findScreenshotForTest
};

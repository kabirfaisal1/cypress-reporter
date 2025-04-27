const path = require( 'path' );
const fs = require( 'fs' );

function findScreenshotForTest ( test )
{
    const screenshotsDir = path.join( process.cwd(), 'cypress', 'screenshots' );

    if ( !test || !test.name )
    {
        console.log( '⚠️ Test object missing or no name provided.' );
        return null;
    }

    // Normalize the test name:
    const normalizedTestName = test.name
        .replace( /[\/\\?%*:|"<>]/g, '' )   // remove illegal filename characters
        .replace( /[-–—]/g, '' )             // remove dashes
        .replace( /\s+/g, ' ' )              // normalize whitespace
        .trim()
        .toLowerCase();

    console.log( '📂 Entering findScreenshotForTest' );
    console.log( `🔍 Looking for screenshot matching: "${ normalizedTestName }" inside "${ screenshotsDir }"` );

    let foundScreenshot = null;

    function recursiveSearch ( dir )
    {
        const files = fs.readdirSync( dir );
        for ( const file of files )
        {
            const fullPath = path.join( dir, file );
            const stat = fs.statSync( fullPath );

            if ( stat.isDirectory() )
            {
                console.log( `📂 Entering directory: ${ fullPath }` );
                recursiveSearch( fullPath );
            } else if ( stat.isFile() )
            {
                console.log( `📄 Found file: ${ fullPath }` );
                const simplifiedFileName = file
                    .replace( /[\/\\?%*:|"<>]/g, '' )
                    .replace( /[-–—]/g, '' )
                    .replace( '(failed)', '' )       // remove the literal "(failed)" if present
                    .replace( /\s+/g, ' ' )
                    .trim()
                    .toLowerCase();

                // Check if the simplified file name contains the normalized test name
                if ( simplifiedFileName.includes( normalizedTestName ) )
                {
                    console.log( `✅ Match found: ${ fullPath }` );
                    foundScreenshot = fullPath;
                    return;
                }
            }
        }
    }

    if ( fs.existsSync( screenshotsDir ) )
    {
        recursiveSearch( screenshotsDir );
    } else
    {
        console.log( `❌ Screenshots directory does not exist: ${ screenshotsDir }` );
    }

    if ( !foundScreenshot )
    {
        console.log( `❌ No screenshot found for test "${ test.name }"` );
    }

    return foundScreenshot;
}

module.exports = {
    findScreenshotForTest
};

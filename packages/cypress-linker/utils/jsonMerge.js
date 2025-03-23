// utils/jsonMerge.js
const fs = require( 'fs' );
const path = require( 'path' );

const file1 = path.join( __dirname, '..', 'cypress/results/.jsons/mochawesome.json' );
const file2 = path.join( __dirname, '..', 'cypress/results/.jsons/mochawesome_001.json' );
const output = path.join( __dirname, '..', 'cypress/results/.jsons/merged-mochawesome.json' );

function mergeReports ( report1, report2 )
{
    const merged = {
        stats: {
            suites: report1.stats.suites + report2.stats.suites,
            tests: report1.stats.tests + report2.stats.tests,
            passes: report1.stats.passes + report2.stats.passes,
            pending: report1.stats.pending + report2.stats.pending,
            failures: report1.stats.failures + report2.stats.failures,
            start: report1.stats.start < report2.stats.start ? report1.stats.start : report2.stats.start,
            end: report1.stats.end > report2.stats.end ? report1.stats.end : report2.stats.end,
            duration: report1.stats.duration + report2.stats.duration,
            testsRegistered: report1.stats.testsRegistered + report2.stats.testsRegistered,
            passPercent: 0,
            pendingPercent: 0,
            other: 0,
            hasOther: false,
            skipped: ( report1.stats.skipped || 0 ) + ( report2.stats.skipped || 0 ),
            hasSkipped: ( report1.stats.hasSkipped || false ) || ( report2.stats.hasSkipped || false )
        },
        results: [...report1.results, ...report2.results],
        meta: report1.meta
    };

    if ( merged.stats.tests > 0 )
    {
        merged.stats.passPercent = ( merged.stats.passes / merged.stats.tests ) * 100;
        merged.stats.pendingPercent = ( merged.stats.pending / merged.stats.tests ) * 100;
    }

    return merged;
}

function runMerge ()
{
    const json1 = JSON.parse( fs.readFileSync( file1 ) );
    const json2 = JSON.parse( fs.readFileSync( file2 ) );
    const merged = mergeReports( json1, json2 );
    fs.writeFileSync( output, JSON.stringify( merged, null, 2 ) );
    console.log( `✅ Merged report saved to: ${ output }` );
}

module.exports = { runMerge, mergedReportPath: output };

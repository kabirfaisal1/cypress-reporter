#!/usr/bin/env node
require( 'dotenv' ).config();
const fs = require( 'fs' );
const path = require( 'path' );
const chalk = require( 'chalk' );
const minimist = require( 'minimist' );

const { reportToJira } = require( './reporters/jira' );
const { reportToTestRail } = require( './reporters/testrail' );
const { uploadTestLogToConfluence } = require( './reporters/confluence' );

const argv = minimist( process.argv.slice( 2 ) );
const useJira = argv.jira || false;
const useConfluence = argv.confluence || false;
const useTestRail = argv.testrail || false;

// 🔍 Search for a folder that looks like a mochawesome report dir
function findReportDir ()
{
    const possiblePaths = [
        path.join( process.cwd(), 'cypress', 'reports', '.jsons' ),
        path.join( process.cwd(), 'cypress', 'report', '.jsons' ),
        path.join( process.cwd(), 'cypress', '.jsons' ),
    ];

    for ( const p of possiblePaths )
    {
        if ( fs.existsSync( p ) && fs.statSync( p ).isDirectory() )
        {
            return p;
        }
    }

    throw new Error( '❌ Could not find a valid mochawesome report directory.' );
}

function mergeAllReports ( directory )
{
    const reportFiles = fs.readdirSync( directory ).filter( file => file.endsWith( '.json' ) );
    if ( !reportFiles.length ) throw new Error( 'No mochawesome reports found to merge.' );

    const reports = [];
    for ( const file of reportFiles )
    {
        const fullPath = path.join( directory, file );
        try
        {
            const content = fs.readFileSync( fullPath, 'utf8' );
            reports.push( JSON.parse( content ) );
        } catch ( err )
        {
            console.error( chalk.red( `❌ Failed to parse ${ file }: ${ err.message }` ) );
            throw err;
        }
    }

    const merged = reports.reduce( ( acc, curr ) =>
    {
        acc.stats.tests += curr.stats.tests;
        acc.stats.passes += curr.stats.passes;
        acc.stats.failures += curr.stats.failures;
        acc.stats.pending += curr.stats.pending;
        acc.stats.suites += curr.stats.suites;
        acc.stats.duration += curr.stats.duration;
        acc.stats.testsRegistered += curr.stats.testsRegistered;
        acc.stats.skipped = ( acc.stats.skipped || 0 ) + ( curr.stats.skipped || 0 );
        acc.stats.hasSkipped = acc.stats.hasSkipped || curr.stats.hasSkipped;
        acc.results.push( ...curr.results );
        return acc;
    }, {
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
        meta: reports[0].meta
    } );

    if ( merged.stats.tests > 0 )
    {
        merged.stats.passPercent = ( merged.stats.passes / merged.stats.tests ) * 100;
        merged.stats.pendingPercent = ( merged.stats.pending / merged.stats.tests ) * 100;
    }

    return merged;
}

function extractTests ( suite, filePath )
{
    const tests = [];

    if ( suite.tests )
    {
        tests.push(
            ...suite.tests.map( test => ( {
                name: test.fullTitle || test.title || 'Untitled Test',
                state: test.state?.toLowerCase() || 'unknown',
                file: filePath,
                body: test.code || '',
                error: test.err?.message || '',
            } ) )
        );
    }

    if ( suite.suites )
    {
        suite.suites.forEach( subSuite =>
        {
            tests.push( ...extractTests( subSuite, filePath ) );
        } );
    }

    return tests;
}

const run = async () =>
{
    let reportDir;
    let mergedReportPath;

    try
    {
        console.log( chalk.yellow( '🔄 Merging all mochawesome reports...' ) );

        reportDir = findReportDir();
        mergedReportPath = path.join( reportDir, 'merged-mochawesome.json' );

        const mergedReport = mergeAllReports( reportDir );
        fs.writeFileSync( mergedReportPath, JSON.stringify( mergedReport, null, 2 ) );

        console.log( chalk.green( `✅ Merged report saved to: ${ mergedReportPath }` ) );
    } catch ( err )
    {
        console.error( chalk.red( '❌ Failed to merge mochawesome reports.' ) );
        console.error( err.message );
        process.exit( 1 );
    }

    if ( !fs.existsSync( mergedReportPath ) )
    {
        console.error( chalk.red( `❌ Merged report not found: ${ mergedReportPath }` ) );
        process.exit( 1 );
    }

    let report;
    try
    {
        const raw = fs.readFileSync( mergedReportPath, 'utf8' );
        report = JSON.parse( raw );
    } catch ( err )
    {
        console.error( chalk.red( `❌ Failed to parse merged report.` ) );
        console.error( err.message );
        process.exit( 1 );
    }

    const allTests = report.results.flatMap( suite => extractTests( suite, suite.file ) );
    console.log( chalk.blue( `📋 Found ${ allTests.length } total test(s)` ) );

    const passedTests = allTests.filter( t => t.state === 'passed' );
    const failedTests = allTests.filter( t => t.state === 'failed' );

    console.log( chalk.green( `✅ Passed: ${ passedTests.length }` ) );
    console.log( chalk.red( `❌ Failed: ${ failedTests.length }` ) );

    let updatedFailedTests = failedTests;
    if ( useJira )
    {
        updatedFailedTests = await reportToJira( failedTests );
    }

    let testRailSummary = null;
    if ( useTestRail )
    {
        testRailSummary = await reportToTestRail( passedTests, updatedFailedTests );
    }

    if ( useConfluence )
    {
        await uploadTestLogToConfluence( passedTests, updatedFailedTests, testRailSummary );
    }
};

run();

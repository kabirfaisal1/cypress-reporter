#!/usr/bin/env node
require( 'dotenv' ).config();
const fs = require( 'fs' );
const path = require( 'path' );
const chalk = require( 'chalk' );
const minimist = require( 'minimist' );

const { reportToJira } = require( './reporters/jira' );
const { reportToTestRail } = require( './reporters/testrail' );
const { uploadTestLogToConfluence } = require( './reporters/confluence' ); // ✅ Fixed import

const argv = minimist( process.argv.slice( 2 ) );
const reportPath = argv._[0] || './cypress/results.json';

const useJira = argv.jira || false;
const useConfluence = argv.confluence || false;
const useTestRail = argv.testrail || false;

function extractTests ( suite, filePath )
{
    const tests = [];

    if ( suite.tests )
    {
        tests.push(
            ...suite.tests.map( test => ( {
                name: test.title.join( ' > ' ),
                state: test.state.toLowerCase?.() || 'unknown',
                file: filePath,
                body: test.body,
                error: test.displayError || null
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
    if ( !fs.existsSync( reportPath ) )
    {
        console.error( chalk.red( `❌ Cypress JSON report not found at: ${ reportPath }` ) );
        process.exit( 1 );
    }

    let report;
    try
    {
        const rawData = fs.readFileSync( path.resolve( reportPath ), 'utf8' );
        report = JSON.parse( rawData );
    } catch ( err )
    {
        console.error( chalk.red( `❌ Failed to read or parse report at ${ reportPath }` ) );
        console.error( err.message );
        process.exit( 1 );
    }

    const allTests = report.results.flatMap( suite => extractTests( suite, suite.file ) );
    console.log( chalk.blue( `📋 Found ${ allTests.length } total test(s)` ) );

    const passedTests = allTests.filter( t => t.state === 'passed' );
    const failedTests = allTests.filter( t => t.state === 'failed' );

    console.log( chalk.green( `✅ Passed: ${ passedTests.length }` ) );
    console.log( chalk.red( `❌ Failed: ${ failedTests.length }` ) );

    if ( useJira ) await reportToJira( failedTests );

    let testRailSummary = null;
    if ( useTestRail )
    {
        testRailSummary = await reportToTestRail( passedTests, failedTests );
    }

    if ( useConfluence )
    {
        await uploadTestLogToConfluence( passedTests, failedTests, testRailSummary );
    }
};

run();

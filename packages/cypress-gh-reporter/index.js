#!/usr/bin/env node
require( 'dotenv' ).config();
const fs = require( 'fs' );
const path = require( 'path' );
const chalk = require( 'chalk' );
const minimist = require( 'minimist' );

const { updateConfluenceDashboard } = require( './reporters/confluence' );
const { reportToJira } = require( './reporters/jira' );
const { reportToTestRail } = require( './reporters/testrail' );

const argv = minimist( process.argv.slice( 2 ) );
const reportPath = argv._[0];

const useJira = argv.jira || false;
const useConfluence = argv.confluence || false;
const useTestRail = argv.testrail || false;

const run = async () =>
{
    if ( !reportPath )
    {
        console.error( chalk.red( '❌ Please provide path to Cypress JSON report.' ) );
        console.error( chalk.yellow( '👉 Example: npm run report -- ./cypress/results.json --jira --testrail --confluence' ) );
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

    const allTests = report.results.flatMap( ( suite ) =>
        ( suite.suites || [] ).flatMap( ( sub ) =>
            ( sub.tests || [] ).map( ( test ) => ( {
                name: test.title.join( ' > ' ),
                state: ( test.state || '' ).toLowerCase(),
                file: suite.file,
                body: test.body,
                error: test.displayError || null,
            } ) )
        )
    );

    console.log( chalk.blue( `📋 Found ${ allTests.length } total test(s)` ) );

    const passedTests = allTests.filter( ( t ) => t.state === 'passed' );
    const failedTests = allTests.filter( ( t ) => t.state === 'failed' );

    console.log( chalk.green( `✅ Passed: ${ passedTests.length }` ) );
    console.log( chalk.red( `❌ Failed: ${ failedTests.length }` ) );

    if ( useJira ) await reportToJira( failedTests );
    if ( useTestRail ) await reportToTestRail( passedTests, failedTests );
    if ( useConfluence ) await updateConfluenceDashboard( passedTests, failedTests );
};

run();

#!/usr/bin/env node
require( 'dotenv' ).config();
const fs = require( 'fs' );
const path = require( 'path' );
const chalk = require( 'chalk' );

const { updateConfluenceDashboard } = require( './reporters/confluence' );
const { reportToJira } = require( './reporters/jira' );
const { reportToTestRail } = require( './reporters/testrail' );

const run = async () =>
{
    const reportPath = process.argv[2];

    if ( !reportPath )
    {
        console.error( chalk.red( '❌ Please provide path to Cypress JSON report.' ) );
        console.error( chalk.yellow( '👉 Example: npm run report -- ./cypress/results.json' ) );
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

    const allTests = [];

    for ( const suite of report.results )
    {
        for ( const parentSuite of suite.suites || [] )
        {
            for ( const childSuite of parentSuite.suites || [] )
            {
                for ( const test of childSuite.tests || [] )
                {
                    allTests.push( {
                        name: test.title.join( ' > ' ),
                        state: test.state,
                        file: suite.file,
                        body: test.body,
                        error: test.displayError || null
                    } );
                }
            }
        }
    }

    console.log( chalk.blue( `📋 Found ${ allTests.length } total test(s)` ) );

    const passedTests = allTests.filter( t => t.state === 'passed' );
    const failedTests = allTests.filter( t => t.state === 'failed' );

    console.log( chalk.green( `✅ Passed: ${ passedTests.length }` ) );
    console.log( chalk.red( `❌ Failed: ${ failedTests.length }` ) );

    // 🐞 Report failed tests to Jira
    await reportToJira( failedTests );

    // 📄 Update Confluence dashboard
    await updateConfluenceDashboard( passedTests, failedTests );

    // 🔜 Future: Report to TestRail
    await reportToTestRail( passedTests, failedTests );
};

run();

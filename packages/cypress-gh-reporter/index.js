#!/usr/bin/env node
require( 'dotenv' ).config();
const fs = require( 'fs' );
const path = require( 'path' );
const chalk = require( 'chalk' );

const { reportToTestRail } = require( './reporters/testrail' );
const { reportToJira } = require( './reporters/jira' );
const { updateConfluenceDashboard } = require( './reporters/confluence' );

const run = async () =>
{
    const reportPath = process.argv[2];

    if ( !reportPath )
    {
        console.error( chalk.red( '❌ Please provide path to Cypress JSON report.' ) );
        process.exit( 1 );
    }

    const report = JSON.parse( fs.readFileSync( path.resolve( reportPath ), 'utf8' ) );

    const allTests = report.results.flatMap( suite =>
        suite.suites.flatMap( sub =>
            sub.tests.map( test => ( {
                name: test.title.join( ' > ' ),
                state: test.state,
                file: suite.file,
                body: test.body,
                error: test.displayError || null
            } ) )
        )
    );

    console.log( chalk.blue( `📋 Found ${ allTests.length } tests` ) );

    const passedTests = allTests.filter( t => t.state === 'passed' );
    const failedTests = allTests.filter( t => t.state === 'failed' );

    console.log( chalk.green( `✅ Passed: ${ passedTests.length }` ) );
    console.log( chalk.red( `❌ Failed: ${ failedTests.length }` ) );

    // 🔁 Report to TestRail
    await reportToTestRail( passedTests, failedTests );

    // 🐞 Create Jira tickets for failed
    await reportToJira( failedTests );

    // 📄 Update Confluence dashboard
    await updateConfluenceDashboard( passedTests, failedTests );
};

run();

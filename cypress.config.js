const { defineConfig } = require( "cypress" );

module.exports = defineConfig( {

  defaultCommandTimeout: 10000,
  video: true,
  reporter: 'cypress-mochawesome-reporter',
  screenshotOnRunFailure: true,
  reporterOptions: {
    reportDir: 'cypress/reports',
    overwrite: true,
  },
  e2e: {
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    baseUrl: "https://excelmate-960f289479ea.herokuapp.com",
    setupNodeEvents ( on, config )
    {
      // implement node event listeners here
    },
  },
} );

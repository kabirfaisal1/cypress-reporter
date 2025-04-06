Cypress.Commands.add( 'verifyTableData', ( headers = [], values = [] ) =>
{
    // Verify download button is visible
    cy.get( '[data-testid="downloadExcel_Button"]' ).should( 'be.visible' );

    // Verify table headers
    headers.forEach( ( header, index ) =>
    {
        cy.get( '[data-testid="dataTable"] th' ).eq( index ).should( 'have.text', header );
    } );

    // Verify table cell values
    values.forEach( ( value, index ) =>
    {
        cy.get( '[data-testid="dataTable"] td' ).eq( index ).should( 'have.text', value );
    } );
} );

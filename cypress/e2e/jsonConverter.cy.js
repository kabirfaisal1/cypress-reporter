describe( '[TR_PID-2] JSON to Excel', () =>
{
    beforeEach( () =>
    {
        // Visit the JSON converter page before each test
        cy.visit( 'jsonConverter' );
    } );

    it( 'should convert simple JSON to a table and show download button [C10]', () =>
    {
        cy.get( 'div[role="code"]' )
            .should( 'be.visible' )
            .type(
                '{"Name": "John Smith", "E-mail": "testWorld@gmail.com"}',
                { parseSpecialCharSequences: false }
            );

        cy.get( 'button[data-testid="convertTable_Button"]' ).click();

        // Check that the Excel download button appears
        cy.get( '[data-testid="downloadExcel_Button"]' ).should( 'be.visible' );

        cy.verifyTableData(
            ['Name', 'E-mail'],
            ['John Smith', 'testWorld@gmail.com']
        );
    } );

    it( 'should convert simple JSON to a table and show download button [C11]', () =>
    {
        cy.get( 'div[role="code"]' )
            .should( 'be.visible' )
            .type(
                '{"Name": "John Smith", "E-mail": "testWorld@gmail.com"}',
                { parseSpecialCharSequences: false }
            );

        cy.get( 'button[data-testid="convertTable_Button"]' ).click();

        // Check that the Excel download button appears
        cy.get( '[data-testid="downloadExcel_Button"]' ).should( 'be.visible' );

        cy.verifyTableData(
            ['Name', 'E-mail'],
            ['John Smith', 'testWorld@gmil.com']
        );
    } );

} );

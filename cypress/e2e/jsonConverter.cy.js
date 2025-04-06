describe( 'JSON to Excel', () =>
{
    beforeEach( () =>
    {
        // Visit the JSON converter page before each test
        cy.visit( 'jsonConverter' );
    } );

    it( 'should convert simple JSON to a table and show download button [C8]', () =>
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
            ['Name', 'E-mail', 'Date of Birth'],
            ['John Smith', 'testWorld@gmail.com']
        );
    } );



    it( 'should verify table after converting JSON with date of birth [C9]', () =>
    {
        cy.get( 'div[role="code"]' ).should( 'be.visible' ).type(
            '{"Name": "John Smith", "E-mail": "testWorld@gmail.com", "Date of Birth": {"day": "01", "month": "01", "year": "1990"}}',
            { parseSpecialCharSequences: false }
        );

        cy.get( 'button[data-testid="convertTable_Button"]' ).click();

        cy.verifyTableData(
            ['Name', 'E-mail', 'Date of Birth'],
            ['John Smith', 'testWorld@gmail.com', '01 01 1990']
        );
    } );
} );

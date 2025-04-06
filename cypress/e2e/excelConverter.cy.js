
describe( 'Excel File Uploader & Converter', () =>
{
    beforeEach( () =>
    {
        // Visit the application page
        cy.visit( '/excelConverter' );
    }
    );
    it( 'Upload Excel and Convert to JS [C1]', () =>
    {
        cy.get( '[data-testid="variable-name-input-field"]' ).should( 'be.visible' ).type( 'JSVariable' ).should( 'have.value', 'JSVariable' );
        cy.get( 'button[role="combobox"]' ).click();
        cy.get( 'select' ).select( 'JavaScript', { force: true } );
        cy.get( 'span[data-slot="select-value"]' ).should( 'have.text', 'JavaScript' );
        // Upload the Excel file
        cy.get( 'input[type="file"]' ).selectFile( 'cypress/fixtures/2Game_of_Thrones_Cast_List_with_Earnings.xlsx', { force: true } );
        cy.get( '[data-testid="totalEntries_count"]' ).should( 'be.visible' );

    } );
    it( 'Upload Excel and Convert to JSON [C2]', () =>
    {
        cy.get( '[data-testid="variable-name-input-field"]' ).should( 'be.visible' ).type( 'JSONVariable' ).should( 'have.value', 'JSONVariable' );
        cy.get( 'button[role="combobox"]' ).click();
        cy.get( 'select' ).select( 'JSON', { force: true } );
        cy.get( 'span[data-slot="select-value"]' ).should( 'have.text', 'JSON' );
        // Upload the Excel file
        cy.get( 'input[type="file"]' ).selectFile( 'cypress/fixtures/2Game_of_Thrones_Cast_List_with_Earnings.xlsx', { force: true } );
        cy.get( '[data-testid="totalEntries_count"]' ).should( 'be.visible' );


    } );
    it( 'Upload Excel and Convert to C# [C4]', () =>
    {
        cy.get( '[data-testid="variable-name-input-field"]' ).should( 'be.visible' ).type( 'CSharpVariable' ).should( 'have.value', 'CSharpVariable' );
        cy.get( 'button[role="combobox"]' ).click();
        cy.get( 'select' ).select( 'C#', { force: true } );
        cy.get( 'span[data-slot="select-value"]' ).should( 'have.text', 'C#' );
        // Upload the Excel file
        cy.get( 'input[type="file"]' ).selectFile( 'cypress/fixtures/2Game_of_Thrones_Cast_List_with_Earnings.xlsx', { force: true } );
        cy.get( '[data-testid="totalEntries_count"]' ).should( 'be.visible' );

    } );
    it( 'Upload Excel and Convert to TypeScript [C3]', () =>
    {
        cy.get( '[data-testid="variable-name-input-field"]' ).should( 'be.visible' ).type( 'TSVariable' ).should( 'have.value', 'TSVariable' );
        cy.get( 'button[role="combobox"]' ).click();
        cy.get( 'select' ).select( 'TypeScript', { force: true } );
        cy.get( 'span[data-slot="select-value"]' ).should( 'have.text', 'TypeScript' );
        // Upload the Excel file
        cy.get( 'input[type="file"]' ).selectFile( 'cypress/fixtures/2Game_of_Thrones_Cast_List_with_Earnings.xlsx', { force: true } );
        cy.get( '[data-testid="totalEntries_count"]' ).should( 'be.visible' );

    } );
    it( 'Upload Excel and Convert to Python [C5]', () =>
    {
        cy.get( '[data-testid="variable-name-input-field"]' ).should( 'be.visible' ).type( 'pyVariable' ).should( 'have.value', 'pyVariable' );
        cy.get( 'button[role="combobox"]' ).click();
        cy.get( 'select' ).select( 'Python', { force: true } );
        cy.get( 'span[data-slot="select-value"]' ).should( 'have.text', 'Python' );
        // Upload the Excel file
        cy.get( 'input[type="file"]' ).selectFile( 'cypress/fixtures/2Game_of_Thrones_Cast_List_with_Earnings.xlsx', { force: true } );
        cy.get( '[data-testid="totalEntries_count"]' ).should( 'be.visible' );

    } );
    it( 'Upload Excel and Convert to Any format and switch [C6]', () =>
    {
        cy.get( '[data-testid="variable-name-input-field"]' ).should( 'be.visible' ).type( 'pyVariable' ).should( 'have.value', 'pyVariable' );
        cy.get( 'button[role="combobox"]' ).click();
        cy.get( 'select' ).select( 'Python', { force: true } );
        cy.get( 'span[data-slot="select-value"]' ).should( 'have.text', 'Python' );
        // Upload the Excel file
        cy.get( 'input[type="file"]' ).selectFile( 'cypress/fixtures/2Game_of_Thrones_Cast_List_with_Earnings.xlsx', { force: true } );
        cy.get( '[data-testid="totalEntries_count"]' ).should( 'be.visible' );
        cy.get( 'span[data-slot="select-value"]' ).should( 'have.text', 'JS' );

    } );
} );

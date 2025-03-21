⚙️ Key Features per Package

📦 @your-org/testrail-reporter
	•	Accepts Cypress JSON report.
	•	Finds matching case in TestRail via case_id tag or spec name.
	•	Updates test run or test plan with result and steps.

📦 @your-org/jira-reporter
	•	Takes failed test cases.
	•	Creates Jira issues with:
	•	Summary = Test name
	•	Description = Spec file path + logs + steps

📦 @your-org/confluence-reporter
	•	Generates HTML (like the one you provided).
	•	Pushes HTML via Confluence REST API.
	•	Supports dynamic yearly/monthly data from test results.

📦 @your-org/cypress-gh-reporter
	•	CLI tool to run everything:
	•	Parses Cypress results
	•	Calls testrail-reporter, jira-reporter, and confluence-reporter
	•	Outputs dashboard to GitHub Action logs and optionally uploads HTML

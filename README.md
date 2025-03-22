
# Cypress Test Reporter CLI

A powerful CLI tool for parsing Cypress JSON test results and automatically reporting them to Confluence, Jira, and TestRail. Ideal for QA teams using modern CI/CD pipelines and test reporting systems.

---

## Table of Contents

1. [Summary](#summary)
2. [Key Features](#key-features)
3. [Installation](#installation)
4. [Environment Setup](#environment-setup)
5. [Usage Instructions](#usage-instructions)
6. [CI/CD Integration](#cicd-integration)
7. [API Token Setup & Configuration](#api-token-setup--configuration)

---

## Summary

This package takes Cypress JSON test reports and generates:

- Confluence test dashboards with rich logs and charts
- Jira bug tickets for failed tests
- TestRail run updates and result syncing

---

## Key Features

- Parse nested Cypress test suites
- Upload test logs and failure tables to Confluence
- Automatically create Jira issues (with duplicate protection)
- Report pass/fail statuses to TestRail
- Embed charts using ChartJS

---

## Installation

```bash
npm install -g cypress-gh-reporter
```

Or as a dev dependency in your Cypress project:

```bash
npm install --save-dev cypress-gh-reporter
```

---

## Environment Setup

Create a `.env` file in your root directory and configure:

```env
# Jira
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=PROJECTKEY

# TestRail
TESTRAIL_DOMAIN=https://yourcompany.testrail.io
TESTRAIL_USERNAME=testrail@example.com
TESTRAIL_API_KEY=your-testrail-api-key
TESTRAIL_PROJECT_ID=1

# Confluence
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_USERNAME=your-email@example.com
CONFLUENCE_API_TOKEN=your-confluence-token
CONFLUENCE_SPACE_KEY=SPACEKEY
CONFLUENCE_PARENT_PAGE_ID=131282
```

---

## Usage Instructions

After running your Cypress test and saving the JSON output (e.g., using mocha reporter):

```bash
npx cypress run --reporter json --reporter-options output=cypress/results.json
```

Run the CLI:

```bash
npx cypress-gh-reporter ./cypress/results.json --jira --testrail --confluence
```

---

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run Cypress tests
  run: npx cypress run --reporter json --reporter-options output=cypress/results.json

- name: Upload Cypress Test Report
  run: npx cypress-gh-reporter ./cypress/results.json --jira --testrail --confluence
  env:
    JIRA_BASE_URL: ${{ secrets.JIRA_BASE_URL }}
    JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
    JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
    # ...other env variables
```

### Jenkins / Legacy CI

Just call the CLI like this in a build step:

```bash
npx cypress-gh-reporter ./cypress/results.json --jira --testrail --confluence
```

---

## API Token Setup & Configuration

### Jira Setup

- **JIRA_BASE_URL**: Your Jira domain, e.g., `https://your-domain.atlassian.net`
- **JIRA_EMAIL**: Your Atlassian email address.
- **JIRA_API_TOKEN**: [Generate a Jira API token](https://id.atlassian.com/manage-profile/security/api-tokens)
- **JIRA_PROJECT_KEY**: Found in your Jira project URL or project settings.

### TestRail Setup

- **TESTRAIL_DOMAIN**: Your TestRail domain, e.g., `https://yourcompany.testrail.io`
- **TESTRAIL_USERNAME**: Your TestRail login email.
- **TESTRAIL_API_KEY**: [Generate TestRail API key](https://www.gurock.com/testrail/docs/api/introduction/)
- **TESTRAIL_PROJECT_ID**: Found in the project URL or via TestRail API.

### Confluence Setup

- **CONFLUENCE_BASE_URL**: Your Confluence domain.
- **CONFLUENCE_USERNAME**: Your Atlassian email.
- **CONFLUENCE_API_TOKEN**: [Generate a Confluence API token](https://id.atlassian.com/manage-profile/security/api-tokens)
- **CONFLUENCE_SPACE_KEY**: Found in space URL or settings.
- **CONFLUENCE_PARENT_PAGE_ID**: The numeric ID in the Confluence page URL.

---

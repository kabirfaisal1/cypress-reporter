# Cypress Linker

**Version:** 1.0.0  
**Last Updated:** March 23, 2025  

A cross-platform CLI tool that links Cypress test results with Jira, TestRail, and Confluence.

---

## Table of Contents

- [Summary](#summary)
- [Key Features](#key-features)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Usage](#usage)
- [CI/CD Integration](#cicd-integration)
- [Token & ID Configuration Guide](#token--id-configuration-guide)

---

## Summary

**Cypress Linker** is an automation tool that reads Cypress Mochawesome JSON reports, merges multiple test runs, and synchronizes the test outcomes across:
- **Jira** (bug tracking)
- **TestRail** (test case status updates)
- **Confluence** (dashboard reporting)

---

## Key Features

- Auto-merges multiple Mochawesome JSON files
- Creates Jira bugs for failed tests
- Reports test run status to TestRail
- Generates and uploads a detailed Confluence page with test logs and summary
- Outputs HTML logs locally under `CypressTest/`

---

## Installation

```bash
npm install -g cypress-linker
```

Or for local use in a Cypress project:

```bash
npm install --save-dev cypress-linker
```

---

## Environment Setup

Create a `.env` file in your project root:

```env
# JIRA
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=PROJECTKEY

# TESTRAIL
TESTRAIL_DOMAIN=https://yourcompany.testrail.io
TESTRAIL_USERNAME=testrail@example.com
TESTRAIL_API_KEY=your-testrail-api-key
TESTRAIL_PROJECT_ID=PROJECT_ID

# CONFLUENCE
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_USERNAME=your-email@example.com
CONFLUENCE_API_TOKEN=your-confluence-token
CONFLUENCE_SPACE_KEY=SPACEKEY
CONFLUENCE_PARENT_PAGE_ID=PAGE_ID
```

---

## Usage

```bash
npx cypress-linker ./cypress/report/.jsons/merged-mochawesome.json --jira --testrail --confluence
```

### CLI Options

| Option          | Description                               |
|-----------------|-------------------------------------------|
| `--jira`        | Enables Jira bug creation for failures    |
| `--testrail`    | Sends pass/fail status to TestRail        |
| `--confluence`  | Creates a Confluence dashboard            |

---

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Cypress Tests
  run: npx cypress run

- name: Report with Cypress Linker
  run: npx cypress-linker ./cypress/report/.jsons/merged-mochawesome.json --jira --testrail --confluence
```

### Jenkins

Add a shell step in your Jenkins pipeline:

```bash
npx cypress-linker ./cypress/report/.jsons/merged-mochawesome.json --jira --testrail --confluence
```

---

## Token & ID Configuration Guide

### Jira
- **API Token:** https://id.atlassian.com/manage-profile/security/api-tokens
- **Project Key:** Found in Jira project settings under "Key"

### TestRail
- **API Key:** Generated in TestRail under your user profile > API keys
- **Project ID:** Found in the TestRail project URL: `/index.php?/projects/overview/{project_id}`

### Confluence
- **API Token:** https://id.atlassian.com/manage-profile/security/api-tokens
- **Space Key:** Found in the Confluence URL as `/spaces/{SPACEKEY}/`
- **Parent Page ID:** Open the parent page > URL contains `pageId=123456`

---

## Output

- Local test log: `./CypressTest/{timestamp}_Cypress Test Log.html`
- Uploaded Confluence page with test chart and log

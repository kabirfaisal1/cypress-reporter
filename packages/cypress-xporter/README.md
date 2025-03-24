# 🚀 Cypress Xporter

[![Cypress](https://img.shields.io/badge/Tested%20With-Cypress-6ad7e5?logo=cypress&logoColor=white)](https://www.cypress.io/)
[![Jira](https://img.shields.io/badge/Integrated%20With-Jira-0052cc?logo=jira&logoColor=white)](https://www.atlassian.com/software/jira)
[![Confluence](https://img.shields.io/badge/Logs%20to-Confluence-172B4D?logo=confluence&logoColor=white)](https://www.atlassian.com/software/confluence)
[![TestRail](https://img.shields.io/badge/Syncs%20With-TestRail-3f51b5)](https://www.testrail.com/)

**Cypress Xporter** is a CLI tool that syncs your Cypress test results with **Jira**, **TestRail**, and **Confluence**. It automates the process of merging test reports, creating bug tickets, updating test plans, and documenting test summaries — all from your terminal.

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [📦 Installation](#-installation)
- [⚙️ Environment Setup](#️-environment-setup)
- [🚀 Usage](#-usage)
- [📘 Example CLI Commands](#-example-cli-commands)
- [🔧 CI/CD Integration](#-cicd-integration)
  - [GitHub Actions](#github-actions)
  - [Jenkins](#jenkins)
- [🔐 Token & ID Setup Help](#-token--id-setup-help)
- [🎥 Playable Demo](#-playable-demo)
- [📷 Screenshots](#-screenshots)
- [📄 License](#-license)

---

## ✨ Features

- ✅ Automatically creates Jira bugs for failed tests
- ✅ Logs test results in TestRail test runs
- ✅ Publishes Cypress test dashboards to Confluence pages
- ✅ Merges all `mochawesome*.json` reports automatically
- ✅ Supports flexible CLI flags (`--jira`, `--testrail`, `--confluence`)

---

## 📦 Installation

### Global installation:

```bash
npm install cypress-xporter
or 
npm install cypress-xporter --save-dev
```


---

## ⚙️ Environment Setup

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
TESTRAIL_PROJECT_ID=ProjectID

# CONFLUENCE
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_USERNAME=your-email@example.com
CONFLUENCE_API_TOKEN=your-confluence-token
CONFLUENCE_SPACE_KEY=SPACEKEY
CONFLUENCE_PARENT_PAGE_ID=Folder/PageID
```

---

## 🚀 Usage

> **ℹ️ Note:**  
> When writing your Cypress tests, you can include the TestRail ID in the test name using the following format:  
> ```javascript
> it('<Test Name> [<TRID>]', () => {
>   // Your test code here
> });
> ```  
> Replace `<Test Name>` with the name of your test and `<TRID>` with the corresponding TestRail ID. This helps Cypress Xporter map the test results to the correct TestRail test cases.


### After running Cypress tests (with Mochawesome reporter):

```bash
npx cypress-xporter --jira --testrail --confluence
```

Cypress Xporter will:

1. Search for all `mochawesome*.json` reports across the project
2. Merge them into a single report
3. Create Jira tickets for failed tests (if `--jira` is passed)
4. Log results to TestRail (if `--testrail` is passed)
5. Generate a dashboard and upload to Confluence (if `--confluence` is passed)



---

## 📘 Example CLI Commands

```bash
# Run everything
npx cypress-xporter --jira --testrail --confluence

# Only push to Jira and TestRail
npx cypress-xporter --jira --testrail

# Only push to Confluence
npx cypress-xporter --confluence
```

Or via npm script (defined in root `package.json`):

```bash
npm run run-all-tools
npm run run-jira-testrail
npm run run-testrail
```

---

## 🔧 CI/CD Integration

### GitHub Actions

```yaml
- name: Run Cypress Tests
  run: npm run cy:run

- name: Report with Cypress Xporter
  run: npx cypress-xporter --jira --testrail --confluence
  env:
    JIRA_BASE_URL: ${{ secrets.JIRA_BASE_URL }}
    JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
    JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
    ...
```

### Jenkins

In your pipeline script:

```bash
npm install
npx cypress run
npx cypress-xporter --jira --testrail --confluence
```

---

## 🔐 Token & ID Setup Help

- 🔑 [Get a Jira API token](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
- 🔑 [Get a Confluence API token](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
- 🔑 [Get a TestRail API key](https://support.testrail.com/hc/en-us/articles/7077039051284-Accessing-the-TestRail-API#h_01J53NS43210J0AN0TV6JPHVYY)
- 📌 **JIRA_PROJECT_KEY** → Can be found in the project settings (e.g., `ABC`)
- 📌 **TESTRAIL_PROJECT_ID** → Use TestRail API or UI to identify
- 📌 **CONFLUENCE_SPACE_KEY** → Space key shown in your space URL (e.g., `TEST`)
- 📌 **CONFLUENCE_PARENT_PAGE_ID** → ID of the parent page/folder where test logs go (check Confluence URL or API)

---
## 🎥 Playable Demo

Check out this quick demo of **Cypress Xporter** in action:
<video controls width="100%" poster="https://res.cloudinary.com/dzsguot60/image/upload/v1742835324/cypress-Xporter/Screenshot_2025-03-24_at_12.54.22_PM_zdl24c.png">
  <source src="https://res.cloudinary.com/dzsguot60/video/upload/v1742834918/cypress-Xporter/Screen_Recording_2025-03-24_at_12.35.58_PM_dxht8g.mov" type="video/mp4">
  Your browser does not support the video tag.
</video>

> **🎥 Playable Demo:**  
> Click the image above to watch a quick demo of **Cypress Xporter** in action.

## 📷 Screenshots

### Test Results Dashboard
![Test Results Dashboard](https://res.cloudinary.com/dzsguot60/image/upload/v1742834937/cypress-Xporter/Screenshot_2025-03-24_at_12.44.25_PM_kdvrt1.png)

### Jira Bug Ticket Example
![Jira Bug Ticket Example](https://res.cloudinary.com/dzsguot60/image/upload/v1742834927/cypress-Xporter/Screenshot_2025-03-24_at_12.42.50_PM_w9fpw0.png)

### Confluence Test Summary
![Confluence Test Summary](https://res.cloudinary.com/dzsguot60/image/upload/v1742834928/cypress-Xporter/Screenshot_2025-03-24_at_12.38.38_PM_qirzek.png)

## 📄 License

MIT © [Kabir Faisal](https://kabirfaisal1.github.io/myReactProtfolio/#/) | [Linkedin](https://www.linkedin.com/in/kabirfaisal89/) | 
[Discord](https://discord.gg/MFh6gYZB)

# API Reverse Engineer 🕵️‍♂️ API Discovery & Documentation Toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**API Reverse Engineer** is a professional-grade Chrome Extension designed for Developers, QA Engineers, and Security Researchers. It sits silently in your DevTools panel, intercepts background network traffic (`fetch`/`XHR`), and **automatically reconstructs the entire architectural blueprint of any web application you browse.**

Stop digging through chaotic Network tabs in DevTools. Start exploring a structured, automatically generated API Map.

---

## 🔒 Unlock The Core Schema Engine (Missing File)

> [!WARNING]
> **Notice:** The file `utils/schemaParser.js` is intentionally omitted from this public repository. This file contains the advanced recursive schema inference logic for nested JSON responses that power the **Entity structure inference** and **TypeScript Interface Generation** features. Without this file, the extension will capture traffic but will not be able to reconstruct JSON object models.

**Want access to the core Schema Engine?**  
1. ⭐ **Star this repository** at the top right of the page.
2. 📩 Open an Issue titled: `Access Request: Schema Engine`.
3. I will verify you starred the repo and grant you private access to the missing file!

---

## ⚡ What Does It Actually Do?

As you click around a website, the extension watches the traffic and builds an intelligent workspace. **Inspired by professional workflows used in tools like BurpSuite and OWASP ZAP**, this extension provides an automated discovery pipeline directly in your browser.

- **📡 Automatic REST & GraphQL Detection:** Seamlessly groups chaotic network calls by Base URL and Endpoint Paths (e.g., collapses `/users/1` and `/users/2` into `GET /users/:id`).
- **🏗️ Entity Structure Inference:** Automatically builds strong JSON schema interfaces and infers potential entity structures from nested JSON responses.
- **🕵️ Deep Hidden Endpoint Discovery:** Uses a 4-pronged heuristic engine (JS Bundle regex scanning, Response JSON crawling, ID Pattern inference, and Dictionary whitelists) to discover internal/admin APIs that *haven't even been called yet*.
- **📊 Execution Flow Waterfall:** Visualizes the exact chronological order of API calls (e.g. `Page Load ↓ /getCsrfToken ↓ /getUser`).
- **📁 Dependency Directory Tree:** Renders cleanly formatted ASCII tree topologies of the API's routing structure.
- **🛡️ Security Scanner:** Automatically flags exposed Personally Identifiable Information (PII), missing authentication headers, verbose stack traces, and CORS misconfigurations.
- **🚀 One-Click Code Scrapers:** Instantly converts any intercepted network call into a copy-pasteable script in `cURL`, `Axios (Node)`, `Fetch`, or `Python Requests`.
- **📝 Automated Documentation:** Generates a beautiful HTML documentation page, an OpenAPI 3.0 specification file, or a full Postman Collection encompassing every endpoint captured during your session.

## 🧠 How It Works Under The Hood

The extension leverages the native `chrome.devtools.network` API via Manifest V3. 

1. **Interception:** A background listener captures requested URLs, methods, headers, and payloads.
2. **Filtering:** Advanced telemetry filters instantly drop analytics, metrics, and tracking pixel payloads (`/log`, `/events`) before they enter memory so your API map stays pristine and focused on core business logic.
3. **In-Memory Parsing:** Responses under 2MB are parsed through pattern-matching algorithms to detect Pagination logic (`?limit=`, `?cursor=`) and Authentication schemas (`Bearer`, `X-API-Key`).
4. **No Cloud Dependency:** 100% of the traffic parsing, schema generation, and code generation happens **locally on your machine**. Absolutely zero network data is sent to external servers.

## 📦 Installation

This extension is built entirely on standard Web APIs and requires no build steps or heavy frameworks.

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/YOUR_USERNAME/api-reverse-engineer.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** via the toggle switch in the top right corner.
4. Click the **Load unpacked** button and select the folder containing this extension's code.

## 💻 How to Use It on a Target Website

1. Navigate to the web application you want to analyze.
2. Open **Chrome DevTools** (`F12` or `Ctrl+Shift+I` / `Cmd+Option+I`).
3. Click the new **"API Reverse Engineer"** tab at the top of the DevTools panel.
4. Browse the target application like a normal user. Click buttons, open modals, and submit forms.
5. Watch the DevTools panel instantly categorize traffic, reverse-engineer the database schema, guess hidden endpoints, and generate Postman collections in real-time.

*(Optional)* To unlock AI functionality, enter your Google Gemini API key securely in the top right of the panel. This is stored utilizing Chrome's secure local storage API.

---

### Disclaimer
*This tool is intended strictly for debugging your own applications, building authorized integrations, API security research, and educational purposes. Do not use this tool to exploit or scrape third-party services without permission. Please parse responsibly.*

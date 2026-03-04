# API Reverse Engineer 🕵️‍♂️ API Discovery & Security Toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![GitHub stars](https://img.shields.io/github/stars/Hamzakhalid54/Api-reverse-Engineer?style=social)](https://github.com/Hamzakhalid54/Api-reverse-Engineer)

**API Reverse Engineer** is a high-fidelity Chrome Extension designed for Security Researchers, Developers, and QA Engineers. It transforms your DevTools into a mission control for API forensics automatically reconstructing architectural blueprints, mapping dependencies, and auditing security in real-time as you browse.

---

## 🔥 What Makes It Different?

Unlike standard Network tabs, this extension doesn't just list requests it **understands** them.

### 1. 🏗️ The Recursive Schema Engine (Now Public!)
We've made our core schema engine fully open-source. The `utils/schemaParser.js` algorithm performs **advanced recursive schema inference**, collapsing deep, nested JSON responses into clean, logical object models. It automatically:
- Infers TypeScript interfaces for every endpoint.
- Maps entity relationships across different API responses.
- Detects pagination patterns and recursive data structures.

### 2. 📊 Hybrid Dependency Visualization
Explore your API architecture through three pro-level graph modes:
- **Dependency Flow (Smart Mode):** A dynamic graph using glassmorphism UI and animated SVG connectors. It intelligently maps data flow using matching IDs or shared URL parameters (like `repo`, `user`, `org`) to show you the logical lineage of requests.
- **Directory Tree:** A high-fidelity, hierarchical view of the API routing structure with professional SVG iconography.
- **Timeline Waterfall:** A chronological map of your session, highlighting how one request leads to the next.

### 3. 🧪 API Replay & IDOR Fuzzer
A built-in sandbox for experimentation:
- **Instant Replay:** One-click replay of any intercepted request with auto-populated headers and bodies.
- **IDOR Fuzzer:** Automatically identifies numeric parameters and executes mutation tests to discover authorization leaks and logical vulnerabilities.

### 4. 🛡️ Noise-Free Security Scanner
Our security engine is tuned for high-signal forensics:
- **PII Detection:** Automatically flags emails, JWTs, and internal API keys.
- **Stack Trace Auditing:** Smarter heuristics detect verbose error leaks without flagging normal text noise.
- **Auth Hardening:** Specifically audits state-changing methods (`POST`, `PUT`, `DELETE`) for missing or weak authorization.

### 5. 📝 Pro Documentation Export
Generate professional-grade artifacts in seconds:
- **HTML Documentation Website:** A stunning, self-contained docs site with sidebar navigation and interactive code blocks.
- **Multi-Format Code Gen:** Instant copy-pasteable snippets for **cURL**, **Axios**, **Native Fetch**, and **Python Requests** all with interactive "Copied!" feedback.
- **OpenAPI 3.0 & Postman:** Full export support for modern API toolchains.

---

## 🚀 Getting Started

### Installation
1. Clone the repository: `git clone https://github.com/Hamzakhalid54/Api-reverse-Engineer.git`
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the extension folder.

### Usage
1. Open **DevTools** (`F12`) on any target website.
2. Click the **API Reverse Engineer** tab.
3. Browse the application. Watch the dashboard build your API map in real-time.
4. *(Optional)* Input a **Google Gemini API Key** in the settings to enable AI-powered endpoint explanations.

---

## 🔒 Privacy & Safety
- **100% Local:** All data parsing and scanning happens locally in your browser. No network data is ever sent to external servers.
- **Filtering:** Intelligent filters exclude analytics and telemetry (`/tracking`, `/log`, `/metrics`) to keep your workspace clean and focused on business logic.

---

## 🤝 Contributing
Contributions are welcome! Whether it's adding new code exporters, refining fuzzing logic, or improving graph performance, feel free to open a PR.

---

### Disclaimer
*This tool is intended for debugging, security research, and educational purposes. Always ensure you have permission to test or analyze third-party APIs. Parse responsibly.*

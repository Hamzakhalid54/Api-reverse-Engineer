import { parseSchema, inferDatabaseRelations } from './utils/schemaParser.js';
import { groupRequestsByPrefix, normalizeEndpoint } from './utils/endpointDetector.js';
import { detectAuth } from './utils/authDetector.js';
import { detectPagination } from './utils/paginationDetector.js';
import { explainEndpoint, reverseEngineerArchitecture } from './utils/aiExplainer.js';
import { scanForSecurityIssues } from './utils/securityScanner.js';
import { generatePostmanCollection } from './utils/postmanGenerator.js';
import { generateOpenAPI } from './utils/openapiGenerator.js';
import { generateHtmlDocs } from './utils/htmlDocsGenerator.js';

let requests = [];
const MAX_REQUESTS = 500;
const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2MB
let currentSelected = null;
let activeFilters = new Set();
let graphMode = 'timeline';

// Hidden Endpoint Discovery Signals
const discoveredJSEndpoints = new Set();
const discoveredResponseEndpoints = new Set();

document.addEventListener('DOMContentLoaded', () => {
    // API Key load / save
    const keyInput = document.getElementById('gemini-key');
    if (chrome && chrome.storage) {
        chrome.storage.local.get(['geminiApiKey'], (res) => {
            if (res.geminiApiKey) keyInput.value = res.geminiApiKey;
        });
        keyInput.addEventListener('change', (e) => {
            chrome.storage.local.set({ geminiApiKey: e.target.value.trim() });
        });
    }

    document.getElementById('clear-data-btn').addEventListener('click', () => {
        requests = [];
        updateUI();
        document.getElementById('endpoint-details').classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
        document.getElementById('timeline-list').innerHTML = '';
        document.getElementById('global-ai-result').classList.add('hidden');
    });

    document.getElementById('export-postman-btn').addEventListener('click', () => {
        const groups = groupRequestsByPrefix(requests);
        const json = generatePostmanCollection(groups);
        downloadFile(json, 'postman_collection.json');
    });

    document.getElementById('export-openapi-btn').addEventListener('click', () => {
        const groups = groupRequestsByPrefix(requests);
        const json = generateOpenAPI(groups);
        downloadFile(json, 'openapi.json');
    });

    document.getElementById('export-html-btn').addEventListener('click', () => {
        const groups = groupRequestsByPrefix(requests);
        const html = generateHtmlDocs(groups, requests);
        downloadFile(html, 'api_docs.html', 'text/html');
    });

    document.getElementById('ai-architect-btn').addEventListener('click', async () => {
        const btn = document.getElementById('ai-architect-btn');
        btn.disabled = true;
        btn.innerText = 'Analyzing...';
        try {
            const groups = groupRequestsByPrefix(requests);
            const apiMap = {};
            Object.keys(groups).forEach(k => {
                const endpoints = new Set();
                groups[k].forEach(req => {
                    try {
                        endpoints.add(`${req.method} ${normalizeEndpoint(new URL(req.url).pathname)}`);
                    } catch (e) { }
                });
                apiMap[k] = Array.from(endpoints);
            });
            const res = await reverseEngineerArchitecture(apiMap);
            document.getElementById('global-ai-content').innerText = res;
            document.getElementById('global-ai-result').classList.remove('hidden');
        } catch (e) {
            alert(e.message);
        }
        btn.disabled = false;
        btn.innerText = '✨ AI Reverse Engineering Mode';
    });

    // Tabs functionality
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            e.target.classList.add('active');
            const targetId = e.target.dataset.target;
            if (targetId) {
                document.getElementById(targetId).classList.add('active');
            }
        });
    });

    // Replay Functionality
    document.getElementById('replay-send-btn').addEventListener('click', async () => {
        if (!currentSelected) return;
        try {
            const headers = JSON.parse(document.getElementById('replay-headers').value || '{}');
            const bodyStr = document.getElementById('replay-body').value;
            const options = {
                method: currentSelected.method,
                headers: headers
            };
            if (currentSelected.method !== 'GET' && currentSelected.method !== 'HEAD' && bodyStr) {
                options.body = bodyStr;
            }
            const res = await fetch(currentSelected.url, options);
            const text = await res.text();
            document.getElementById('replay-response').innerText = text;
        } catch (e) {
            document.getElementById('replay-response').innerText = 'Error: ' + e.message;
        }
    });

    document.getElementById('replay-fuzz-btn').addEventListener('click', () => {
        if (!currentSelected) return;
        runFuzzing(currentSelected);
    });

    document.getElementById('explain-endpoint-btn').addEventListener('click', async () => {
        if (!currentSelected) return;
        const btn = document.getElementById('explain-endpoint-btn');
        btn.disabled = true;
        btn.innerText = 'Explaining...';
        try {
            const exp = await explainEndpoint(currentSelected);
            document.getElementById('ep-ai-explanation').classList.remove('hidden');
            document.getElementById('ep-ai-explanation').querySelector('.markdown-body').innerText = exp;
        } catch (e) {
            alert(e.message);
        }
        btn.disabled = false;
        btn.innerText = '✨ Explain Endpoint with AI';
    });

    // Copy to clipboard buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const codeId = e.target.dataset.target;
            const textToCopy = document.getElementById(codeId).innerText;
            navigator.clipboard.writeText(textToCopy).then(() => {
                const prev = e.target.innerText;
                e.target.innerText = 'Copied!';
                setTimeout(() => e.target.innerText = prev, 2000);
            });
        });
    });

    // Endpoint Search & Filters
    document.getElementById('endpoint-search').addEventListener('input', (e) => {
        updateUI(e.target.value.toLowerCase());
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const f = e.target.dataset.filter;
            if (activeFilters.has(f)) {
                activeFilters.delete(f);
                e.target.classList.remove('active');
            } else {
                activeFilters.add(f);
                e.target.classList.add('active');
            }
            updateUI(document.getElementById('endpoint-search').value.toLowerCase());
        });
    });

    // Graph UI Visualizer
    document.getElementById('show-graph-btn').addEventListener('click', () => {
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('endpoint-details').classList.add('hidden');
        document.getElementById('graph-view').classList.remove('hidden');
        renderGraph();
    });

    document.getElementById('close-graph-btn').addEventListener('click', () => {
        document.getElementById('graph-view').classList.add('hidden');
        if (currentSelected) {
            document.getElementById('endpoint-details').classList.remove('hidden');
        } else {
            document.getElementById('empty-state').classList.remove('hidden');
        }
    });

    document.getElementById('mode-timeline-btn').addEventListener('click', (e) => {
        graphMode = 'timeline';
        e.target.classList.add('active');
        document.getElementById('mode-tree-btn').classList.remove('active');
        document.getElementById('mode-flow-btn').classList.remove('active');
        renderGraph();
    });

    document.getElementById('mode-tree-btn').addEventListener('click', (e) => {
        graphMode = 'tree';
        e.target.classList.add('active');
        document.getElementById('mode-timeline-btn').classList.remove('active');
        document.getElementById('mode-flow-btn').classList.remove('active');
        renderGraph();
    });

    document.getElementById('mode-flow-btn').addEventListener('click', (e) => {
        graphMode = 'flow';
        e.target.classList.add('active');
        document.getElementById('mode-timeline-btn').classList.remove('active');
        document.getElementById('mode-tree-btn').classList.remove('active');
        renderGraph();
    });

    // Code Copy Buttons with Feedback
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const text = document.getElementById(targetId).innerText;
            navigator.clipboard.writeText(text).then(() => {
                btn.classList.add('copied');
                setTimeout(() => btn.classList.remove('copied'), 2000);
            });
        });
    });
});

// DevTools Network Listener
if (typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.network) {
    chrome.devtools.network.onRequestFinished.addListener(req => {
        const type = (req._resourceType || '').toLowerCase();
        if (['image', 'stylesheet', 'font', 'media'].includes(type) && !req.request.url.includes('api')) return;
        if (req.request.method === 'OPTIONS') return;

        const urlLower = req.request.url.toLowerCase();
        const ignoreTerms = ['analytics', 'manifest', 'events', 'metrics', 'telemetry', 'log', 'tracking', 'ads', 'pixel', 'heartbeat'];
        if (ignoreTerms.some(term => urlLower.includes(term))) return;
        if (req.response && req.response.content && req.response.content.size > MAX_RESPONSE_SIZE) return;

        req.getContent((content, encoding) => {
            if (!content) return;
            let text = content;
            if (encoding === 'base64') {
                try { text = atob(content); } catch (e) { }
            }

            if (type === 'script') {
                const apiPaths = text.match(/['"`]\/[a-zA-Z0-9-._]+(\/[a-zA-Z0-9-._]+)+['"`]/g);
                if (apiPaths) {
                    apiPaths.forEach(p => {
                        const cleanPath = p.replace(/['"`]/g, '');
                        if (cleanPath.includes('/') && cleanPath.length > 3 && !cleanPath.endsWith('.js') && !cleanPath.endsWith('.css')) {
                            discoveredJSEndpoints.add(cleanPath);
                        }
                    });
                }
                if (!req.request.url.includes('api')) return;
            }

            let parsedBody = null;
            try {
                parsedBody = JSON.parse(text);
                // Extract paths logic
                const scanForPaths = (obj) => {
                    if (typeof obj === 'string') {
                        if (obj.startsWith('/') && obj.length > 4 && obj.substring(1).includes('/')) {
                            if (!obj.includes(' ') && !obj.includes('<')) discoveredResponseEndpoints.add(obj);
                        }
                    } else if (typeof obj === 'object' && obj !== null) {
                        for (let k in obj) scanForPaths(obj[k]);
                    }
                };
                scanForPaths(parsedBody);
            } catch (e) { }

            if (parsedBody && typeof parsedBody === 'object') {
                let isGraphQL = req.request.url.includes('/graphql');
                let operationName = 'Unknown';
                if (isGraphQL && req.request.postData && req.request.postData.text) {
                    try {
                        const payload = JSON.parse(req.request.postData.text);
                        if (payload.operationName) operationName = payload.operationName;
                    } catch (e) { }
                }

                let rateLimitData = null;
                if (req.response && req.response.headers) {
                    const rlLimit = req.response.headers.find(h => h.name.toLowerCase() === 'x-ratelimit-limit');
                    const rlRemaining = req.response.headers.find(h => h.name.toLowerCase() === 'x-ratelimit-remaining');
                    if (rlLimit) {
                        rateLimitData = `Limit: ${rlLimit.value}` + (rlRemaining ? `, Remaining: ${rlRemaining.value}` : '');
                    }
                }

                const requestData = {
                    url: req.request.url,
                    method: req.request.method,
                    headers: req.request.headers || [],
                    requestBody: (req.request && req.request.postData) ? req.request.postData.text : null,
                    responseBody: parsedBody,
                    queryString: req.request.queryString || [],
                    timestamp: new Date().toLocaleTimeString(),
                    timeMs: req.time || 0,
                    status: (req.response ? req.response.status : 0),
                    isGraphQL: isGraphQL,
                    graphqlOp: operationName,
                    rateLimit: rateLimitData,
                    raw: req
                };
                addRequest(requestData);
                updateSecurityReport();
            }
        });
    });
}

function addRequest(reqData) {
    requests.push(reqData);
    if (requests.length > MAX_REQUESTS) requests.shift();
    const timeline = document.getElementById('timeline-list');
    const li = document.createElement('li');
    let path = reqData.url;
    try { path = new URL(reqData.url).pathname; } catch (e) { }
    li.innerHTML = `<strong>${reqData.method}</strong> ${path}<span class="time">${reqData.timestamp}</span>`;
    timeline.prepend(li);
    updateUI();
}

function updateUI(searchTerm = '') {
    if (requests.length > 0) document.getElementById('empty-state').classList.add('hidden');
    const groups = groupRequestsByPrefix(requests);
    const container = document.getElementById('api-map-container');
    container.innerHTML = '';

    for (const [groupName, groupReqs] of Object.entries(groups)) {
        if (!groupReqs || groupReqs.length === 0) continue;
        const uniqueEndpoints = new Map();
        groupReqs.forEach(req => {
            try {
                const urlObj = new URL(req.url);
                const normPath = normalizeEndpoint(urlObj.pathname);
                const key = `${req.method} ${normPath}`;
                if (!uniqueEndpoints.has(key)) uniqueEndpoints.set(key, []);
                uniqueEndpoints.get(key).push(req);
            } catch (e) { }
        });

        if (uniqueEndpoints.size === 0) continue;
        const groupEl = document.createElement('div');
        groupEl.className = 'api-group';
        const title = document.createElement('h3');
        title.className = 'api-group-title';
        title.innerText = groupName || 'General';

        let hasVisibleItems = false;
        const itemsContainer = document.createElement('div');

        uniqueEndpoints.forEach((reqsArray, key) => {
            const methodWord = key.split(' ')[0];
            const pathWord = key.split(' ')[1] || key;
            if (searchTerm && !key.toLowerCase().includes(searchTerm) && !groupName.toLowerCase().includes(searchTerm)) return;

            if (activeFilters.size > 0) {
                let show = true;
                if (activeFilters.has('GET') && methodWord !== 'GET') show = false;
                if (activeFilters.has('POST') && methodWord !== 'POST') show = false;
                if (activeFilters.has('Errors') && !reqsArray.some(r => r.status >= 400)) show = false;
                if (activeFilters.has('Auth') && !reqsArray.some(r => detectAuth(r.headers) !== 'None')) show = false;
                if (activeFilters.has('Public') && !reqsArray.some(r => detectAuth(r.headers) === 'None')) show = false;
                if (!show) return;
            }

            hasVisibleItems = true;
            const ep = document.createElement('div');
            ep.className = 'api-endpoint-item';
            const methodBadge = `<span class="method-badge method-${methodWord.toLowerCase()}">${methodWord}</span>`;
            ep.innerHTML = `${methodBadge} <span class="path-text">${pathWord}</span>`;
            ep.addEventListener('click', () => {
                document.querySelectorAll('.api-endpoint-item').forEach(el => el.classList.remove('active'));
                ep.classList.add('active');
                selectEndpoint(reqsArray, pathWord);
            });
            itemsContainer.appendChild(ep);
        });

        if (hasVisibleItems) {
            groupEl.appendChild(title);
            groupEl.appendChild(itemsContainer);
            container.appendChild(groupEl);
        }
    }
}

function selectEndpoint(reqsArray, normalizedPath) {
    const latestReq = reqsArray[reqsArray.length - 1];
    currentSelected = latestReq;

    document.getElementById('graph-view').classList.add('hidden');
    document.getElementById('endpoint-details').classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('ep-ai-explanation').classList.add('hidden');

    document.getElementById('ep-method').innerText = latestReq.isGraphQL ? 'GRAPHQL' : latestReq.method;
    document.getElementById('ep-method').className = `method-badge ${latestReq.method}`;
    let displayUrl = normalizedPath;
    if (latestReq.isGraphQL && latestReq.graphqlOp !== 'Unknown') displayUrl += ` [${latestReq.graphqlOp}]`;
    document.getElementById('ep-url').innerText = displayUrl;
    document.getElementById('ep-auth').innerText = detectAuth(latestReq.headers);
    document.getElementById('ep-pagination').innerText = detectPagination(latestReq.queryString);

    let totalTime = 0, errors = 0, latestRateLimit = null;
    reqsArray.forEach(r => {
        totalTime += (r.timeMs || 0);
        if (r.status >= 400 || r.status === 0) errors++;
        if (r.rateLimit) latestRateLimit = r.rateLimit;
    });

    document.getElementById('ep-calls').innerText = reqsArray.length;
    document.getElementById('ep-avg-time').innerText = Math.round(totalTime / reqsArray.length);
    document.getElementById('ep-errors').innerText = errors + (latestRateLimit ? ` | ${latestRateLimit}` : '');

    const warnings = scanForSecurityIssues(latestReq, latestReq.responseBody);
    const warningsEl = document.getElementById('ep-warnings');
    warningsEl.innerHTML = '';
    if (warnings.length === 0) {
        warningsEl.innerHTML = '<li style="color:var(--success)">No issues detected.</li>';
    } else {
        warnings.forEach(w => {
            const li = document.createElement('li');
            li.innerText = w;
            warningsEl.appendChild(li);
        });
    }

    // Hidden Endpoint Guesser
    const guessesEl = document.getElementById('ep-hidden-guesses');
    guessesEl.innerHTML = '';
    let foundAny = false;
    const createLi = (text, cssColor) => {
        const li = document.createElement('li');
        li.style = `cursor:pointer; text-decoration:underline; color:${cssColor}`;
        li.innerText = `GET ${text}`;
        li.addEventListener('click', () => navigator.clipboard.writeText(text));
        guessesEl.appendChild(li);
        foundAny = true;
    };

    const pathParts = new URL(latestReq.url).pathname.split('/').filter(p => p && !['api', 'v1', 'v2', 'v3', 'graphql'].includes(p.toLowerCase()));
    const lastPart = pathParts[pathParts.length - 1];
    discoveredJSEndpoints.forEach(ep => { if (lastPart && ep.includes(lastPart)) createLi(ep, 'var(--method-get)'); });
    discoveredResponseEndpoints.forEach(ep => { if (lastPart && ep.includes(lastPart)) createLi(ep, 'var(--method-put)'); });
    if (!foundAny) guessesEl.innerHTML = '<li style="color:var(--text-secondary);list-style:none;">No specific predictions found.</li>';

    // Mini Console
    const consoleEl = document.getElementById('ep-mini-console');
    if (latestReq.responseBody) {
        document.getElementById('ep-sample-size').innerText = `(${(JSON.stringify(latestReq.responseBody).length / 1024).toFixed(1)} KB)`;
        renderJSON(latestReq.responseBody, consoleEl);
    } else {
        document.getElementById('ep-sample-size').innerText = '(0 KB)';
        consoleEl.innerHTML = '{}';
    }

    // Params
    const qEl = document.getElementById('ep-req-query');
    qEl.innerText = latestReq.queryString.length > 0 ? latestReq.queryString.map(q => `${q.name}=${q.value}`).join('\n') : 'No query parameters';

    const hEl = document.getElementById('ep-req-headers');
    hEl.innerText = latestReq.headers.map(h => `${h.name}: ${h.name.toLowerCase() === 'authorization' ? '********' : h.value}`).join('\n');

    const bEl = document.getElementById('ep-req-body');
    if (latestReq.requestBody) {
        try { bEl.innerText = JSON.stringify(JSON.parse(latestReq.requestBody), null, 2); } catch (e) { bEl.innerText = latestReq.requestBody; }
    } else { bEl.innerText = 'No request body'; }

    // Schema
    document.getElementById('ep-schema').innerText = parseSchema(latestReq.responseBody, 'Response');
    document.getElementById('ep-db-schema').innerText = inferDatabaseRelations(latestReq.responseBody, new URL(latestReq.url).pathname);

    // Samples
    const sampleSelector = document.getElementById('ep-sample-selector');
    sampleSelector.innerHTML = '';
    const recentSamples = reqsArray.slice(-5).reverse();
    recentSamples.forEach((reqObj, idx) => {
        const btn = document.createElement('button');
        btn.className = `sample-btn ${idx === 0 ? 'active' : ''}`;
        btn.innerText = `Sample ${recentSamples.length - idx} (${reqObj.status})`;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sample-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderJSON(reqObj.responseBody || {}, document.getElementById('ep-example-res'));
        });
        sampleSelector.appendChild(btn);
    });
    renderJSON(latestReq.responseBody || {}, document.getElementById('ep-example-res'));

    generateCode(latestReq);

    // Replay Prep
    const headerObj = {};
    latestReq.headers.forEach(h => {
        const hn = h.name.toLowerCase();
        if (!hn.startsWith(':') && !['host', 'content-length', 'cookie', 'user-agent', 'accept-encoding', 'origin', 'referer', 'connection', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site'].includes(hn)) {
            headerObj[h.name] = h.value;
        }
    });
    document.getElementById('replay-headers').value = JSON.stringify(headerObj, null, 2);
    document.getElementById('replay-body').value = latestReq.requestBody || '';
}

function updateSecurityReport() {
    const container = document.getElementById('security-report-list');
    if (!container) return;
    container.innerHTML = '';
    const allWarnings = [];
    requests.forEach(req => {
        const warnings = scanForSecurityIssues(req, req.responseBody);
        if (warnings.length > 0) {
            let path = req.url;
            try { path = new URL(req.url).pathname; } catch (e) { }
            allWarnings.push({ path, method: req.method, warnings });
        }
    });

    if (allWarnings.length === 0) {
        container.innerHTML = '<p class="empty-msg">No session-wide vulnerabilities found yet.</p>';
        return;
    }

    const uniqueMap = new Map();
    allWarnings.forEach(item => {
        item.warnings.forEach(w => {
            if (!uniqueMap.has(w)) uniqueMap.set(w, new Set());
            uniqueMap.get(w).add(`${item.method} ${item.path}`);
        });
    });

    uniqueMap.forEach((endpoints, warning) => {
        const div = document.createElement('div');
        div.className = 'info-card warning-card';
        div.style.marginBottom = '15px';
        div.innerHTML = `<h4 style="color:var(--danger)">⚠️ ${warning}</h4><ul style="padding-left:15px; font-size:0.8rem">${Array.from(endpoints).map(e => `<li>${e}</li>`).join('')}</ul>`;
        container.appendChild(div);
    });
}

function runFuzzing(req) {
    const resultsList = document.getElementById('fuzz-results');
    document.getElementById('fuzz-results-box').classList.remove('hidden');
    resultsList.innerHTML = '<p>Starting fuzzer...</p>';
    const urlObj = new URL(req.url);
    const params = new URLSearchParams(urlObj.search);
    const mutations = [];
    params.forEach((value, key) => {
        if (!isNaN(value) && value.length > 0) {
            const base = parseInt(value);
            mutations.push({ key, value: base + 1 }, { key, value: base - 1 }, { key, value: 'admin' }, { key, value: '0' });
        }
    });

    if (mutations.length === 0) {
        resultsList.innerHTML = '<p style="color:var(--warning)">No numeric parameters to fuzz.</p>';
        return;
    }

    resultsList.innerHTML = '';
    mutations.forEach(async m => {
        const fuzzUrl = new URL(req.url);
        fuzzUrl.searchParams.set(m.key, m.value);
        const item = document.createElement('div');
        item.innerHTML = `Testing <code>${m.key}=${m.value}</code>...`;
        resultsList.appendChild(item);
        try {
            const resp = await fetch(fuzzUrl.toString(), {
                method: req.method,
                headers: JSON.parse(document.getElementById('replay-headers').value || '{}')
            });
            item.innerHTML = `<span>${m.key}=${m.value}</span> -> <strong style="color:${resp.status === 200 ? 'var(--danger)' : 'var(--text-secondary)'}">HTTP ${resp.status}</strong>`;
        } catch (e) { item.innerHTML += ' Fail'; }
    });
}

function generateCode(req) {
    const url = req.url, method = req.method;

    // 1. cURL
    let curl = `curl -X ${method} "${url}" \\`;
    req.headers.forEach(h => {
        if (!h.name.startsWith(':') && !['host', 'content-length'].includes(h.name.toLowerCase())) {
            curl += `\n  -H "${h.name}: ${h.value.replace(/"/g, '\\"')}" \\`;
        }
    });
    if (req.requestBody) curl += `\n  -d '${req.requestBody.replace(/'/g, "'\\''")}'`;
    document.getElementById('code-curl').innerText = curl.replace(/ \\\n$/, '');

    // 2. Axios (JS)
    let axiosSnippet = `// Axios Example\nconst axios = require('axios');\n\n`;
    axiosSnippet += `const res = await axios({\n  method: '${method.toLowerCase()}',\n  url: '${url}',\n`;
    if (req.requestBody) axiosSnippet += `  data: ${req.requestBody},\n`;
    axiosSnippet += `  headers: {\n`;
    req.headers.forEach(h => {
        if (!h.name.startsWith(':') && !['host', 'content-length', 'cookie'].includes(h.name.toLowerCase())) {
            axiosSnippet += `    '${h.name}': '${h.value.replace(/'/g, "\\'")}',\n`;
        }
    });
    axiosSnippet += `  }\n});`;
    document.getElementById('code-axios').innerText = axiosSnippet;

    // 3. Fetch (JS)
    let fetchSnippet = `// Native Fetch Example\nconst response = await fetch("${url}", {\n  method: "${method}",\n`;
    fetchSnippet += `  headers: {\n`;
    req.headers.forEach(h => {
        if (!h.name.startsWith(':') && !['host', 'content-length', 'cookie'].includes(h.name.toLowerCase())) {
            fetchSnippet += `    "${h.name}": "${h.value.replace(/"/g, '\\"')}",\n`;
        }
    });
    fetchSnippet += `  },\n`;
    if (req.requestBody) fetchSnippet += `  body: JSON.stringify(${req.requestBody})\n`;
    fetchSnippet += `});\nconst data = await response.json();`;
    document.getElementById('code-fetch').innerText = fetchSnippet;

    // 4. Python Requests
    let pySnippet = `import requests\nimport json\n\nurl = "${url}"\n`;
    pySnippet += `headers = {\n`;
    req.headers.forEach(h => {
        if (!h.name.startsWith(':') && !['host', 'content-length', 'cookie'].includes(h.name.toLowerCase())) {
            pySnippet += `    "${h.name}": "${h.value.replace(/"/g, '\\"')}",\n`;
        }
    });
    pySnippet += `}\n\n`;
    if (req.requestBody) {
        pySnippet += `payload = ${req.requestBody}\n`;
        pySnippet += `response = requests.${method.toLowerCase()}(url, headers=headers, json=payload)`;
    } else {
        pySnippet += `response = requests.${method.toLowerCase()}(url, headers=headers)`;
    }
    pySnippet += `\nprint(response.json())`;
    document.getElementById('code-python').innerText = pySnippet;
}

function renderGraph() {
    const container = document.getElementById('graph-nodes-container');
    container.innerHTML = '';
    if (requests.length === 0) { container.innerHTML = '<p>No data.</p>'; return; }
    if (graphMode === 'timeline') renderGraphTimeline(container);
    else if (graphMode === 'tree') renderGraphTree(container);
    else renderGraphFlow(container);
}

function renderGraphTimeline(container) {
    container.className = 'waterfall-container';
    container.innerHTML = '';
    const svg = document.getElementById('graph-svg');
    svg.innerHTML = svg.querySelector('defs').outerHTML; // Clear paths

    requests.forEach(req => {
        const div = document.createElement('div');
        div.className = 'waterfall-node';
        try {
            const path = new URL(req.url).pathname;
            div.innerHTML = `
                <span class="method-badge method-${req.method.toLowerCase()}">${req.method}</span> 
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${path}</span>
                <span style="display:flex; align-items:center; gap:4px; font-size:0.7rem; color:var(--text-secondary); opacity:0.8">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    ${req.timestamp}
                </span>`;
            div.addEventListener('click', () => selectEndpoint([req], req.url));
            container.appendChild(div);
        } catch (e) { }
    });

    // Draw vertical timeline line
    setTimeout(() => {
        const nodes = container.querySelectorAll('.waterfall-node');
        if (nodes.length < 2) return;
        const containerRect = container.getBoundingClientRect();

        for (let i = 0; i < nodes.length - 1; i++) {
            const r1 = nodes[i].getBoundingClientRect();
            const r2 = nodes[i + 1].getBoundingClientRect();

            const x = (r1.left + r1.width / 2) - containerRect.left;
            const y1 = r1.bottom - containerRect.top;
            const y2 = r2.top - containerRect.top;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", `M ${x} ${y1} L ${x} ${y2}`);
            svg.appendChild(path);
        }
    }, 100);
}

function renderGraphTree(container) {
    container.className = 'directory-tree';
    container.innerHTML = '';
    const svg = document.getElementById('graph-svg');
    svg.innerHTML = svg.querySelector('defs').outerHTML; // Keep defs, clear paths

    const rootMap = new Map();
    requests.forEach(req => {
        try {
            const path = new URL(req.url).pathname;
            const parts = path.split('/').filter(p => p && !['api', 'v1', 'v2'].includes(p.toLowerCase()));
            if (parts.length > 0) {
                const root = '/' + parts[0];
                if (!rootMap.has(root)) rootMap.set(root, new Set());
                rootMap.get(root).add(req);
            }
        } catch (e) { }
    });

    rootMap.forEach((reqs, root) => {
        const rootDiv = document.createElement('div');
        rootDiv.className = 'dir-root';
        rootDiv.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent)"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            ${root}`;
        container.appendChild(rootDiv);

        const subpaths = new Map();
        reqs.forEach(req => {
            const path = new URL(req.url).pathname;
            const sub = path.substring(path.indexOf(root) + root.length) || '/';
            const key = `${req.method} ${sub}`;
            if (!subpaths.has(key)) subpaths.set(key, []);
            subpaths.get(key).push(req);
        });

        subpaths.forEach((arr, key) => {
            const epDiv = document.createElement('div');
            epDiv.className = 'dir-endpoint';
            const method = key.split(' ')[0];
            const sub = key.split(' ')[1];
            epDiv.innerHTML = `
                <span class="dir-method method-${method.toLowerCase()}">${method}</span>
                <span style="opacity:0.9">${sub}</span>
            `;
            epDiv.addEventListener('click', () => selectEndpoint(arr, `${root}${sub}`));
            container.appendChild(epDiv);
        });
    });
}

function renderGraphFlow(container) {
    container.className = 'dependency-flow';
    container.innerHTML = '';
    const svg = document.getElementById('graph-svg');
    svg.innerHTML = svg.querySelector('defs').outerHTML; // Keep defs, clear paths

    const idMap = new Map(), relations = [];
    const sharedParamsMap = new Map(); // For weak dependencies

    requests.forEach(req => {
        // 1. Data-Driven Dependencies (Strong)
        if (req.responseBody && typeof req.responseBody === 'object') {
            const scan = (o) => {
                for (let k in o) {
                    if (k.toLowerCase().includes('id') && (typeof o[k] === 'string' || typeof o[k] === 'number')) {
                        if (!idMap.has(o[k])) idMap.set(o[k], req);
                    }
                    if (o[k] && typeof o[k] === 'object' && o[k] !== null) scan(o[k]);
                }
            };
            scan(req.responseBody);
        }

        // 2. URL Parameter Dependencies (Weak/Logical)
        try {
            const url = new URL(req.url);
            url.searchParams.forEach((val, key) => {
                if (['user', 'repo', 'owner', 'project', 'id', 'uuid', 'org', 'username'].includes(key.toLowerCase()) && (String(val).length > 2)) {
                    if (!sharedParamsMap.has(val)) sharedParamsMap.set(val, []);
                    sharedParamsMap.get(val).push(req);
                }
            });
        } catch (e) { }

        // Match against previous responses
        idMap.forEach((source, val) => {
            if (source !== req && (req.url.includes(String(val)) || (req.requestBody || '').includes(String(val)))) {
                relations.push({ source, target: req, type: 'strong' });
            }
        });
    });

    // Populate relations from shared params if no strong ones exist
    if (relations.length === 0) {
        sharedParamsMap.forEach((reqs, val) => {
            if (reqs.length > 1) {
                for (let i = 0; i < reqs.length - 1; i++) {
                    relations.push({ source: reqs[i], target: reqs[i + 1], type: 'weak' });
                }
            }
        });
    }

    let nodesToRender = [];
    if (relations.length > 0) {
        const relevant = new Set();
        relations.forEach(r => { relevant.add(r.source); relevant.add(r.target); });
        nodesToRender = Array.from(relevant).sort((a, b) => requests.indexOf(a) - requests.indexOf(b));
    } else {
        // Fallback to Chronological Flow if zero dependencies found
        nodesToRender = requests.slice(-12); // Show last 12 for tidiness
        for (let i = 0; i < nodesToRender.length - 1; i++) {
            relations.push({ source: nodesToRender[i], target: nodesToRender[i + 1], type: 'sequence' });
        }
    }

    const nodeElements = new Map();
    nodesToRender.forEach(req => {
        const div = document.createElement('div');
        div.className = 'waterfall-node';
        try {
            const urlObj = new URL(req.url);
            div.innerHTML = `<span class="method-badge method-${req.method.toLowerCase()}">${req.method}</span> <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${urlObj.pathname}</span>`;
        } catch (e) {
            div.innerHTML = `<strong>${req.method}</strong> ${req.url}`;
        }

        div.addEventListener('click', () => selectEndpoint([req], req.url));
        div.addEventListener('mouseenter', () => {
            document.querySelectorAll('.waterfall-node').forEach(n => n.classList.add('dimmed'));
            div.classList.remove('dimmed'); div.classList.add('highlighted');
            document.querySelectorAll('#graph-svg path').forEach(p => {
                if (p.dataset.source === req.url || p.dataset.target === req.url) {
                    p.classList.add('related');
                    const other = p.dataset.source === req.url ? p.dataset.target : p.dataset.source;
                    document.querySelectorAll('.waterfall-node').forEach(n => { if (n.dataset.url === other) n.classList.remove('dimmed'); });
                }
            });
        });
        div.addEventListener('mouseleave', () => {
            document.querySelectorAll('.waterfall-node').forEach(n => { n.classList.remove('dimmed'); n.classList.remove('highlighted'); });
            document.querySelectorAll('#graph-svg path').forEach(p => p.classList.remove('related'));
        });

        div.dataset.url = req.url;
        container.appendChild(div);
        nodeElements.set(req, div);
    });

    setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        relations.forEach(rel => {
            const startNode = nodeElements.get(rel.source), endNode = nodeElements.get(rel.target);
            if (!startNode || !endNode) return;
            const startRect = startNode.getBoundingClientRect(), endRect = endNode.getBoundingClientRect();
            const x1 = (startRect.left + startRect.width / 2) - containerRect.left;
            const y1 = startRect.bottom - containerRect.top;
            const x2 = (endRect.left + endRect.width / 2) - containerRect.left;
            const y2 = endRect.top - containerRect.top;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            const cpY = y1 + (y2 - y1) / 2;
            path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${cpY}, ${x2} ${cpY}, ${x2} ${y2}`);
            if (rel.type === 'weak') path.style.strokeDasharray = "5,5";
            if (rel.type === 'sequence') { path.style.opacity = "0.1"; path.style.stroke = "var(--text-secondary)"; }
            path.dataset.source = rel.source.url; path.dataset.target = rel.target.url;
            svg.appendChild(path);
        });
    }, 100);
}

function renderJSON(obj, container) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'json-viewer';
    const createNode = (key, value, isRoot = false) => {
        const item = document.createElement('div');
        item.className = 'json-item';
        if (value !== null && typeof value === 'object') {
            const details = document.createElement('details');
            if (isRoot) details.open = true;
            const summary = document.createElement('summary');
            summary.innerHTML = `<span class="json-key">${key}:</span> <span class="json-type">${Array.isArray(value) ? 'Array' : 'Object'}</span>`;
            details.appendChild(summary);
            const content = document.createElement('div');
            content.className = 'json-content';
            for (let k in value) content.appendChild(createNode(k, value[k]));
            details.appendChild(content);
            item.appendChild(details);
        } else {
            item.innerHTML = `<span class="json-key">${key}:</span> <span class="json-value">${JSON.stringify(value)}</span>`;
        }
        return item;
    };
    wrapper.appendChild(createNode('Response', obj, true));
    container.appendChild(wrapper);
}

function downloadFile(content, filename, mimeType = 'application/json') {
    const blob = new Blob([content], { type: mimeType });
    const reader = new FileReader();
    reader.onload = () => {
        chrome.downloads.download({ url: reader.result, filename: filename, saveAs: true });
    };
    reader.readAsDataURL(blob);
}

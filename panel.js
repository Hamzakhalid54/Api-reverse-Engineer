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
            // simplify map to reduce tokens
            const apiMap = {};
            Object.keys(groups).forEach(k => {
                const endpoints = new Set();
                groups[k].forEach(req => endpoints.add(`${req.method} ${normalizeEndpoint(new URL(req.url).pathname)}`));
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
                const oldText = e.target.innerText;
                e.target.innerText = "Copied!";
                setTimeout(() => e.target.innerText = oldText, 2000);
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
        renderGraph();
    });

    document.getElementById('mode-tree-btn').addEventListener('click', (e) => {
        graphMode = 'tree';
        e.target.classList.add('active');
        document.getElementById('mode-timeline-btn').classList.remove('active');
        renderGraph();
    });
});

// DevTools Network Listener
if (typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.network) {
    chrome.devtools.network.onRequestFinished.addListener(req => {
        const type = (req._resourceType || '').toLowerCase();

        // Skip obvious static files, but allow scripts to pass through for regex scanning
        if (['image', 'stylesheet', 'font', 'media'].includes(type) && !req.request.url.includes('api')) return;
        if (req.request.method === 'OPTIONS') return; // Skip preflight CORS requests

        // Skip analytics, telemetry, and tracking endpoints
        const urlLower = req.request.url.toLowerCase();
        const ignoreTerms = ['analytics', 'manifest', 'events', 'metrics', 'telemetry', 'log', 'tracking', 'ads', 'pixel', 'heartbeat'];
        if (ignoreTerms.some(term => urlLower.includes(term))) return;

        if (req.response && req.response.content && req.response.content.size > MAX_RESPONSE_SIZE) return;

        req.getContent((content, encoding) => {
            if (!content) return;

            let text = content;
            if (encoding === 'base64') {
                try {
                    text = atob(content);
                } catch (e) { }
            }

            // 1. JS Bundle Scanning
            if (type === 'script') {
                // Look for strings that look like REST paths
                const apiPaths = text.match(/\/api\/[a-zA-Z0-9-_\/]+/g);
                const v1Paths = text.match(/\/v[1-9]\/[a-zA-Z0-9-_\/]+/g);
                if (apiPaths) apiPaths.forEach(p => discoveredJSEndpoints.add(p));
                if (v1Paths) v1Paths.forEach(p => discoveredJSEndpoints.add(p));

                // If this is just a bundle, we scanned it, now exit so it doesn't pollute the main API list
                if (!req.request.url.includes('api')) return;
            }

            // 2. Response Data Extraction Helper
            function extractPathsFromJSON(obj) {
                if (!obj) return;
                if (typeof obj === 'string') {
                    if (obj.startsWith('/') && obj.length > 4 && obj.substring(1).includes('/')) {
                        // Simple heuristic: starts with /, has at least 5 chars, and has at least two slashes total
                        if (!obj.includes(' ') && !obj.includes('<') && !obj.includes('{')) {
                            discoveredResponseEndpoints.add(obj);
                        }
                    }
                    return;
                }
                if (typeof obj === 'object') {
                    for (const key in obj) {
                        extractPathsFromJSON(obj[key]);
                    }
                }
            }

            let parsedBody = null;
            try {
                parsedBody = JSON.parse(text);
                extractPathsFromJSON(parsedBody); // Crawl JSON structure
            } catch (e) { }

            if (parsedBody && typeof parsedBody === 'object') {
                // GraphQL Detection
                let isGraphQL = req.request.url.includes('/graphql');
                let operationName = 'Unknown';
                if (isGraphQL && req.request.postData && req.request.postData.text) {
                    try {
                        const payload = JSON.parse(req.request.postData.text);
                        if (payload.operationName) operationName = payload.operationName;
                    } catch (e) { }
                }

                // Rate Limit Detection
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
            }
        });
    });
}

function addRequest(reqData) {
    requests.push(reqData);
    if (requests.length > MAX_REQUESTS) requests.shift();

    // Update timeline
    const timeline = document.getElementById('timeline-list');
    const li = document.createElement('li');
    let path = reqData.url;
    try {
        path = new URL(reqData.url).pathname;
    } catch (e) { }

    li.innerHTML = `<strong>${reqData.method}</strong> ${path}<span class="time">${reqData.timestamp}</span>`;
    timeline.prepend(li); // newest on top

    updateUI();
}

function updateUI(searchTerm = '') {
    if (requests.length > 0) {
        document.getElementById('empty-state').classList.add('hidden');
    }

    const groups = groupRequestsByPrefix(requests);
    const container = document.getElementById('api-map-container');
    container.innerHTML = '';

    for (const [groupName, groupReqs] of Object.entries(groups)) {
        if (!groupReqs || groupReqs.length === 0) continue;

        // Group-level endpoints map
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

            // Simple search filtering
            if (searchTerm && !key.toLowerCase().includes(searchTerm) && !groupName.toLowerCase().includes(searchTerm)) {
                return; // Skip drawing this item
            }

            // Advanced Filters Logic (AND logic between different types of filters)
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
            ep.innerHTML = `<span class="method-sm ${methodWord.toLowerCase()}">${methodWord}</span> <span>${pathWord}</span>`;

            ep.addEventListener('click', () => {
                document.querySelectorAll('.api-endpoint-item').forEach(el => el.classList.remove('active'));
                ep.classList.add('active');
                // Pass array of all requests belonging to this endpoint to calculate stats
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
    const latestReq = reqsArray[reqsArray.length - 1]; // Use latest for schema and headers
    currentSelected = latestReq;

    document.getElementById('graph-view').classList.add('hidden');
    document.getElementById('endpoint-details').classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('ep-ai-explanation').classList.add('hidden');

    // Title / Header Badges
    document.getElementById('ep-method').innerText = latestReq.isGraphQL ? 'GRAPHQL' : latestReq.method;
    document.getElementById('ep-method').className = `method-badge ${latestReq.method}`;
    let displayUrl = normalizedPath;
    if (latestReq.isGraphQL && latestReq.graphqlOp !== 'Unknown') {
        displayUrl += ` [${latestReq.graphqlOp}]`;
    }
    document.getElementById('ep-url').innerText = displayUrl;

    document.getElementById('ep-auth').innerText = detectAuth(latestReq.headers);
    document.getElementById('ep-pagination').innerText = detectPagination(latestReq.queryString);

    // Calculate Stats
    let totalTime = 0;
    let errors = 0;
    let latestRateLimit = null;
    reqsArray.forEach(r => {
        totalTime += (r.timeMs || 0);
        if (r.status >= 400 || r.status === 0) errors++; // 0 denotes failed requests locally
        if (r.rateLimit) latestRateLimit = r.rateLimit;
    });

    document.getElementById('ep-calls').innerText = reqsArray.length;
    document.getElementById('ep-avg-time').innerText = Math.round(totalTime / reqsArray.length);
    document.getElementById('ep-errors').innerText = errors + (latestRateLimit ? ` | ${latestRateLimit}` : '');

    // Security Scan
    const warnings = scanForSecurityIssues(latestReq, latestReq.responseBody);
    const warningsEl = document.getElementById('ep-warnings');
    warningsEl.innerHTML = '';

    // 4-Pronged Hidden Endpoint Discovery Engine
    const guessesEl = document.getElementById('ep-hidden-guesses');
    guessesEl.innerHTML = '';

    // Helper to create list items
    const createLi = (text, cssColor) => {
        const li = document.createElement('li');
        li.style.cursor = 'pointer';
        li.style.textDecoration = 'underline';
        li.style.color = cssColor;
        li.innerText = `GET ${text}`;
        li.title = "Click to copy";
        li.addEventListener('click', () => navigator.clipboard.writeText(text));
        guessesEl.appendChild(li);
    }

    const pathParts = new URL(latestReq.url).pathname.split('/').filter(p => p && p.length > 0 && !['api', 'v1', 'v2', 'v3', 'graphql'].includes(p.toLowerCase()));
    const lastPart = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null;
    const secondLastPart = pathParts.length > 1 ? pathParts[pathParts.length - 2] : null;

    let foundAny = false;

    // 1. JS Bundle Scanner (High Confidence)
    let jsFound = false;
    discoveredJSEndpoints.forEach(ep => {
        if (lastPart && ep.includes(lastPart)) {
            if (!jsFound) {
                const label = document.createElement('div');
                label.innerHTML = '<strong style="color:var(--method-get)">Detected in JS Bundles [High Confidence]:</strong>';
                label.style.marginTop = '10px';
                label.style.listStyle = 'none';
                label.style.marginLeft = '-20px';
                guessesEl.appendChild(label);
                jsFound = true;
            }
            createLi(ep, 'var(--method-get)');
            foundAny = true;
        }
    });

    // 2. Response Data Extraction (Medium Confidence)
    let respFound = false;
    discoveredResponseEndpoints.forEach(ep => {
        if (lastPart && ep.includes(lastPart)) {
            if (!respFound) {
                const label = document.createElement('div');
                label.innerHTML = '<strong style="color:var(--method-put)">Found in Response Data [Medium Confidence]:</strong>';
                label.style.marginTop = '10px';
                label.style.listStyle = 'none';
                label.style.marginLeft = '-20px';
                guessesEl.appendChild(label);
                respFound = true;
            }
            createLi(ep, 'var(--method-put)');
            foundAny = true;
        }
    });

    // 3. ID Pattern Inference
    const isId = lastPart && (!isNaN(lastPart) || lastPart.length > 15 || lastPart.includes('-'));
    if (isId && secondLastPart) {
        const label = document.createElement('div');
        label.innerHTML = '<strong style="color:var(--text-secondary)">ID Pattern Inference [Educated Guess]:</strong>';
        label.style.marginTop = '10px';
        label.style.listStyle = 'none';
        label.style.marginLeft = '-20px';
        guessesEl.appendChild(label);

        ['/profile', '/settings', '/orders', '/activity', '/permissions'].forEach(sfx => {
            createLi(`.../${secondLastPart}/:id${sfx}`, 'var(--text-secondary)');
        });
        foundAny = true;
    }

    // 4. Pattern Dictionary Extension
    const commonEntities = ['users', 'products', 'orders', 'catalog', 'customers', 'accounts', 'invoices', 'payments', 'settings', 'profile', 'documents', 'files', 'cart', 'checkout', 'items', 'categories', 'articles', 'posts', 'comments', 'graphql'];
    if (lastPart && !isId && lastPart.length > 2 && commonEntities.includes(lastPart.toLowerCase())) {
        const label = document.createElement('div');
        label.innerHTML = '<strong style="color:var(--text-secondary)">Pattern Dictionary [Educated Guess]:</strong>';
        label.style.marginTop = '10px';
        label.style.listStyle = 'none';
        label.style.marginLeft = '-20px';
        guessesEl.appendChild(label);

        const commonSuffixes = ['/admin', '/export', '/stats', '/internal', '/debug', '/health', '/metrics', '/config'];
        commonSuffixes.forEach(sfx => {
            createLi(`.../${lastPart}${sfx}`, 'var(--text-secondary)');
        });
        foundAny = true;
    }

    if (!foundAny) {
        guessesEl.innerHTML = '<li style="color:var(--text-secondary);list-style:none;">No specific predictions for this endpoint structure.</li>';
    }

    if (warnings.length === 0) {
        warningsEl.innerHTML = '<li style="color:var(--success)">No issues detected.</li>';
    } else {
        warnings.forEach(w => {
            const li = document.createElement('li');
            li.innerText = w;
            warningsEl.appendChild(li);
        });
    }

    // Mini Console Preview
    const consoleEl = document.getElementById('ep-mini-console');
    let miniResp = latestReq.responseBody ? JSON.stringify(latestReq.responseBody, null, 2) : '{}';
    document.getElementById('ep-sample-size').innerText = `(${(miniResp.length / 1024).toFixed(1)} KB)`;
    if (miniResp.length > 5000) miniResp = miniResp.substring(0, 5000) + '\n... (truncated)';
    consoleEl.innerHTML = escapeHtml(miniResp);

    // Request Parameters Viewer
    const queryEl = document.getElementById('ep-req-query');
    if (latestReq.queryString && latestReq.queryString.length > 0) {
        let qStr = '';
        latestReq.queryString.forEach(q => qStr += `${q.name} = ${q.value}\n`);
        queryEl.innerText = qStr.trim();
    } else { queryEl.innerText = 'No query parameters'; }

    const headersEl = document.getElementById('ep-req-headers');
    if (latestReq.headers && latestReq.headers.length > 0) {
        let hStr = '';
        latestReq.headers.forEach(h => {
            let val = h.value;
            if (h.name.toLowerCase() === 'authorization') val = 'Bearer ********';
            if (h.name.toLowerCase() === 'cookie') val = '********';
            hStr += `${h.name}: ${val}\n`;
        });
        headersEl.innerText = hStr.trim();
    } else { headersEl.innerText = 'No headers captured'; }

    const bodyEl = document.getElementById('ep-req-body');
    if (latestReq.requestBody) {
        try {
            bodyEl.innerText = JSON.stringify(JSON.parse(latestReq.requestBody), null, 2);
        } catch (e) {
            bodyEl.innerText = latestReq.requestBody;
        }
    } else { bodyEl.innerText = 'No request body'; }

    // Schema & Samples Viewer
    document.getElementById('ep-schema').innerText = parseSchema(latestReq.responseBody, 'Response');
    document.getElementById('ep-db-schema').innerText = inferDatabaseRelations(latestReq.responseBody, new URL(latestReq.url).pathname);

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
            let prettyRes = reqObj.responseBody ? JSON.stringify(reqObj.responseBody, null, 2) : 'No response data';
            document.getElementById('ep-example-res').innerText = prettyRes;
        });
        sampleSelector.appendChild(btn);
    });

    let prettyRes = latestReq.responseBody ? JSON.stringify(latestReq.responseBody, null, 2) : 'No response data';
    document.getElementById('ep-example-res').innerText = prettyRes;

    // Code Generators
    generateCode(latestReq);

    // Replay Request prep
    const headerObj = {};
    latestReq.headers.forEach(h => {
        const hn = h.name.toLowerCase();
        // omit pseudo-headers and headers that browser restricts or handles automatically
        if (
            !hn.startsWith(':') &&
            !['host', 'content-length', 'cookie', 'user-agent', 'accept-encoding', 'origin', 'referer', 'connection'].includes(hn) &&
            !hn.startsWith('sec-') // strip all Sec-Fetch-* and Sec-Ch-* headers
        ) {
            headerObj[h.name] = h.value;
        }
    });
    document.getElementById('replay-headers').value = JSON.stringify(headerObj, null, 2);

    let defaultBody = '';
    if (latestReq.requestBody) {
        try {
            defaultBody = JSON.stringify(JSON.parse(latestReq.requestBody), null, 2);
        } catch (e) {
            defaultBody = latestReq.requestBody;
        }
    }
    document.getElementById('replay-body').value = defaultBody;
    document.getElementById('replay-response').innerText = '';
}

function generateCode(req) {
    const url = req.url;
    const method = req.method;

    // cURL
    let curl = `curl -X ${method} "${url}" \\`;
    req.headers.forEach(h => {
        const hn = h.name.toLowerCase();
        if (!hn.startsWith(':') && !['host', 'content-length', 'cookie', 'accept-encoding'].includes(hn)) {
            curl += `\n  -H "${h.name}: ${h.value.replace(/"/g, '\\"')}" \\`;
        }
    });
    if (req.requestBody) {
        const body = req.requestBody.replace(/'/g, "'\\''");
        curl += `\n  -d '${body}'`;
    }
    curl = curl.replace(/ \\\n$/, '');
    document.getElementById('code-curl').innerText = curl;

    // Axios Scraper
    let axNode = `import axios from 'axios';\n\nconst options = {\n  method: '${method}',\n  url: '${url}',\n  headers: {\n`;
    req.headers.forEach(h => {
        const hn = h.name.toLowerCase();
        if (!hn.startsWith(':') && !['host', 'content-length', 'cookie'].includes(hn)) {
            axNode += `    '${h.name}': '${h.value.replace(/'/g, "\\'")}',\n`;
        }
    });
    axNode += `  }`;
    if (req.requestBody) {
        let bodyJson = req.requestBody;
        try { bodyJson = JSON.stringify(JSON.parse(req.requestBody), null, 4); } catch (e) { }
        axNode += `,\n  data: ${bodyJson}`;
    }
    axNode += `\n};\n\naxios.request(options).then(function (response) {\n  console.log(response.data);\n}).catch(function (error) {\n  console.error(error);\n});`;
    document.getElementById('code-axios').innerText = axNode;

    // Node.js Scraper
    let node = `fetch("${url}", {\n  method: "${method}",\n  headers: {\n`;
    req.headers.forEach(h => {
        const hn = h.name.toLowerCase();
        if (!hn.startsWith(':') && !['host', 'content-length', 'cookie'].includes(hn)) {
            node += `    "${h.name}": "${h.value.replace(/"/g, '\\"')}",\n`;
        }
    });
    node += `  }`;
    if (req.requestBody) {
        let bodyJson = req.requestBody;
        try { bodyJson = JSON.stringify(JSON.parse(req.requestBody), null, 4); } catch (e) { }
        node += `,\n  body: JSON.stringify(${bodyJson})`;
    }
    node += `\n})\n.then(res => res.json())\n.then(data => console.log(data));`;
    document.getElementById('code-node').innerText = node;

    // Python Scraper
    let py = `import requests\n\nurl = "${url}"\n\nheaders = {\n`;
    req.headers.forEach(h => {
        const hn = h.name.toLowerCase();
        if (!hn.startsWith(':') && !['host', 'content-length'].includes(hn)) {
            py += `    "${h.name}": "${h.value.replace(/"/g, '\\"')}",\n`;
        }
    });
    py += `}\n\n`;
    if (req.requestBody) {
        let bodyJson = req.requestBody;
        try { bodyJson = JSON.stringify(JSON.parse(req.requestBody), null, 4); } catch (e) { }
        py += `payload = ${bodyJson}\n\n`;
        if (req.headers.some(h => h.name.toLowerCase() === 'content-type' && h.value.includes('json'))) {
            py += `response = requests.request("${method}", url, json=payload, headers=headers)\n`;
        } else {
            py += `response = requests.request("${method}", url, data=payload, headers=headers)\n`;
        }
    } else {
        py += `response = requests.request("${method}", url, headers=headers)\n`;
    }
    py += `print(response.json())`;
    document.getElementById('code-python').innerText = py;
}

function renderGraph() {
    const container = document.getElementById('graph-nodes-container');
    container.innerHTML = '';

    if (requests.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary);">No relationships to map yet. Capture some traffic!</p>';
        return;
    }

    if (graphMode === 'timeline') {
        renderGraphTimeline(container);
    } else {
        renderGraphTree(container);
    }
}

function renderGraphTimeline(container) {
    container.className = 'waterfall-container';
    container.style = ''; // Reset inline styles from old impl

    // Create 'Page Load' starting block
    const pLoad = document.createElement('div');
    pLoad.className = 'waterfall-node';
    pLoad.style.borderColor = 'var(--accent)';
    pLoad.innerHTML = `<span style="color:var(--text-secondary)">🌐 Page Load / Interaction Trigger</span>`;
    container.appendChild(pLoad);

    requests.forEach(req => {
        const node = document.createElement('div');
        node.className = 'waterfall-node';

        let path = req.url;
        try { path = new URL(req.url).pathname; } catch (e) { }

        node.innerHTML = `<span style="color:var(--method-${req.method.toLowerCase()}); font-weight:bold; margin-right:8px">${req.method}</span> ${path}`;
        container.appendChild(node);
    });
}

function renderGraphTree(container) {
    container.className = 'directory-tree';
    container.style = ''; // Reset inline styles

    const rootMap = new Map();

    requests.forEach(req => {
        let path = req.url;
        try { path = new URL(req.url).pathname; } catch (e) { }

        // Strip ignored utility paths like api, v1
        const parts = path.split('/').filter(p => p && !['api', 'v1', 'v2', 'v3'].includes(p.toLowerCase()));
        if (parts.length === 0) return;

        let rootDir = '/' + parts[0];
        let subPath = parts.length > 1 ? '/' + parts.slice(1).join('/') : '/';

        if (!rootMap.has(rootDir)) rootMap.set(rootDir, new Set());
        rootMap.get(rootDir).add(JSON.stringify({ method: req.method, path: subPath }));
    });

    rootMap.forEach((endpointsSet, rootDir) => {
        const branchContainer = document.createElement('div');
        branchContainer.className = 'tree-branch';

        const rootNode = document.createElement('div');
        rootNode.className = 'dir-root';
        rootNode.innerText = rootDir;
        branchContainer.appendChild(rootNode);

        const endpoints = Array.from(endpointsSet).map(s => JSON.parse(s));

        endpoints.forEach((ep, idx) => {
            const isLast = idx === endpoints.length - 1;
            const prefix = isLast ? '└─' : '├─';

            const epNode = document.createElement('div');
            epNode.className = 'dir-endpoint';

            epNode.innerHTML = `
                <span class="dir-prefix">${prefix}</span>
                <span class="dir-method" style="color:var(--method-${ep.method.toLowerCase()})">${ep.method}</span>
                <span>${ep.path}</span>
            `;
            branchContainer.appendChild(epNode);
        });

        container.appendChild(branchContainer);
    });
}

function downloadFile(content, filename, mimeType = 'application/json') {
    const blob = new Blob([content], { type: mimeType });
    const reader = new FileReader();
    reader.onload = function () {
        const dataUrl = reader.result;
        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: true
        });
    };
    reader.readAsDataURL(blob);
}

// Utility to prevent XSS output in innerHTML for the console
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

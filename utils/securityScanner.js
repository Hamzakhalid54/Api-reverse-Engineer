export function scanForSecurityIssues(requestData, responseBody) {
    const warnings = [];

    // Check for tokens in URL
    const url = requestData.url || '';
    if (url.includes('token=') || url.includes('key=') || url.includes('secret=') || url.includes('password=')) {
        warnings.push("Sensitive token or key exposed in URL parameters.");
    }

    if (responseBody) {
        let bodyStr = typeof responseBody === 'object' ? JSON.stringify(responseBody) : responseBody;

        // 1. Stack Traces & Verbose Errors (Refined to reduce noise)
        // Regex looks for "at FunctionName (file:line:col)" or "at path/to/file.js"
        const stackRegex = /at\s+[a-zA-Z0-9._$]+\s+\(.*\:[0-9]+\:[0-9]+\)|at\s+.*\.[a-z]{2,4}\:[0-9]+/g;
        if (stackRegex.test(bodyStr) || bodyStr.includes('java.lang.') || bodyStr.includes('node_modules')) {
            warnings.push("Possible stack trace exposed in response. (Information Disclosure)");
        }

        // More robust check for error objects
        if (typeof responseBody === 'object') {
            const errorKeys = ['stack', 'traceback', 'exception', 'errorMessage', 'error_stack'];
            // Actually check if the key exists in the object, not just a string match
            const keys = Object.keys(responseBody).map(k => k.toLowerCase());
            const foundKey = errorKeys.find(key => keys.includes(key));
            if (foundKey) {
                warnings.push(`Verbose error details found (Key: "${foundKey}"). Potential internal information exposure.`);
            }
        }

        // 2. PII & Sensitive Data Detection
        const patterns = {
            email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{1,}/g,
            jwt: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g
        };

        if (patterns.email.test(bodyStr) && !bodyStr.includes('@example.com')) {
            warnings.push("PII Detected: Response contains one or more email addresses.");
        }
        if (patterns.jwt.test(bodyStr)) warnings.push("Sensitive Data: Possible JWT (JSON Web Token) detected in response body.");

        let lowerBody = bodyStr.toLowerCase();
        if (lowerBody.includes('"password":') || lowerBody.includes('"secret":') || lowerBody.includes('"private_key":')) {
            warnings.push("Response body contains highly sensitive fields (password, secret, private_key).");
        }
    }

    // 3. Header & Auth Security (Targeted at state-changing methods)
    const headers = requestData.headers || [];
    const lowerHeaders = headers.map(h => ({ name: h.name.toLowerCase(), value: h.value.toLowerCase() }));

    const authHeader = lowerHeaders.find(h => h.name === 'authorization' || h.name === 'x-api-key' || h.name === 'api-key');
    if (!authHeader) {
        const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
        if (stateChangingMethods.includes(requestData.method) && requestData.status === 200) {
            warnings.push("State-changing request lacks standard Authorization headers. Ensure this is intentionally public.");
        }
    }

    // 4. CORS Check
    const corsHeader = lowerHeaders.find(h => h.name === 'access-control-allow-origin');
    if (corsHeader && corsHeader.value === '*') {
        warnings.push("Security Risk: Excessive CORS policy (Access-Control-Allow-Origin: *).");
    }

    return warnings;
}

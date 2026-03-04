export function scanForSecurityIssues(requestData, responseBody) {
    const warnings = [];

    // Check for tokens in URL
    const url = requestData.url || '';
    if (url.includes('token=') || url.includes('key=') || url.includes('secret=') || url.includes('password=')) {
        warnings.push("Sensitive token or key exposed in URL parameters.");
    }

    if (responseBody) {
        let bodyStr = typeof responseBody === 'object' ? JSON.stringify(responseBody) : responseBody;

        if (bodyStr.includes('at ') || bodyStr.includes('Stack trace') || bodyStr.includes('java.lang.') || bodyStr.includes('node_modules')) {
            warnings.push("Possible stack trace exposed in response. (Information Disclosure)");
        }

        // More robust "Real" check for error objects
        if (typeof responseBody === 'object') {
            const errorKeys = ['stack', 'traceback', 'exception', 'errorMessage', 'error_stack'];
            const foundKey = errorKeys.find(key => bodyStr.toLowerCase().includes(`"${key}":`));
            if (foundKey) {
                warnings.push(`Verbose error details found (Key: "${foundKey}"). Potential internal information exposure.`);
            }
        }

        let lowerBody = bodyStr.toLowerCase();
        if (lowerBody.includes('"password":') || lowerBody.includes('"secret":') || lowerBody.includes('"private_key":')) {
            warnings.push("Response body contains potentially sensitive fields (password, secret, private_key).");
        }
    }

    return warnings;
}

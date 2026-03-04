export async function getApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['geminiApiKey'], function (result) {
            resolve(result.geminiApiKey || '');
        });
    });
}

export async function explainEndpoint(endpointData) {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("Gemini API key is not set. Please set it in the settings panel.");

    const reqBodyPreview = endpointData.requestBody ? String(endpointData.requestBody).substring(0, 300) : 'None';
    const resBodyPreview = typeof endpointData.responseBody === 'object' ? JSON.stringify(endpointData.responseBody).substring(0, 300) : 'None';

    const prompt = `
Explain this API endpoint in simple developer terms.
Describe:
1 purpose
2 fields
3 possible use cases
4 security concerns

Data:
Endpoint: ${endpointData.url}
Method: ${endpointData.method}
Example Request Preview: ${reqBodyPreview}
Example Response Preview: ${resBodyPreview}
`;

    return await callGemini(apiKey, prompt);
}

export async function reverseEngineerArchitecture(apiMap) {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("Gemini API key is not set. Please set it in the settings panel.");

    const prompt = `
Explain the overall backend system based on these API endpoints.
What type of platform is this (e.g., E-commerce, Social, SaaS)?
Be extremely concise (3 sentences max).

API Endpoints:
${JSON.stringify(apiMap)}
`;
    return await callGemini(apiKey, prompt);
}

async function callGemini(apiKey, text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text }] }]
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`Gemini API Error: ${response.statusText} - ${errData.error?.message || ''}`);
        }

        const data = await response.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
            return data.candidates[0].content.parts[0].text;
        }
        return "Failed to parse response from AI.";
    } catch (e) {
        throw new Error(`Gemini Connection Error: ${e.message}`);
    }
}

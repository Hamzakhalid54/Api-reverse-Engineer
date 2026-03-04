export function detectAuth(requestHeaders) {
    for (let header of requestHeaders) {
        const name = header.name.toLowerCase();
        const value = header.value;

        if (name === 'authorization') {
            if (value.toLowerCase().startsWith('bearer')) {
                const token = value.split(' ')[1];
                if (token && token.split('.').length === 3) {
                    return 'JWT Bearer Token';
                }
                return 'Bearer Token';
            }
            if (value.toLowerCase().startsWith('basic')) return 'Basic Auth';
            if (value.toLowerCase().startsWith('oauth')) return 'OAuth Token';
            return 'Custom Authorization Header';
        }
        if (name === 'x-api-key' || name === 'apikey' || name === 'api-key') {
            return 'API Key Header';
        }
        if (name === 'cookie') {
            if (value.toLowerCase().includes('session') || value.toLowerCase().includes('sid') || value.toLowerCase().includes('jwt')) {
                return 'Session Cookie';
            }
        }
    }
    return 'None Detected';
}

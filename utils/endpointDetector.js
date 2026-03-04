export function normalizeEndpoint(path) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const objectIdRegex = /^[a-fA-F0-9]{24}$/;
    const numericRegex = /^\d+$/;

    return path.split('/').map(segment => {
        if (uuidRegex.test(segment) || objectIdRegex.test(segment) || numericRegex.test(segment)) {
            return ':id';
        }
        return segment;
    }).join('/') || '/';
}

export function groupRequestsByPrefix(requests) {
    const groups = {};
    requests.forEach(req => {
        try {
            const url = new URL(req.url);
            const normalized = normalizeEndpoint(url.pathname);

            // Extract the first meaningful path segment as group prefix (e.g. /api/users -> Users)
            const segments = normalized.split('/').filter(s => s);
            let prefix = 'General';

            if (segments.length > 0) {
                // Ignore general prefixes if possible
                prefix = segments[0];
                if ((prefix.toLowerCase() === 'api' || prefix.toLowerCase() === 'v1') && segments.length > 1) {
                    prefix = segments[1];
                }
                // capitalize
                prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
            }

            if (!groups[prefix]) {
                groups[prefix] = [];
            }
            groups[prefix].push(req);
        } catch (e) {
            console.error("Failed to parse URL for grouping", e);
        }
    });
    return groups;
}

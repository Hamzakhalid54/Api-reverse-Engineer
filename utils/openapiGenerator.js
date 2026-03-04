export function generateOpenAPI(groups) {
    const spec = {
        openapi: "3.0.0",
        info: {
            title: "Reconstructed API",
            version: "1.0.0"
        },
        paths: {}
    };

    for (const [groupName, requests] of Object.entries(groups)) {
        requests.forEach(req => {
            if (!req || !req.url) return;
            const urlObj = new URL(req.url);
            let path = urlObj.pathname.replace(/:id/g, '{id}');
            // Find paths with parameter-like segments and normalize them
            // In a deeper implementation, we would extract regex matches

            if (!spec.paths[path]) spec.paths[path] = {};
            const method = (req.method || 'GET').toLowerCase();

            spec.paths[path][method] = {
                summary: `${req.method || 'GET'} ${path}`,
                tags: [groupName],
                responses: {
                    "200": {
                        description: "Successful response"
                    }
                }
            };
        });
    }

    return JSON.stringify(spec, null, 2);
}

export function generatePostmanCollection(groups) {
    const collection = {
        info: {
            name: "Reconstructed API",
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        item: []
    };

    for (const [groupName, requests] of Object.entries(groups)) {
        const folder = {
            name: groupName,
            item: requests.filter(req => req && req.url).map(req => {
                const urlObj = new URL(req.url);
                return {
                    name: `${req.method} ${urlObj.pathname}`,
                    request: {
                        method: req.method,
                        header: (req.headers || []).map(h => ({ key: h.name, value: h.value })),
                        url: {
                            raw: req.url,
                            protocol: urlObj.protocol.replace(':', ''),
                            host: urlObj.hostname.split('.'),
                            path: urlObj.pathname.split('/').filter(Boolean),
                            query: (req.queryString || []).map(q => ({ key: q.name, value: q.value }))
                        }
                    }
                };
            })
        };
        collection.item.push(folder);
    }

    return JSON.stringify(collection, null, 2);
}

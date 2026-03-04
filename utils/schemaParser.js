export function parseSchema(jsonStr, rootName = 'Root') {
    let json;
    try {
        json = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch (e) {
        return 'Invalid JSON';
    }

    function getType(value, depth = 1) {
        const indent = '  '.repeat(depth);
        if (value === null) return 'null';
        if (typeof value !== 'object') return typeof value;

        if (Array.isArray(value)) {
            if (value.length === 0) return 'any[]';
            const sample = value[0];
            if (typeof sample === 'object' && sample !== null) {
                return `{\n${Object.entries(sample).map(([k, v]) => `${indent}  ${k}: ${getType(v, depth + 1)}`).join('\n')}\n${indent}}[]`;
            }
            return `${typeof sample}[]`;
        }

        // Object
        let str = `{\n`;
        for (const [k, v] of Object.entries(value)) {
            str += `${indent}${k}: ${getType(v, depth + 1)}\n`;
        }
        str += `${'  '.repeat(depth - 1)}}`;
        return str;
    }

    if (Array.isArray(json)) {
        if (json.length === 0) return `${rootName} []`;
        return `${rootName} ${getType(json, 1)}`;
    }

    let schema = `${rootName} {\n`;
    if (typeof json === 'object' && json !== null) {
        for (const [k, v] of Object.entries(json)) {
            schema += `  ${k}: ${getType(v, 2)}\n`;
        }
    }
    schema += '}';
    return schema;
}

export function inferDatabaseRelations(jsonStr, endpointPath) {
    let json;
    try {
        json = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch (e) {
        return 'No relational data detected';
    }

    if (!json || typeof json !== 'object') return 'No relational data detected';

    let sample = Array.isArray(json) ? json[0] : json;
    if (!sample || typeof sample !== 'object') return 'No relational data detected';

    // Deep unwrap for REST "data" wrappers or GraphQL queries
    if (sample.data && typeof sample.data === 'object') {
        if (Array.isArray(sample.data) && sample.data.length > 0) {
            sample = sample.data[0];
        } else if (!Array.isArray(sample.data)) {
            const keys = Object.keys(sample.data);
            if (keys.length === 1 && typeof sample.data[keys[0]] === 'object' && sample.data[keys[0]] !== null) {
                sample = sample.data[keys[0]];
                if (Array.isArray(sample) && sample.length > 0) sample = sample[0];
            } else {
                sample = sample.data;
            }
        }
    }

    const pathParts = endpointPath.split('/').filter(p => isNaN(p) && p.length > 2 && !['api', 'v1', 'v2', 'v3', 'graphql'].includes(p.toLowerCase()));
    let primaryTable = pathParts[pathParts.length - 1] || 'root_table';
    if (!primaryTable.endsWith('s')) primaryTable += 's';

    let columns = [];
    let relationships = [];

    for (const key of Object.keys(sample)) {
        columns.push(key);
        if (key.toLowerCase().endsWith('_id') && key.toLowerCase() !== 'id') {
            const foreignTable = key.toLowerCase().replace('_id', '') + 's';
            relationships.push(`${primaryTable}.${key} → ${foreignTable}.id`);
        }
    }

    if (relationships.length === 0 && columns.length < 2) {
        return 'No clear relational schema inferred.\n(Tip: Ensure the response contains objects with _id fields)';
    }

    let output = `Table: ${primaryTable}\n\ncolumns:\n`;
    columns.forEach(c => output += `  ${c}\n`);

    if (relationships.length > 0) {
        output += `\nrelationships:\n`;
        relationships.forEach(r => output += `  ${r}\n`);
    } else {
        output += `\nrelationships:\n  None detected.\n`;
    }

    return output;
}

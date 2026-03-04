export function detectPagination(queryStringParams = []) {
    const paginationKeys = ['page', 'offset', 'limit', 'cursor', 'next', 'per_page', 'size', 'count'];
    const detected = [];

    for (let param of queryStringParams) {
        const key = param.name.toLowerCase();
        if (paginationKeys.some(pK => key.includes(pK))) {
            detected.push(`${param.name}=${param.value}`);
        }
    }

    return detected.length > 0 ? detected.join(', ') : 'None Detected';
}

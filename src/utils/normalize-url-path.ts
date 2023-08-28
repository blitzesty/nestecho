export const normalizeUrlPath = (path: string) => {
    if (!path || typeof path !== 'string') {
        return '';
    }

    const normalizedPath = path
        .replace(/\/\/+/g, '/')
        .replace(/\/$/g, '');

    if (!normalizedPath.startsWith('/')) {
        return '/' + normalizedPath;
    }

    return normalizedPath;
};


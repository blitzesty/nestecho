import { parse } from '@babel/parser';

export function parseAst(content) {
    return parse(content, {
        sourceType: 'module',
        plugins: [
            'jsx',
            'typescript',
            'decorators-legacy',
            'dynamicImport',
            'throwExpressions',
            'objectRestSpread',
            'optionalChaining',
            'classPrivateMethods',
            'classPrivateProperties',
            'classProperties',
            'classStaticBlock',
            'exportDefaultFrom',
            'exportNamespaceFrom',
        ],
    });
};

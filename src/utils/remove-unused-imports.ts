import { ParseResult } from '@babel/parser';
import { File } from '@babel/types';
import traverse from '@babel/traverse';

export const removeUnusedImports = (ast: ParseResult<File>) => {
    const allIdentifierNames: string[] = [];

    traverse(ast, {
        Identifier(nodePath1) {
            if (![
                'ImportSpecifier',
                'ImportDefaultSpecifier',
                'ImportNamespaceSpecifier',
            ].includes(nodePath1?.parentPath?.node?.type)) {
                allIdentifierNames.push(nodePath1?.node?.name);
            }
        },
    });

    traverse(ast, {
        ImportDeclaration(nodePath1) {
            nodePath1.node.specifiers = Array.from(nodePath1?.node?.specifiers || []).filter((specifier) => {
                return allIdentifierNames.includes(specifier.local.name);
            });

            if (!nodePath1?.node?.specifiers?.length) {
                return nodePath1.remove();
            }
        },
    });
};

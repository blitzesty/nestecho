import * as fs from 'fs-extra';
import * as path from 'path';
import traverse from '@babel/traverse';
import {
    ParseResult,
    parse,
} from '@babel/parser';
import generate from '@babel/generator';
import * as _ from 'lodash';
import {
    ClassDeclaration,
    File,
    ImportDeclaration,
    StringLiteral,
    classProperty,
    identifier,
    stringLiteral,
} from '@babel/types';

export const parseAst = (content) => {
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

// const findClassBodyPath = (nodePath: any) => {
//     if (!nodePath) {
//         return null;
//     }
//     if (nodePath?.node?.type === 'ClassDeclaration') {
//         return nodePath;
//     } else {
//         return findClassBodyPath(nodePath?.parentPath);
//     }
// };

interface ImportItem {
    imported: string;
    local: string;
    source: string;
    type: 'ImportSpecifier' | 'ImportNamespaceSpecifier' | 'ImportDefaultSpecifier';
}

const getImports = (ast: ParseResult<File>) => {
    const importDeclarations: ImportDeclaration[] = (ast?.program?.body || [])?.filter((declaration) => declaration.type === 'ImportDeclaration') as ImportDeclaration[];
    const importItems = importDeclarations.reduce((result: ImportItem[], importDeclaration) => {
        const sourceValue = importDeclaration?.source?.value;
        const currentImportItems: ImportItem[] = importDeclaration.specifiers?.map((specifier) => {
            let imported: string;
            const local = specifier.local.name;

            switch (specifier.type) {
                case 'ImportNamespaceSpecifier':
                case 'ImportDefaultSpecifier': {
                    imported = specifier.local.name;
                    break;
                }
                case 'ImportSpecifier': {
                    if (specifier.imported.type === 'Identifier') {
                        imported = specifier.imported.name;
                    }
                    break;
                }
                default:
                    break;
            }

            if (!imported) {
                return null;
            }

            return {
                source: sourceValue,
                type: specifier.type,
                imported,
                local,
            };
        }).filter((item) => !!item);

        return result.concat(currentImportItems);
    }, [] as ImportItem[]);
    return importItems;
};

type ApiControllerType = 'none' | 'admin' | 'open';

interface ApiController {
    type: ApiControllerType;
    path: string;
}

type ApiControllerTypeMap = Record<string, ApiControllerType>;

const getControllerType = (importItems: ImportItem[], classDeclaration: ClassDeclaration) => {
    let result: ApiController;
    const decorators = classDeclaration?.decorators;

    if (
        !Array.isArray(decorators) ||
        !decorators.length ||
        !Array.isArray(importItems) ||
        !importItems.length
    ) {
        return null;
    }

    const apiControllerTypeMap = ([
        {
            type: 'none',
            name: 'Controller',
            source: '@nestjs/common',
        },
        {
            type: 'admin',
            name: 'AdminApiController',
        },
        {
            type: 'open',
            name: 'ApiController',
        },
    ] as Array<{
        type: ApiControllerType;
        name: string;
        source: string;
    }>).reduce((result, currentItem) => {
        const localName = importItems.find((importItem) => importItem.imported === currentItem.name)?.local;

        if (!localName) {
            return result;
        }

        result[localName] = currentItem.type;

        return result;
    }, {} as ApiControllerTypeMap);

    for (const decorator of decorators) {
        if (
            decorator.expression.type !== 'CallExpression' ||
            decorator.expression.callee.type !== 'Identifier' ||
            !Object.keys(apiControllerTypeMap).includes(decorator.expression.callee.name) || (
                decorator.expression.arguments?.[0] &&
                decorator.expression.arguments?.[0]?.type !== 'StringLiteral'
            )
        ) {
            continue;
        }

        const calleeName = decorator.expression.callee.name;
        const type = apiControllerTypeMap[calleeName];

        if (!type) {
            continue;
        }

        result = {
            type,
            path: (decorator.expression.arguments?.[0] as StringLiteral)?.value ?? null,
        };
    }

    return result;
};

const transformCode = () => {
    const originalAst = parseAst(fs.readFileSync(path.resolve('/root/workspace/matrindex-api/src/subscription/subscription.controller.ts'), 'utf-8'));
    const ast = _.cloneDeep(originalAst);
    const importItems = getImports(ast);
    const authGuardIdentifier = importItems.find((importItem) => {
        return importItem.type === 'ImportSpecifier' && importItem.imported === 'AuthGuard' && importItem.source === '@nestjs/passport';
    })?.local;
    const useGuardsIdentifier = importItems.find((importItem) => {
        return importItem.type === 'ImportSpecifier' && importItem.imported === 'UseGuards' && importItem.source === '@nestjs/common';
    })?.local;
    let globalApiKeyAuthEnabled = false;

    if (authGuardIdentifier) {
        traverse(ast, {
            Identifier(nodePath) {
                if (
                    nodePath.node.name === authGuardIdentifier &&
                    nodePath?.parentPath?.node?.type === 'CallExpression' &&
                    nodePath?.parentPath?.parentPath?.node?.type === 'CallExpression' &&
                    nodePath?.parentPath?.parentPath?.node?.callee?.type === 'Identifier' &&
                    nodePath?.parentPath?.parentPath?.node?.callee?.name === useGuardsIdentifier &&
                    nodePath?.parentPath?.parentPath?.parentPath?.node?.type === 'Decorator' &&
                    nodePath?.parentPath?.parentPath?.node?.arguments?.length > 0
                ) {
                    traverse(
                        nodePath?.parentPath?.node?.arguments?.[0],
                        {
                            StringLiteral(stringLiteralNodePath) {
                                if (stringLiteralNodePath?.node?.value === 'api-key') {
                                    globalApiKeyAuthEnabled = true;
                                }
                            },
                        },
                        nodePath?.parentPath?.scope,
                    );
                }
            },
        });
    }

    console.log('LENCONDA:', globalApiKeyAuthEnabled);

    traverse(ast, {
        Identifier(nodePath) {
            if (nodePath?.node?.name?.endsWith('DTO') && nodePath?.parent?.type !== 'ImportSpecifier') {
                nodePath.node.name = `PartialDeep<${nodePath.node.name}>`;
            }
        },
        ImportDeclaration(nodePath) {
            if (nodePath?.node?.source?.value?.startsWith('@matrindex/build-essential')) {
                nodePath.node.source.value = nodePath.node.source.value.replace(/^\@matrindex\/build-essential/g, '@mtrxjs/basics');
            }
        },
        ClassDeclaration(nodePath) {
            const apiController = getControllerType(importItems, nodePath?.node) || {
                type: null,
                path: '/',
            };
            const basePathnamePropertyExpression = classProperty(identifier('basePathname'), stringLiteral(apiController.path));

            basePathnamePropertyExpression.accessibility = 'protected';
            (nodePath?.node as ClassDeclaration).body.body.unshift(basePathnamePropertyExpression);

            traverse(
                nodePath.node,
                {
                    ClassMethod(nodePath) {
                        if (nodePath?.node?.kind === 'constructor' && typeof nodePath?.remove === 'function') {
                            nodePath.remove();
                        }
                    },
                },
                nodePath.scope,
            );
        },
    });

    return generate(ast)?.code;
};

console.log(transformCode());

import * as fs from 'fs-extra';
import * as path from 'path';
import traverse, {
    NodePath,
    Scope,
} from '@babel/traverse';
import {
    ParseResult,
    parse,
} from '@babel/parser';
import generate from '@babel/generator';
import * as _ from 'lodash';
import {
    ClassDeclaration,
    Decorator,
    File,
    Identifier,
    ImportDeclaration,
    Statement,
    StringLiteral,
    blockStatement,
    classProperty,
    identifier,
    stringLiteral,
} from '@babel/types';
import template from '@babel/template';

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

export const isDtoInReturnType = (nodePath: NodePath) => {
    if (!nodePath) {
        return false;
    }

    const getAnnotationNodePath = (nodePath: NodePath): NodePath => {
        if (!nodePath) {
            return null;
        }

        if (nodePath?.node?.type === 'TSTypeAnnotation') {
            return nodePath;
        }

        return getAnnotationNodePath(nodePath?.parentPath);
    };

    const annotationNodePath = getAnnotationNodePath(nodePath);

    if (!annotationNodePath) {
        return false;
    }

    return annotationNodePath?.parentPath?.node?.type === 'ClassMethod';
};

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

type ApiRequestMappingType = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
interface ApiRequestMapping {
    type: ApiRequestMappingType;
    path: string;
}

const getApiRequestMappingType = (importItems: ImportItem[], decorators: Decorator[]) => {
    let result: ApiRequestMapping;

    if (
        !Array.isArray(decorators) ||
        !decorators.length ||
        !Array.isArray(importItems) ||
        !importItems.length
    ) {
        return null;
    }

    const restfulMethods = [
        'Get',
        'Post',
        'Put',
        'Patch',
        'Delete',
    ];
    const requestMappingDecoratorMap = restfulMethods.reduce((result, currentRestfulMethod) => {
        const localName = importItems.find((importItem) => {
            return importItem.imported === currentRestfulMethod && importItem.source === '@nestjs/common';
        })?.local;

        if (localName) {
            result[localName] = currentRestfulMethod;
        }

        return result;
    }, {} as Record<string, string>);

    for (const decorator of decorators) {
        if (
            decorator.expression.type !== 'CallExpression' ||
            decorator.expression.callee.type !== 'Identifier' ||
            !Object.keys(requestMappingDecoratorMap).includes(decorator.expression.callee.name) || (
                decorator.expression.arguments?.[0] &&
                decorator.expression.arguments?.[0]?.type !== 'StringLiteral'
            )
        ) {
            continue;
        }

        const calleeName = decorator.expression.callee.name;
        const type = requestMappingDecoratorMap[calleeName].toUpperCase() as ApiRequestMappingType;

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

interface TransformCodeOptions {
    version: string;
}

const checkApiKeyEnabled = (
    importItems: ImportItem[],
    decoratorExpressions: Decorator[],
    scope?: Scope,
) => {
    if (!Array.isArray(decoratorExpressions) || !decoratorExpressions.length) {
        return false;
    }

    const authGuardIdentifier = importItems.find((importItem) => {
        return importItem.type === 'ImportSpecifier' && importItem.imported === 'AuthGuard' && importItem.source === '@nestjs/passport';
    })?.local;
    const useGuardsIdentifier = importItems.find((importItem) => {
        return importItem.type === 'ImportSpecifier' && importItem.imported === 'UseGuards' && importItem.source === '@nestjs/common';
    })?.local;
    let apiKeyEnabled = false;

    if (!authGuardIdentifier || !useGuardsIdentifier) {
        return false;
    }

    for (const decoratorExpression of decoratorExpressions) {
        traverse(
            decoratorExpression,
            {
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
                                        apiKeyEnabled = true;
                                    }
                                },
                            },
                            nodePath?.parentPath?.scope,
                        );
                    }
                },
            },
            scope,
        );
    }

    return apiKeyEnabled;
};

const transformCode = (options: TransformCodeOptions) => {
    const originalAst = parseAst(fs.readFileSync(path.resolve('/root/workspace/matrindex-api/src/subscription/subscription.controller.ts'), 'utf-8'));
    const ast = _.cloneDeep(originalAst);
    const importItems = getImports(ast);

    // console.log('LENCONDA:', globalApiKeyAuthEnabled);

    traverse(ast, {
        ClassDeclaration(nodePath1) {
            const controllerApiKeyEnabled = checkApiKeyEnabled(
                importItems,
                nodePath1?.node?.decorators,
                nodePath1.scope,
            );
            const apiController = getControllerType(importItems, nodePath1?.node) || {
                type: null,
                path: '/',
            };
            let pathPrefix = '';

            switch (apiController.type) {
                case 'admin':
                    pathPrefix = '/admin_api';
                    break;
                case 'open':
                    pathPrefix = '/api';
                    break;
                default:
                    break;
            }

            const basePathnamePropertyExpression = classProperty(identifier('basePathname'), stringLiteral(pathPrefix + `/v${options.version ?? 1}` + apiController.path));

            basePathnamePropertyExpression.accessibility = 'protected';
            (nodePath1?.node as ClassDeclaration).body.body.unshift(basePathnamePropertyExpression);

            traverse(
                nodePath1.node,
                {
                    Identifier(nodePath2) {
                        if (
                            nodePath2?.node?.name?.endsWith('DTO') &&
                            nodePath2?.parentPath?.node?.type !== 'ImportSpecifier' &&
                            !isDtoInReturnType(nodePath2)
                        ) {
                            nodePath2.node.name = `PartialDeep<${nodePath2.node.name}>`;
                        }
                    },
                    ImportDeclaration(nodePath2) {
                        if (nodePath2?.node?.source?.value?.startsWith('@matrindex/build-essential')) {
                            nodePath2.node.source.value = nodePath2.node.source.value.replace(/^\@matrindex\/build-essential/g, '@mtrxjs/basics');
                        }
                    },
                    ClassMethod(nodePath2) {
                        if (nodePath2?.node?.kind === 'constructor') {
                            nodePath2.remove();
                            return;
                        }

                        if (!controllerApiKeyEnabled) {
                            const methodApiKeyEnabled = checkApiKeyEnabled(importItems, nodePath2?.node?.decorators, nodePath2?.scope);

                            if (!methodApiKeyEnabled) {
                                nodePath2.remove();
                                return;
                            }
                        }

                        const apiRequestMapping = getApiRequestMappingType(importItems, nodePath2?.node?.decorators);

                        if (!apiRequestMapping) {
                            nodePath2.remove();
                            return;
                        }

                        const newBody = template.ast(
                            `
                                const currentMethodPath = this.basePathname + '${apiRequestMapping.path ?? ''}';
                                const customSerializer = Reflect.getMetadata(CUSTOM_DESERIALIZER, ${(nodePath2?.node?.key as Identifier)?.name});
                                return;
                            `,
                        );

                        nodePath2.node.body = blockStatement(Array.isArray(newBody) ? newBody : [newBody]);
                    },
                },
                nodePath1.scope,
            );
        },
    });

    ast.program.body.unshift(template.ast('import \'reflect-metadata\';') as Statement);
    ast.program.body.unshift(template.ast('import { CUSTOM_DESERIALIZER } from \'@mtrxjs/basics/dist/common/common.constant\';') as Statement);

    return generate(ast)?.code;
};

console.log(transformCode({
    version: '1',
}));

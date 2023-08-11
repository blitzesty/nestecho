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
    TSTypeAnnotation,
    blockStatement,
    classProperty,
    identifier,
    stringLiteral,
    tsPropertySignature,
    tsTypeAnnotation,
    tsTypeLiteral,
    tsTypeParameterInstantiation,
} from '@babel/types';
import template from '@babel/template';
import { ESLint } from 'eslint';
import { cosmiconfigSync } from 'cosmiconfig';

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

    return (
        annotationNodePath?.parentPath?.node?.type === 'ClassMethod' || (
            nodePath?.parentPath?.node?.type === 'TSTypeParameterInstantiation' &&
            nodePath?.parentPath?.parentPath?.node?.type === 'TSTypeReference' &&
            nodePath?.parentPath?.parentPath?.node?.typeName?.type === 'Identifier' &&
            nodePath?.parentPath?.parentPath?.node?.typeName?.name === 'PartialDeep'
        )
    );
};

export type LinterPlugin = (code: string, fromPath: string) => Promise<string>;
export interface LinterOptions extends ESLint.Options {
    prePlugins?: LinterPlugin[];
    postPlugins?: LinterPlugin[];
}

export const lintCode = async (
    code: string,
    options: LinterOptions = {},
): Promise<string> => {
    const {
        cwd: userSpecifiedCwd,
        prePlugins = [],
        postPlugins = [],
        overrideConfig = {},
        ...otherESLintConfig
    } = options;
    let eslintConfigFilePath = userSpecifiedCwd;

    if (!eslintConfigFilePath) {
        const eslintConfigPaths = [
            path.resolve(__dirname, '../.eslintrc.js'),
        ];
        const currentProjectESLintConfig = cosmiconfigSync('eslint').search();
        eslintConfigFilePath = currentProjectESLintConfig?.filepath
            ? currentProjectESLintConfig.filepath
            : eslintConfigPaths.find((pathname) => fs.existsSync(pathname));
    }

    if (!eslintConfigFilePath) {
        return code;
    }

    const eslint = new ESLint({
        ...otherESLintConfig,
        allowInlineConfig: true,
        cwd: path.dirname(eslintConfigFilePath),
        overrideConfig: _.merge({}, {
            rules: {
                'array-element-newline': ['error', {
                    'multiline': true,
                    'minItems': 2,
                }],
                'array-bracket-newline': ['error', {
                    'multiline': true,
                    'minItems': 2,
                }],
                'object-curly-newline': ['error', {
                    'ObjectExpression': 'always',
                    'ObjectPattern': 'always',
                    'ImportDeclaration': {
                        'multiline': true,
                        'minProperties': 2,
                    },
                    'ExportDeclaration': {
                        'multiline': true,
                        'minProperties': 2,
                    },
                }],
                'object-curly-spacing': ['error', 'always'],
                'object-property-newline': ['error', { allowAllPropertiesOnSameLine: false }],
                'no-undef': 'off',
                'no-unused-vars': 'off', // or "@typescript-eslint/no-unused-vars": "off",
                'unused-imports/no-unused-imports': 'error',
                'unused-imports/no-unused-vars': [
                    'warn',
                    {
                        'vars': 'all',
                        'varsIgnorePattern': '^_',
                        'args': 'after-used',
                        'argsIgnorePattern': '^_',
                    },
                ],
            },
        }, overrideConfig),
        fix: true,
    });
    let rawCode: string = code;

    for (const prePlugin of prePlugins) {
        rawCode = await prePlugin(rawCode, eslintConfigFilePath);
    }

    rawCode = _.get(await eslint.lintText(rawCode), '[0].output') as string || rawCode;

    for (const postPlugin of postPlugins) {
        rawCode = await postPlugin(rawCode, eslintConfigFilePath);
    }

    return rawCode;
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
    decoratorWhiteList?: string[];
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

interface ApiMethodOptionsDescriptorValue {
    annotation: TSTypeAnnotation;
    transferIdentifier?: string;
    required?: boolean;
}

interface ApiMethodOptionsDescriptorItem {
    [identifier: string]: ApiMethodOptionsDescriptorValue;
}

interface ApiMethodOptionsDescriptor {
    body: ApiMethodOptionsDescriptorItem;
    param: ApiMethodOptionsDescriptorItem;
    query: ApiMethodOptionsDescriptorItem;
}

const transformCode = async (options: TransformCodeOptions) => {
    const originalAst = parseAst(fs.readFileSync(path.resolve('/root/workspace/matrindex-api/src/subscription/subscription.controller.ts'), 'utf-8'));
    const ast = _.cloneDeep(originalAst);
    const importItems = getImports(ast);
    const paramDecoratorMap = [
        'Body',
        'Query',
        'Param',
    ].reduce((result, currentRestfulMethod) => {
        const localName = importItems.find((importItem) => {
            return importItem.imported === currentRestfulMethod && importItem.source === '@nestjs/common';
        })?.local;

        if (localName) {
            result[localName] = currentRestfulMethod;
        }

        return result;
    }, {} as Record<string, string>);

    // console.log('LENCONDA:', globalApiKeyAuthEnabled);

    traverse(ast, {
        ImportDeclaration(nodePath2) {
            if (nodePath2?.node?.source?.value?.startsWith('@matrindex/build-essential')) {
                nodePath2.node.source.value = nodePath2.node.source.value.replace(/^\@matrindex\/build-essential/g, '@mtrxjs/basics');
            }
        },
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

                        const options: ApiMethodOptionsDescriptor = (nodePath2.node.params || []).reduce(
                            (result, param) => {
                                let type: 'body' | 'query' | 'param';
                                let transferIdentifier: string;
                                let identifier: string;
                                let annotation: TSTypeAnnotation;
                                let required = true;

                                for (const paramDecorator of (param?.decorators || [])) {
                                    if (paramDecorator.expression?.type === 'CallExpression' && paramDecorator.expression?.callee?.type === 'Identifier') {
                                        const decoratorType = paramDecoratorMap[paramDecorator.expression?.callee.name];

                                        if (!decoratorType) {
                                            continue;
                                        }

                                        switch (decoratorType) {
                                            case 'Body': {
                                                type = 'body';
                                                break;
                                            }
                                            case 'Param': {
                                                type = 'param';
                                                break;
                                            }
                                            case 'Query': {
                                                type = 'query';
                                                break;
                                            }
                                            default:
                                                break;
                                        }

                                        transferIdentifier = (paramDecorator.expression.arguments?.[0] as StringLiteral)?.value;
                                    }
                                }

                                switch (param.type) {
                                    case 'Identifier':
                                        identifier = param.name;
                                        if (param.typeAnnotation?.type === 'TSTypeAnnotation') {
                                            annotation = param.typeAnnotation;
                                        }
                                        break;
                                    case 'AssignmentPattern':
                                        if (param.left.type === 'Identifier') {
                                            identifier = param.left.name;
                                            if (param?.left?.typeAnnotation?.type === 'TSTypeAnnotation') {
                                                annotation = param.left.typeAnnotation;
                                            }
                                            required = false;
                                        }
                                        break;
                                    default:
                                        break;
                                }

                                if (!type || (type !== 'body' && !transferIdentifier) || !identifier) {
                                    return result;
                                }

                                result[type][identifier] = {
                                    annotation,
                                    transferIdentifier,
                                    required,
                                };

                                return result;
                            },
                            {
                                body: {},
                                query: {},
                                param: {},
                            } as ApiMethodOptionsDescriptor,
                        );

                        const bodyOptions = (
                            [
                                'body',
                                'param',
                                'query',
                            ] as Array<keyof ApiMethodOptionsDescriptor>
                        ).reduce((descriptor, currentType) => {
                            descriptor[currentType] = Object.keys(options?.[currentType]).reduce((result, currentIdentifier) => {
                                result[currentIdentifier] = options?.[currentType]?.[currentIdentifier]?.transferIdentifier ?? null;
                                return result;
                            }, {});
                            return descriptor;
                        }, {});
                        const newBody = template.ast(
                            `
                                const currentMethodPath = this.basePathname + '${apiRequestMapping.path ?? ''}';
                                const customSerializer = Reflect.getMetadata(CUSTOM_DESERIALIZER, this.${(nodePath2?.node?.key as Identifier)?.name});
                                const optionsMap = ${JSON.stringify(bodyOptions)};
                                return;
                            `,
                        );

                        nodePath2.node.body = blockStatement(Array.isArray(newBody) ? newBody : [newBody]);

                        const optionsIdentifier = identifier('options');

                        optionsIdentifier.optional = true;
                        optionsIdentifier.typeAnnotation = tsTypeAnnotation(
                            tsTypeLiteral(
                                Object
                                    .entries(
                                        _.merge(
                                            {},
                                            _.cloneDeep(options.body),
                                            _.cloneDeep(options.param),
                                            _.cloneDeep(options.query),
                                        ),
                                    )
                                    .map(([identifierValue, value]) => {
                                        const {
                                            required,
                                            annotation,
                                        } = value ?? {};
                                        const currentIdentifier = identifier(identifierValue);
                                        const signature = tsPropertySignature(
                                            currentIdentifier,
                                            annotation,
                                        );

                                        signature.optional = !required;

                                        return signature;
                                    }),
                            ),
                        );
                        nodePath2.node.params = [optionsIdentifier];
                    },
                },
                nodePath1.scope,
            );

            traverse(
                nodePath1.node,
                {
                    TSTypeReference(nodePath2) {
                        if (
                            nodePath2?.node?.typeName?.type === 'Identifier' &&
                            nodePath2?.node?.typeName?.name?.endsWith('DTO') &&
                            !isDtoInReturnType(nodePath2)
                        ) {
                            nodePath2.node.typeParameters = tsTypeParameterInstantiation([
                                _.clone(nodePath2.node),
                            ]);
                            nodePath2.node.typeName = identifier('PartialDeep');
                        }
                    },
                    Decorator(nodePath2) {
                        let decoratorName: string;

                        if (nodePath2?.node?.expression?.type === 'CallExpression' && nodePath2?.node?.expression?.callee?.type === 'Identifier') {
                            decoratorName = nodePath2.node.expression.callee.name;
                        } else if (nodePath2?.node?.expression?.type === 'Identifier') {
                            decoratorName = nodePath2.node.expression.name;
                        }

                        if (
                            !Array.isArray(options.decoratorWhiteList) ||
                            !options.decoratorWhiteList.length ||
                            !options.decoratorWhiteList.includes(decoratorName)
                        ) {
                            nodePath2.remove();
                            return;
                        }
                    },
                },
                nodePath1.scope,
            );

            ast.program.body.unshift(template.ast('import { PartialDeep } from \'@mtrxjs/basics/dist/common/common.interface\';') as Statement);
            ast.program.body.unshift(template.ast('import { CUSTOM_DESERIALIZER } from \'@mtrxjs/basics/dist/common/common.constant\';') as Statement);
            ast.program.body.unshift(template.ast('import \'reflect-metadata\';') as Statement);
        },
    });

    return await lintCode(generate(ast)?.code);
};

transformCode({
    version: '1',
}).then((code) => console.log(code));

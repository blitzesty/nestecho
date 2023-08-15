import * as fs from 'fs-extra';
import * as path from 'path';
import traverse, {
    NodePath,
    Scope,
} from '@babel/traverse';
import { parse } from '@babel/parser';
import generate from '@babel/generator';
import * as _ from 'lodash';
import {
    ClassDeclaration,
    ClassMethod,
    Decorator,
    Identifier,
    ImportDeclaration,
    Statement,
    StringLiteral,
    TSTypeAnnotation,
    blockStatement,
    classProperty,
    identifier,
    importSpecifier,
    stringLiteral,
    tsAnyKeyword,
    tsPropertySignature,
    tsTypeAnnotation,
    tsTypeLiteral,
    tsTypeParameterInstantiation,
    tsTypeReference,
} from '@babel/types';
import template from '@babel/template';
import { ESLint } from 'eslint';
import { cosmiconfigSync } from 'cosmiconfig';
import { PathSchemeContext } from './interfaces';

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

export type LinterPlugin = (code: string, fromPath: string) => Promise<string>;
export interface LinterOptions extends ESLint.Options {
    prePlugins?: LinterPlugin[];
    postPlugins?: LinterPlugin[];
}

export type ImportType = 'ImportSpecifier' | 'ImportDefaultSpecifier' | 'ImportNamespaceSpecifier';

export interface EnsureImportOption {
    type: ImportType;
    identifier?: string;
    addImport?: boolean;
    sourceFn: (sources: string[]) => string;
}
export interface ImportItem {
    imported: string;
    local: string;
    source: string;
    type: ImportType;
}

export interface ExportedController {
    local: string;
    exported: string;
    name: string;
    controllerType: ApiControllerType;
    type: ImportType;
}

export type ApiControllerType = 'none' | 'admin' | 'open';

export interface ApiController {
    type: ApiControllerType;
    path: string;
}

export type ApiControllerTypeMap = Record<string, ApiControllerType>;

export type ApiRequestMappingType = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface ApiRequestMapping {
    type: ApiRequestMappingType;
    path: string;
}

export interface TransformCodeOptions {
    version: string;
    workDir: string;
    fileAbsolutePath: string;
    decoratorWhiteList?: string[];
}

export interface ApiMethodOptionsDescriptorValue {
    annotation: TSTypeAnnotation;
    transferIdentifier?: string;
    required?: boolean;
}

export interface ApiMethodOptionsDescriptorItem {
    [identifier: string]: ApiMethodOptionsDescriptorValue;
}

export interface ApiMethodOptionsDescriptor {
    body: ApiMethodOptionsDescriptorItem;
    param: ApiMethodOptionsDescriptorItem;
    query: ApiMethodOptionsDescriptorItem;
}

const parseController = async (options: TransformCodeOptions) => {
    const originalAst = parseAst(fs.readFileSync(path.resolve('/root/workspace/matrindex-api/src/subscription/subscription.controller.ts'), 'utf-8'));
    const ast = _.cloneDeep(originalAst);

    const checkApiKeyEnabled = (
        decoratorExpressions: Decorator[],
        scope?: Scope,
    ) => {
        if (
            !Array.isArray(decoratorExpressions) ||
            !decoratorExpressions.length ||
            !Array.isArray(importItems)
        ) {
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
    const getApiRequestMappingType = (decorators: Decorator[]) => {
        let result: ApiRequestMapping;

        if (!Array.isArray(decorators) || !decorators.length) {
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
            const localName = ensureImport({
                identifier: currentRestfulMethod,
                type: 'ImportSpecifier',
                addImport: false,
                sourceFn: () => '@nestjs/common',
            });

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
    const getControllerType = (classDeclaration: ClassDeclaration) => {
        let result: ApiController;
        const decorators = classDeclaration?.decorators;

        if (!Array.isArray(decorators) || !decorators.length) {
            return null;
        }

        const apiControllerTypeMap = (
            [
                {
                    controllerType: 'none',
                    name: 'Controller',
                    type: 'ImportSpecifier',
                    source: '@nestjs/common',
                },
                {
                    controllerType: 'admin',
                    name: 'AdminApiController',
                    type: 'ImportSpecifier',
                    source: 'src/common',
                },
                {
                    controllerType: 'open',
                    name: 'ApiController',
                    type: 'ImportSpecifier',
                    source: 'src/common',
                },
            ] as Array<{
                type: ImportType;
                controllerType: ApiControllerType;
                name: string;
                source: string;
            }>
        )
            .reduce((result, currentItem) => {
                const localName = ensureImport({
                    identifier: currentItem.name,
                    type: currentItem.type,
                    addImport: false,
                    sourceFn: () => currentItem.source,
                });

                if (!localName) {
                    return result;
                }

                result[localName] = currentItem.controllerType;

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
    const getImports = () => {
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

    const importItems = getImports();
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
    const importedDtoItemMap = importItems
        .filter((importItem) => {
            return importItem.source.endsWith('.dto');
        })
        .reduce(
            (result, importItem) => {
                result[importItem.local] = importItem;
                return result;
            },
            {},
        );

    const isDtoInReturnType = (nodePath: NodePath) => {
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
                nodePath?.parentPath?.parentPath?.node?.typeName?.name === ensuredImports['PartialDeep']
            )
        );
    };
    const ensureImport = (options?: EnsureImportOption) => {
        const {
            type,
            identifier: inputIdentifier,
            addImport = true,
            sourceFn,
        } = options;

        if (!type || typeof sourceFn !== 'function') {
            return null;
        }

        let newIdentifier = inputIdentifier;

        traverse(ast, {
            ImportDeclaration(nodePath1) {
                traverse(
                    nodePath1.node,
                    {
                        Identifier(nodePath2) {
                            if (inputIdentifier && nodePath2?.node?.name === inputIdentifier) {
                                const randomPrefix = new Array(8).fill('').map(() => {
                                    return 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
                                }).join('');
                                newIdentifier = `${randomPrefix}$$${inputIdentifier}`;
                                nodePath2.stop();
                            }
                        },
                    },
                    nodePath1.scope,
                );
            },
        });

        const importSources = ast.program.body
            .filter((statement) => statement.type === 'ImportDeclaration')
            .map((importDeclaration: ImportDeclaration) => importDeclaration.source.value)
            .filter((source) => !!source);
        const source = sourceFn(importSources);

        if (!source || typeof source !== 'string') {
            return null;
        }

        if (!inputIdentifier) {
            const targetImportDeclaration: ImportDeclaration = ast.program.body.find((statement) => {
                return statement.type === 'ImportDeclaration' && statement.source.value === source;
            }) as ImportDeclaration;

            if (!targetImportDeclaration) {
                ast.program.body.unshift(template.ast(`import '${source}'`) as ImportDeclaration);
            }

            return;
        }

        const targetImportDeclaration: ImportDeclaration = ast.program.body.find((statement) => {
            return statement.type === 'ImportDeclaration' && statement.source.value === source;
        }) as ImportDeclaration;

        if (!targetImportDeclaration) {
            if (addImport) {
                let importDeclaration: ImportDeclaration;
                switch (type) {
                    case 'ImportDefaultSpecifier': {
                        importDeclaration = template.ast(`import ${newIdentifier} from '${source}';`) as ImportDeclaration;
                        break;
                    }
                    case 'ImportSpecifier': {
                        importDeclaration = template.ast(`import { ${inputIdentifier} as ${newIdentifier} } from '${source}';`) as ImportDeclaration;
                        break;
                    }
                    case 'ImportNamespaceSpecifier': {
                        importDeclaration = template.ast(`import * as ${newIdentifier} from '${source}';`) as ImportDeclaration;
                        break;
                    }
                }

                ast.program.body.unshift(importDeclaration);

                return newIdentifier;
            } else {
                return null;
            }
        }

        let localIdentifier: string;

        for (const specifier of targetImportDeclaration.specifiers) {
            if (
                (type === 'ImportDefaultSpecifier' || type === 'ImportNamespaceSpecifier') &&
                specifier.type === type &&
                specifier.local.name === inputIdentifier
            ) {
                localIdentifier = inputIdentifier;
                break;
            }

            if (
                type === 'ImportSpecifier' &&
                specifier.type === 'ImportSpecifier' &&
                specifier.imported?.type === 'Identifier' &&
                specifier.imported.name === inputIdentifier
            ) {
                localIdentifier = specifier.local.name;
                break;
            }
        }

        if (!localIdentifier) {
            if (addImport && type === 'ImportSpecifier') {
                targetImportDeclaration.specifiers.push(importSpecifier(
                    identifier(newIdentifier),
                    identifier(inputIdentifier),
                ));
                return newIdentifier;
            } else {
                return null;
            }
        } else {
            return localIdentifier;
        }
    };
    const getReturnDto = (classMethod: ClassMethod, scope?: Scope) => {
        if (!classMethod || classMethod.type !== 'ClassMethod') {
            return null;
        }

        const returnTypeStatement: TSTypeAnnotation = classMethod?.returnType as TSTypeAnnotation;

        if (returnTypeStatement?.type !== 'TSTypeAnnotation') {
            return null;
        }

        try {
            let dtoClassName: string;
            traverse(
                classMethod.returnType,
                {
                    Identifier(nodePath) {
                        if (importedDtoItemMap[nodePath.node.name]) {
                            dtoClassName = nodePath.node.name;
                            nodePath.stop();
                        }
                    },
                },
                scope,
            );
            return dtoClassName;
        } catch (e) {
            console.log(e);
            return null;
        }
    };
    const lintCode = async (
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

    ast.program.body.unshift(template.ast('import \'reflect-metadata\';') as Statement);
    const ensuredImports = ([
        {
            identifier: 'PartialDeep',
            type: 'ImportSpecifier',
            sourceFn: () => '@mtrxjs/basics/dist/common/common.interface',
        },
        {
            identifier: 'SDKResponse',
            type: 'ImportSpecifier',
            sourceFn: () => path.relative(path.dirname(options.fileAbsolutePath), path.resolve(options.workDir, './src/interfaces')),
        },
        {
            identifier: 'CUSTOM_DESERIALIZER',
            type: 'ImportSpecifier',
            sourceFn: () => '@mtrxjs/basics/dist/common/common.constant',
        },
        {
            identifier: 'request',
            type: 'ImportDefaultSpecifier',
            sourceFn: () => path.relative(path.dirname(options.fileAbsolutePath), path.resolve(options.workDir, './src/request')),
        },
        {
            identifier: 'plainToInstance',
            type: 'ImportSpecifier',
            sourceFn: () => '@mtrxjs/basics/dist/common/plain-to-instance',
        },
    ] as Omit<EnsureImportOption, 'body'>[]).reduce((result, ensureImportItem) => {
        result[ensureImportItem.identifier] = ensureImport(ensureImportItem);
        return result;
    }, {});

    const exportDefaultController = Symbol('export.default');
    const controllerDeclarationTypeMap: Record<string | symbol, {
        name: string;
        type: ApiControllerType;
    }> = {};

    traverse(ast, {
        ImportDeclaration(nodePath1) {
            if (nodePath1?.node?.source?.value?.startsWith('@matrindex/build-essential')) {
                nodePath1.node.source.value = nodePath1.node.source.value.replace(/^\@matrindex\/build-essential/g, '@mtrxjs/basics');
            }
        },
        ClassDeclaration(nodePath1) {
            const controllerApiKeyEnabled = checkApiKeyEnabled(
                nodePath1?.node?.decorators,
                nodePath1.scope,
            );
            const apiController = getControllerType(nodePath1?.node) || {
                type: null,
                path: '/',
            };

            let pathPrefix: string;
            const versionPath = `/v${options.version ?? 1}`;

            switch (apiController.type) {
                case 'admin':
                    pathPrefix = '/admin_api' + versionPath;
                    break;
                case 'open':
                    pathPrefix = '/api' + versionPath;
                    break;
                case 'none':
                    pathPrefix = '';
                    break;
                default:
                    break;
            }

            if (apiController.type) {
                let controllerDeclarationName: string | symbol;

                if (nodePath1.node?.id?.name) {
                    controllerDeclarationName = nodePath1.node?.id.name;
                } else if (nodePath1.parentPath.node?.type === 'ExportDefaultDeclaration') {
                    controllerDeclarationName = exportDefaultController;
                }

                controllerDeclarationTypeMap[controllerDeclarationName] = {
                    type: apiController.type,
                    name: _.camelCase(apiController.path.replace(/^\//g, '').split('/').join('-')),
                };
            }

            const basePathnamePropertyExpression = classProperty(identifier('basePathname'), stringLiteral(pathPrefix + apiController.path));

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
                            const methodApiKeyEnabled = checkApiKeyEnabled(nodePath2?.node?.decorators, nodePath2?.scope);

                            if (!methodApiKeyEnabled) {
                                nodePath2.remove();
                                return;
                            }
                        }

                        const apiRequestMapping = getApiRequestMappingType(nodePath2?.node?.decorators);

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
                        const returnDtoClassName = getReturnDto(nodePath2.node, nodePath2.scope) ?? 'null';
                        const newBody = template.ast(
                            `
                                let deserializer = Reflect.getMetadata(${ensuredImports['CUSTOM_DESERIALIZER']}, this.${(nodePath2?.node?.key as Identifier)?.name});
                                const optionsMap = ${JSON.stringify(bodyOptions)};
                                const ReturnDtoClass = ${returnDtoClassName};

                                if (!deserializer) {
                                    deserializer = (response) => {
                                        if (returnDtoClass) {
                                            return ${ensuredImports['plainToInstance']}(ReturnDtoClass, response?.data, {
                                                groups: ['response'],
                                            });
                                        } else {
                                            return response?.data;
                                        }
                                    };
                                }

                                return await ${ensuredImports['request']}({
                                    method: '${apiRequestMapping.type?.toLowerCase()}',
                                    url: this.basePathname + '${apiRequestMapping.path ?? ''}',
                                    deserializer,
                                });
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
                            Boolean(importedDtoItemMap[nodePath2?.node?.typeName?.name]) &&
                            !isDtoInReturnType(nodePath2)
                        ) {
                            nodePath2.node.typeParameters = tsTypeParameterInstantiation([
                                _.clone(nodePath2.node),
                            ]);
                            nodePath2.node.typeName = identifier(ensuredImports['PartialDeep']);
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
        },
    });

    const exportedControllers: ExportedController[] = [];

    traverse(ast, {
        ExportNamedDeclaration(nodePath1) {
            if (
                nodePath1.node?.declaration?.type === 'ClassDeclaration' &&
                Object.keys(controllerDeclarationTypeMap).includes(nodePath1.node?.declaration?.id?.name)
            ) {
                const controllerName = nodePath1.node?.declaration?.id?.name;
                exportedControllers.push({
                    local: controllerName,
                    exported: controllerName,
                    type: 'ImportSpecifier',
                    controllerType: controllerDeclarationTypeMap?.[controllerName]?.type,
                    name: controllerDeclarationTypeMap?.[controllerName]?.name,
                });
            } else if (nodePath1.node?.specifiers?.length > 0) {
                for (const specifier of nodePath1.node.specifiers) {
                    if (
                        specifier.type === 'ExportSpecifier' &&
                        Object.keys(controllerDeclarationTypeMap).includes(specifier.local.name) &&
                        specifier.exported.type === 'Identifier'
                    ) {
                        exportedControllers.push({
                            local: specifier.local.name,
                            exported: specifier.exported.name,
                            type: 'ImportSpecifier',
                            controllerType: controllerDeclarationTypeMap?.[specifier.local.name]?.type,
                            name: controllerDeclarationTypeMap?.[specifier.local.name]?.name,
                        });
                    }
                }
            }
        },
        ExportDefaultDeclaration(nodePath1) {
            if (nodePath1?.node?.declaration?.type === 'ClassDeclaration') {
                if (
                    !nodePath1?.node?.declaration?.id &&
                    Boolean(controllerDeclarationTypeMap[exportDefaultController])
                ) {
                    exportedControllers.push({
                        local: null,
                        exported: null,
                        name: controllerDeclarationTypeMap[exportDefaultController]?.name,
                        controllerType: controllerDeclarationTypeMap[exportDefaultController]?.type,
                        type: 'ImportDefaultSpecifier',
                    });
                } else {
                    const controllerName = nodePath1.node.declaration.id.name;
                    exportedControllers.push({
                        local: controllerName,
                        exported: controllerName,
                        name: controllerDeclarationTypeMap[controllerName]?.name,
                        controllerType: controllerDeclarationTypeMap[controllerName]?.type,
                        type: 'ImportDefaultSpecifier',
                    });
                }
            } else if (
                nodePath1.node.declaration.type === 'Identifier' &&
                Boolean(controllerDeclarationTypeMap[nodePath1.node.declaration.name])
            ) {
                const controllerName = nodePath1.node.declaration.name;
                exportedControllers.push({
                    local: controllerName,
                    exported: controllerName,
                    name: controllerDeclarationTypeMap[controllerName]?.name,
                    controllerType: controllerDeclarationTypeMap[controllerName]?.type,
                    type: 'ImportDefaultSpecifier',
                });
            }
        },
    });

    traverse(ast, {
        ClassMethod(nodePath1) {
            if (!nodePath1.node?.returnType) {
                nodePath1.node.returnType = tsTypeAnnotation(
                    tsTypeReference(
                        identifier('Promise'),
                        tsTypeParameterInstantiation([
                            tsTypeReference(
                                identifier(ensuredImports['SDKResponse']),
                                tsTypeParameterInstantiation([
                                    tsAnyKeyword(),
                                ]),
                            ),
                        ]),
                    ),
                );
            } else {
                if (
                    nodePath1.node?.returnType?.type === 'TSTypeAnnotation' &&
                    nodePath1.node?.returnType?.typeAnnotation?.type === 'TSTypeReference' &&
                    nodePath1.node?.returnType?.typeAnnotation?.typeName?.type === 'Identifier' &&
                    nodePath1.node?.returnType?.typeAnnotation?.typeName?.name === 'Promise' &&
                    nodePath1.node?.returnType?.typeAnnotation?.typeParameters?.type === 'TSTypeParameterInstantiation'
                ) {
                    nodePath1.node.returnType.typeAnnotation.typeParameters = tsTypeParameterInstantiation([
                        tsTypeReference(
                            identifier(ensuredImports['SDKResponse']),
                            nodePath1.node.returnType.typeAnnotation.typeParameters,
                        ),
                    ]);
                } else {
                    nodePath1.node.returnType = tsTypeAnnotation(
                        tsTypeReference(
                            identifier(ensuredImports['SDKResponse']),
                            tsTypeParameterInstantiation([
                                tsAnyKeyword(),
                            ]),
                        ),
                    );
                }
            }
        },
    });

    return await lintCode(generate(ast)?.code);
};

parseController({
    version: '1',
    workDir: '/work',
    fileAbsolutePath: '/work/src/controllers/subscription.controller.ts',
}).then((code) => console.log(code));

///

export const controllerPathScheme = (context: PathSchemeContext) => {
    if (
        context?.decoratorExpression?.type !== 'CallExpression' ||
        context?.decoratorExpression?.callee?.type !== 'Identifier' ||
        (
            context?.decoratorExpression?.arguments?.[0] &&
            context?.decoratorExpression?.arguments?.[0]?.type !== 'StringLiteral'
        )
    ) {
        return null;
    }

    return (context?.decoratorExpression?.arguments?.[0] as StringLiteral)?.value ?? null;
};

export const methodPathScheme = controllerPathScheme;

const ensureImport = (options?: EnsureImportOption) => {
    const {
        type,
        identifier: inputIdentifier,
        addImport = true,
        sourceFn,
    } = options;

    if (!type || typeof sourceFn !== 'function') {
        return null;
    }

    let newIdentifier = inputIdentifier;

    traverse(ast, {
        ImportDeclaration(nodePath1) {
            traverse(
                nodePath1.node,
                {
                    Identifier(nodePath2) {
                        if (inputIdentifier && nodePath2?.node?.name === inputIdentifier) {
                            const randomPrefix = new Array(8).fill('').map(() => {
                                return 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
                            }).join('');
                            newIdentifier = `${randomPrefix}$$${inputIdentifier}`;
                            nodePath2.stop();
                        }
                    },
                },
                nodePath1.scope,
            );
        },
    });

    const importSources = ast.program.body
        .filter((statement) => statement.type === 'ImportDeclaration')
        .map((importDeclaration: ImportDeclaration) => importDeclaration.source.value)
        .filter((source) => !!source);
    const source = sourceFn(importSources);

    if (!source || typeof source !== 'string') {
        return null;
    }

    if (!inputIdentifier) {
        const targetImportDeclaration: ImportDeclaration = ast.program.body.find((statement) => {
            return statement.type === 'ImportDeclaration' && statement.source.value === source;
        }) as ImportDeclaration;

        if (!targetImportDeclaration) {
            ast.program.body.unshift(template.ast(`import '${source}'`) as ImportDeclaration);
        }

        return;
    }

    const targetImportDeclaration: ImportDeclaration = ast.program.body.find((statement) => {
        return statement.type === 'ImportDeclaration' && statement.source.value === source;
    }) as ImportDeclaration;

    if (!targetImportDeclaration) {
        if (addImport) {
            let importDeclaration: ImportDeclaration;
            switch (type) {
                case 'ImportDefaultSpecifier': {
                    importDeclaration = template.ast(`import ${newIdentifier} from '${source}';`) as ImportDeclaration;
                    break;
                }
                case 'ImportSpecifier': {
                    importDeclaration = template.ast(`import { ${inputIdentifier} as ${newIdentifier} } from '${source}';`) as ImportDeclaration;
                    break;
                }
                case 'ImportNamespaceSpecifier': {
                    importDeclaration = template.ast(`import * as ${newIdentifier} from '${source}';`) as ImportDeclaration;
                    break;
                }
            }

            ast.program.body.unshift(importDeclaration);

            return newIdentifier;
        } else {
            return null;
        }
    }

    let localIdentifier: string;

    for (const specifier of targetImportDeclaration.specifiers) {
        if (
            (type === 'ImportDefaultSpecifier' || type === 'ImportNamespaceSpecifier') &&
            specifier.type === type &&
            specifier.local.name === inputIdentifier
        ) {
            localIdentifier = inputIdentifier;
            break;
        }

        if (
            type === 'ImportSpecifier' &&
            specifier.type === 'ImportSpecifier' &&
            specifier.imported?.type === 'Identifier' &&
            specifier.imported.name === inputIdentifier
        ) {
            localIdentifier = specifier.local.name;
            break;
        }
    }

    if (!localIdentifier) {
        if (addImport && type === 'ImportSpecifier') {
            targetImportDeclaration.specifiers.push(importSpecifier(
                identifier(newIdentifier),
                identifier(inputIdentifier),
            ));
            return newIdentifier;
        } else {
            return null;
        }
    } else {
        return localIdentifier;
    }
};

import { CodegenOptions } from './interfaces';
import { TSTypeAnnotation } from '@babel/types';
import traverse from '@babel/traverse';
import {
    controllerPathScheme,
    methodPathScheme,
} from './utils';
import * as _ from 'lodash';

export class Codegen {
    protected options: CodegenOptions;

    public constructor(options: CodegenOptions) {
        const defaultOptions: Omit<CodegenOptions, 'baseURL' | 'outputDir' | 'workDir'> = {
            authGuardWhiteList: [
                'api-key',
            ],
            classTransformOptions: {
                groups: ['response'],
                excludeExtraneousValues: true,
                enableImplicitConversion: true,
            },
            controllerGlobPatterns: [
                '*.controller.ts',
            ],
            customizer: {
                controllers: [
                    {
                        imported: 'AdminApiController',
                        type: 'ImportSpecifier',
                        source: 'src/common',
                        pathScheme: (context) => {
                            const result = controllerPathScheme(context);

                            if (!result || typeof result !== 'string') {
                                return null;
                            }

                            return `/admin_api${context?.versioning && context?.version ? `/v${context?.version}` : ''}${result.startsWith('/') ? result : `/${result}`}`;
                        },
                    },
                    {
                        imported: 'ApiController',
                        type: 'ImportSpecifier',
                        source: 'src/common',
                        pathScheme: (context) => {
                            const result = controllerPathScheme(context);

                            if (!result || typeof result !== 'string') {
                                return null;
                            }

                            return `/api${context?.versioning && context?.version ? `/v${context?.version}` : ''}${result.startsWith('/') ? result : `/${result}`}`;
                        },
                    },
                    {
                        imported: 'Controller',
                        type: 'ImportSpecifier',
                        source: '@nestjs/common',
                        pathScheme: controllerPathScheme,
                    },
                ],
                httpMethodMap: {
                    GET: {
                        imported: 'Get',
                        source: '@nestjs/common',
                        type: 'ImportSpecifier',
                        pathScheme: methodPathScheme,
                    },
                    POST: {
                        imported: 'Post',
                        source: '@nestjs/common',
                        type: 'ImportSpecifier',
                        pathScheme: methodPathScheme,
                    },
                    PUT: {
                        imported: 'Put',
                        source: '@nestjs/common',
                        type: 'ImportSpecifier',
                        pathScheme: methodPathScheme,
                    },
                    PATCH: {
                        imported: 'Patch',
                        source: '@nestjs/common',
                        type: 'ImportSpecifier',
                        pathScheme: methodPathScheme,
                    },
                    DELETE: {
                        imported: 'Delete',
                        source: '@nestjs/common',
                        type: 'ImportSpecifier',
                        pathScheme: methodPathScheme,
                    },
                },
                ensureImports: [
                    {
                        identifier: 'PartialDeep',
                        type: 'ImportSpecifier',
                        sourceFn: () => '@blitzesty/nestjs-sdk-maker/dist/interfaces',
                    },
                    {
                        identifier: 'SDKResponse',
                        type: 'ImportSpecifier',
                        sourceFn: () => '@blitzesty/nestjs-sdk-maker/dist/interfaces',
                    },
                    {
                        identifier: 'DESERIALIZER',
                        type: 'ImportSpecifier',
                        sourceFn: () => '@blitzesty/nestjs-sdk-maker/dist/constants',
                    },
                    {
                        identifier: 'request',
                        type: 'ImportSpecifier',
                        sourceFn: () => '@blitzesty/nestjs-sdk-maker/dist/request',
                    },
                    {
                        identifier: 'plainToInstance',
                        type: 'ImportSpecifier',
                        sourceFn: () => 'class-transformer',
                    },
                    {
                        identifier: null,
                        type: 'ImportDefaultSpecifier',
                        sourceFn: () => 'reflect-metadata',
                    },
                ],
            },
            getReturnDto: (context) => {
                const returnTypeStatement: TSTypeAnnotation = context?.returnType as TSTypeAnnotation;

                if (returnTypeStatement?.type !== 'TSTypeAnnotation') {
                    return null;
                }

                try {
                    let dtoClassName: string;
                    traverse(
                        returnTypeStatement,
                        {
                            Identifier(nodePath) {
                                if (context?.dtoIdentifiers?.includes(nodePath.node.name)) {
                                    dtoClassName = nodePath.node.name;
                                    nodePath.stop();
                                }
                            },
                        },
                        context?.scope,
                    );
                    return dtoClassName;
                } catch (e) {
                    console.log(e);
                    return null;
                }
            },
            getAuthGuardTypes: (context) => {
                const {
                    scope,
                    decorators: decoratorExpressions,
                    importItems = [],
                } = context;
                const result: string[] = [];

                if (
                    !Array.isArray(decoratorExpressions) ||
                    !decoratorExpressions.length ||
                    !Array.isArray(importItems)
                ) {
                    return result;
                }

                const authGuardIdentifier = importItems.find((importItem) => {
                    return importItem.type === 'ImportSpecifier' && importItem.imported === 'AuthGuard' && importItem.source === '@nestjs/passport';
                })?.local;
                const useGuardsIdentifier = importItems.find((importItem) => {
                    return importItem.type === 'ImportSpecifier' && importItem.imported === 'UseGuards' && importItem.source === '@nestjs/common';
                })?.local;

                if (!authGuardIdentifier || !useGuardsIdentifier) {
                    return result;
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
                                                if (stringLiteralNodePath?.node?.value) {
                                                    result.push(stringLiteralNodePath?.node?.value);
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

                return result;
            },
        };

        const mergedOptions = _.merge(
            _.cloneDeep(defaultOptions),
            options,
        );

        mergedOptions.customizer.ensureImports = defaultOptions.customizer.ensureImports.concat(mergedOptions.customizer.ensureImports);

        this.options = mergedOptions;
    }
}

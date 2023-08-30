import * as path from 'path';
import { Options } from './interfaces/options.interface';
import * as _ from 'lodash';
import { RouteParamType } from './interfaces/route-param-type.interface';
import {
    normalizeUrlPath,
    parseAst,
} from './utils';
import { Statement } from '@babel/types';
import traverse from '@babel/traverse';

export const CUSTOM_DESERIALIZER = 'nestecho:metadata:custom_deserializer';
export const FILE_PATH = 'nestecho:metadata:file_path';
export const NESTECHO_DESCRIPTION = 'nestecho:metadata:description';
export const NESTECHO_EXCLUDE = 'nestecho:metadata:exclude';

export const INNER_TEMPLATE_DIR = path.resolve(__dirname, '../templates');

export const defaultOptions = {
    apiBaseURL: '/',
    appEntry: 'src/main.ts',
    appModule: {
        entry: 'src/app.module.ts',
        identifier: 'AppModule',
        importType: 'ImportSpecifier',
    },
    classTransformOptions: {
        groups: ['response'],
        excludeExtraneousValues: true,
        enableImplicitConversion: true,
    },
    cleanups: [],
    controllersOutputDir: './controllers',
    controllerPatterns: [
        '**/*.controller.ts',
    ],
    controllerScheme: ({ filePath }) => {
        const fileName = path.basename(filePath);
        let name: string;

        name = /(.*).admin.controller.*/g.exec(fileName)?.[1];

        if (name) {
            return `adminApi.${_.camelCase(name)}`;
        }

        name = /(.*).controller.*/g.exec(fileName)?.[1];

        if (name) {
            return `openApi.${_.camelCase(name)}`;
        }

        return _.camelCase(path.basename(fileName.split('.').slice(0, -1).join('.')));
    },
    decoratorRemovableChecker: (importItem) => !importItem?.source?.includes('@blitzesty/nestecho'),
    dtoImportMatcher: {
        importType: [
            'ImportSpecifier',
            'ImportDefaultSpecifier',
        ],
        sourceMatcher: /\.dto$/g,
    },
    ensureImports: [
        {
            identifier: 'DeepPartial',
            addImport: true,
            type: 'ImportSpecifier',
            source: '@blitzesty/nestecho/dist/interfaces/deep-partial.interface',
            sourceMatcher: '@blitzesty/nestecho/dist/interfaces/deep-partial.interface',
        },
        {
            identifier: 'Response',
            addImport: true,
            type: 'ImportSpecifier',
            source: '@blitzesty/nestecho/dist/interfaces/response.interface',
            sourceMatcher: '@blitzesty/nestecho/dist/interfaces/response.interface',
        },
        {
            identifier: 'ResponseError',
            addImport: true,
            type: 'ImportSpecifier',
            source: '@blitzesty/nestecho/dist/interfaces/response-error.interface',
            sourceMatcher: '@blitzesty/nestecho/dist/interfaces/response-error.interface',
        },
    ],
    methodGenerator: ({
        controllerDescriptor,
        ensuredImportMap,
        methodDescriptor,
        methodName,
        methodOptionsMap,
        requestTypeIdentifierName,
        responseTypeIdentifierName,
    }) => {
        const ast = parseAst(`
            const foo = async () => {
                const currentMethodPath = '${normalizeUrlPath(controllerDescriptor.path + methodDescriptor.path)}';
                const optionsMap = ${JSON.stringify(methodOptionsMap)};

                return await ${ensuredImportMap?.['request']?.[0]}<${requestTypeIdentifierName}, ${responseTypeIdentifierName}>({
                    method: '${methodDescriptor.method}',
                    url: currentMethodPath,
                    metadatas: Reflect
                        .getOwnMetadataKeys(this.${methodName})
                        .reduce((result, metadataKey) => {
                            result[metadataKey] = Reflect.getMetadata(metadataKey, this.${methodName});
                            return result;
                        }, {}),
                    optionsMap,
                    options,
                });
            }
        `);
        let result: Statement[];

        traverse(ast, {
            ArrowFunctionExpression(nodePath1) {
                if (nodePath1?.node?.body?.type !== 'BlockStatement') {
                    return;
                }

                result = nodePath1.node.body?.body;

                return nodePath1.stop();
            },
        });

        return result;
    },
    outputDir: './.sdk',
    outputCodeDir: './src',
    responseHandlerDescriptors: [],
    sdkClassName: 'Client',
    sdkOptionsInterfaceDescriptor: {
        type: 'ImportSpecifier',
        identifier: 'SDKOptions',
        sourceMatcher: '@blitzesty/nestecho/dist/sdk-options.interface',
        source: '@blitzesty/nestecho/dist/sdk-options.interface',
    },
    sourceCodeDir: './src',
    templateDir: path.resolve(__dirname, '../templates'),
    templateReplacements: {},
    version: '0.0.0',
} as Required<Omit<Options, 'packageName'>>;

export const ROUTE_PARAM_TYPES: Record<string, RouteParamType> = {
    '3': 'body',
    '4': 'query',
    '5': 'param',
};

import * as path from 'path';
import { Options } from './interfaces/options.interface';
import * as _ from 'lodash';

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
    dtoImportMatcher: {
        importType: [
            'ImportSpecifier',
            'ImportDefaultSpecifier',
        ],
        sourceMatcher: /\.dto$/g,
    },
    outputDir: './sdk',
    outputCodeDir: './src',
    responseHandlerDescriptors: [],
    sdkClassName: 'Client',
    sdkOptionsInterfaceDescriptor: {
        type: 'ImportSpecifier',
        identifier: 'SDKOptions',
        sourceMatcher: /^\@blitzesty\/nestecho\/*/g,
        source: '@blitzesty/nestecho/dist/sdk-options.interface',
    },
    sourceCodeDir: './src',
    templateDir: path.resolve(__dirname, '../templates'),
    templateReplacements: {},
    version: '0.0.0',
    versioning: false,
} as Required<Omit<Options, 'packageName'>>;

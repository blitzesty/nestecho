import * as path from 'path';
import { Options } from './interfaces/options.interface';

export const CUSTOM_DESERIALIZER = 'nestecho:metadata:custom_deserializer';
export const FILE_PATH = 'nestecho:metadata:file_path';

export const INNER_TEMPLATE_DIR = path.resolve(__dirname, '../templates');

export const defaultOptions = {
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
    controllerPatterns: [
        '**/*.controller.ts',
    ],
    dtoImportMatcher: {
        importType: [
            'ImportSpecifier',
            'ImportDefaultSpecifier',
        ],
        sourceMatcher: /\.dto$/g,
    },
    outputDir: './sdk',
    responseHandlerDescriptors: [],
    sdkClassName: 'Client',
    sdkOptionsInterfaceDescriptor: {
        type: 'ImportSpecifier',
        identifier: 'SDKOptions',
        sourceMatcher: /^\@blitzesty\/nestecho\/*/g,
        source: '@blitzesty/nestecho/dist/sdk-options.interface',
    },
    templateConfig: {
        index: 'index.ts',
        request: 'request.ts',
    },
    versioning: false,
} as Required<Omit<Options, 'apiBaseURL' | 'packageName'>>;

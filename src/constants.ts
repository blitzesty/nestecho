import { Options } from './interfaces/common.interface';

export const CUSTOM_DESERIALIZER = 'nestecho:metadata:custom_deserializer';
export const FILE_PATH = 'nestecho:metadata:file_path';

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
    sdkOptionsInterfaceDescriptor: {
        type: 'ImportSpecifier',
        identifier: 'SDKOptions',
        sourceMatcher: /^\@blitzesty\/nestecho/g,
        source: '@blitzesty/nestecho/dist/sdk-options.interface',
    },
    versioning: false,
    workDir: process.cwd(),
    requestOptions: () => {
        return {
            timeout: 60000,
        };
    },
} as Partial<Options>;

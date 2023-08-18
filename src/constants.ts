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
        sourceMatcher: '.dto$',
    },
    outputDir: './sdk',
    responseHandlers: [],
    sdkOptionsInterfaceDescriptor: {
        type: 'ImportSpecifier',
        identifier: 'SDKOptions',
        sourceMatcher: '^@blitzesty/nestecho/*',
        source: '@blitzesty/nestecho/dist/sdk-options.interface',
    },
    versioning: false,
} as Required<Omit<Options, 'apiBaseURL' | 'packageName'>>;

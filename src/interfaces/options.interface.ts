import { ClassTransformOptions } from 'class-transformer';
import { AppModuleOptions } from './app-module-options.interface';
import { DTOImportMatcher } from './dto-import-matcher.interface';
import { EnsureImportOptions } from './ensure-import.interface';

export interface Options {
    apiBaseURL: string;
    packageName: string;
    appEntry?: string;
    appModule?: AppModuleOptions;
    classTransformOptions?: ClassTransformOptions;
    cleanups?: string[];
    controllerPatterns?: string[];
    dtoImportMatcher?: DTOImportMatcher;
    outputDir?: string;
    responseHandlers?: EnsureImportOptions[];
    sdkOptionsInterfaceDescriptor?: Required<Omit<EnsureImportOptions, 'addImport' | 'sourceMatcher'> & { sourceMatcher: string }>;
    templateDir?: string;
    version?: string;
    versioning?: boolean;
}

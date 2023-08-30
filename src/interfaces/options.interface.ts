import { ClassTransformOptions } from 'class-transformer';
import { AppModuleOptions } from './app-module-options.interface';
import { DTOImportMatcher } from './dto-import-matcher.interface';
import { ControllerScheme } from './controller-scheme.interface';
import { ImportDescriptor } from './import-descriptor.interface';
import { MethodContext } from './method-context.interface';
import { EnsureImportOptions } from './ensure-import-options.interface';
import { ImportItem } from './import-item.interface';
import { Declaration } from '@babel/types';

export interface Options {
    packageName: string;
    apiBaseURL?: string;
    appEntry?: string;
    appModule?: AppModuleOptions;
    classTransformOptions?: ClassTransformOptions;
    cleanups?: string[];
    controllersOutputDir?: string;
    controllerPatterns?: string[];
    controllerScheme?: ControllerScheme;
    decoratorRemovableChecker?: (data: ImportItem) => boolean;
    dtoImportMatcher?: DTOImportMatcher;
    ensureImports?: EnsureImportOptions[];
    methodGenerator?: (context: MethodContext) => Declaration[];
    outputDir?: string;
    outputCodeDir?: string;
    responseHandlerDescriptors?: ImportDescriptor[];
    sdkClassName?: string;
    sdkOptionsInterfaceDescriptor?: ImportDescriptor;
    sourceCodeDir?: string;
    templateDir?: string;
    version?: string;
}

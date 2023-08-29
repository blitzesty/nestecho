import { ClassTransformOptions } from 'class-transformer';
import { AppModuleOptions } from './app-module-options.interface';
import { DTOImportMatcher } from './dto-import-matcher.interface';
import { ControllerScheme } from './controller-scheme.interface';
import { ImportDescriptor } from './import-descriptor.interface';
import { TemplateReplacements } from './template-replacements.interface';
import { MethodContext } from './method-context.interface';
import { EnsureImportOptions } from './ensure-import-options.interface';

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
    dtoImportMatcher?: DTOImportMatcher;
    ensureImports?: EnsureImportOptions[];
    methodGenerator?: (context: MethodContext) => string;
    outputDir?: string;
    outputCodeDir?: string;
    responseHandlerDescriptors?: ImportDescriptor[];
    sdkClassName?: string;
    sdkOptionsInterfaceDescriptor?: ImportDescriptor;
    sourceCodeDir?: string;
    templateDir?: string;
    templateReplacements?: TemplateReplacements;
    version?: string;
}

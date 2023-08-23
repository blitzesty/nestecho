import { ClassTransformOptions } from 'class-transformer';
import { AppModuleOptions } from './app-module-options.interface';
import { DTOImportMatcher } from './dto-import-matcher.interface';
import { EnsureImportOptions } from './ensure-import.interface';
import { TemplateConfig } from './template-config.interface';
import { InterfaceDescriptor } from './interface-descriptor.interface';
import { ControllerScheme } from './controller-scheme.interface';

export interface Options {
    packageName: string;
    apiBaseURL?: string;
    appEntry?: string;
    appModule?: AppModuleOptions;
    classTransformOptions?: ClassTransformOptions;
    cleanups?: string[];
    controllerPatterns?: string[];
    controllerScheme?: ControllerScheme;
    dtoImportMatcher?: DTOImportMatcher;
    outputDir?: string;
    responseHandlerDescriptors?: EnsureImportOptions[];
    sdkClassName?: string;
    sdkOptionsInterfaceDescriptor?: InterfaceDescriptor;
    templateConfig?: TemplateConfig;
    templateDir?: string;
    version?: string;
    versioning?: boolean;
}

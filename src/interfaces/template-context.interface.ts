import { ControllerPath } from './controller-path.interface';
import { ControllerSourceDescriptor } from './controller-source-descriptor.interface';
import { Options } from './options.interface';

export interface TemplateContext {
    controllerSourceDescriptors: ControllerSourceDescriptor[];
    outputAbsolutePath: string;
    paths: ControllerPath[];
    projectConfig: Options;
    workDir: string;
}

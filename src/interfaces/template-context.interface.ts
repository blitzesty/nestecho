import { ControllerPath } from './controller-path.interface';
import { Options } from './options.interface';

export interface TemplateContext {
    outputAbsolutePath: string;
    paths: ControllerPath[];
    projectConfig: Options;
    workDir: string;
}

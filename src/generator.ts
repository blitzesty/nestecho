import * as path from 'path';
import { GeneratorOptions } from './interfaces/generator-options.interface';
import { findWorkDir } from './utils/find-work-dir';
import { Options } from './interfaces';

export class Generator {
    protected workDir: string;
    protected projectConfig: Options;

    public constructor(protected readonly options?: GeneratorOptions) {
        if (this.options?.configFilePath && typeof this.options.configFilePath === 'string') {
            this.workDir = path.dirname(this.options.configFilePath);
        } else {
            this.workDir = findWorkDir();
        }

        // TODO: load js config
    }
}

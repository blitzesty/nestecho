import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs-extra';
import { GeneratorOptions } from './interfaces/generator-options.interface';
import {
    ControllerListItem,
    Options,
} from './interfaces';
import { loadConfig } from './utils';
import {
    DynamicModule,
    ForwardReference,
    Type,
} from '@nestjs/common';
import { FILE_PATH } from './constants';

export class Generator {
    protected workDir: string;
    protected projectConfig: Options;

    public constructor(
        protected readonly appModule: Type,
        protected readonly options?: GeneratorOptions,
    ) {
        if (!this.options?.configFilePath || typeof this.options.configFilePath !== 'string') {
            const workDir = this.findWorkDir();

            if (!workDir) {
                throw new Error('Cannot find work directory with default project config file');
            }

            this.workDir = workDir;

            if (!this.options) {
                this.options = {};
            }

            this.options.configFilePath = path.resolve(workDir, './nestecho.config.js');
        } else {
            this.workDir = path.dirname(options.configFilePath);
        }

        this.projectConfig = loadConfig(this.options.configFilePath);
    }

    public generate() {
        let result: ControllerListItem[] = [];

        return result;
    }

    protected findAllControllers(module: Type<any> | DynamicModule | Promise<DynamicModule> | ForwardReference<any> = this.appModule) {
        let controllers: Type[] = [];
        let imports: Array<Type<any> | DynamicModule | Promise<DynamicModule> | ForwardReference<any>> = [];
        let moduleClass: Type;

        /**
         * test if input parameter is a dynamic module
         */
        if ((module as DynamicModule)?.module) {
            moduleClass = (module as DynamicModule)?.module;
            controllers = controllers.concat((module as DynamicModule)?.controllers || []);
            imports = imports.concat((module as DynamicModule)?.imports || []);
        } else {
            moduleClass = module as Type;
        }

        controllers = controllers
            .concat(Reflect.getMetadata('controllers', moduleClass) || [])
            .filter((controllerClass) => {
                const filePath = Reflect.getMetadata(FILE_PATH, controllerClass);
                return filePath && typeof filePath === 'string';
            });
        imports = imports.concat(Reflect.getMetadata('imports', moduleClass) || []);

        if (imports.length > 0) {
            imports.forEach((importItem) => {
                controllers = controllers.concat(this.findAllControllers(importItem));
            });
        }

        return controllers;
    }

    private findWorkDir(startPath = process.cwd()) {
        const configPath = path.resolve(startPath, './nestecho.config.js');

        if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
            return startPath;
        } else {
            const parentPath = path.resolve(startPath, '..');

            if (parentPath === startPath) {
                return null;
            } else {
                return this.findWorkDir(parentPath);
            }
        }
    }
}

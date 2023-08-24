import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs-extra';
import { GeneratorOptions } from './interfaces/generator-options.interface';
import {
    ControllerPath,
    DescribeDecoratorOptions,
    ImportType,
    Options,
} from './interfaces';
import {
    loadConfig,
    parseAst,
} from './utils';
import {
    DynamicModule,
    ForwardReference,
    Type,
} from '@nestjs/common';
import {
    FILE_PATH,
    NESTECHO_DESCRIPTION,
} from './constants';
import traverse from '@babel/traverse';

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
        // const resultObject: ControllerMap = {};
        const result: ControllerPath[] = [];
        const allControllers = this.findAllControllers(this.appModule);

        for (const controller of allControllers) {
            const absoluteFilePath = Reflect.getMetadata(FILE_PATH, controller);
            let pathname: string;

            if (!absoluteFilePath || typeof absoluteFilePath !== 'string') {
                continue;
            }

            try {
                pathname = this.projectConfig.controllerScheme({
                    filePath: absoluteFilePath,
                    name: controller.name,
                    workDir: this.workDir,
                });
            } catch (e) {
                continue;
            }

            if (!pathname || typeof pathname !== 'string') {
                continue;
            }

            let importType: ImportType;
            let exportName: string;
            const ast = parseAst(fs.readFileSync(absoluteFilePath).toString());
            const description: DescribeDecoratorOptions = Reflect.getMetadata(NESTECHO_DESCRIPTION, controller) ?? {};

            traverse(ast, {
                Identifier(nodePath) {
                    if (nodePath.node.name !== controller.name) {
                        return;
                    }

                    if (
                        nodePath?.parentPath?.node?.type === 'ClassDeclaration' &&
                        nodePath?.parentPath?.parentPath?.node?.type === 'ExportNamedDeclaration'
                    ) {
                        importType = 'ImportSpecifier';
                        exportName = controller.name;
                        nodePath.stop();
                        return;
                    }

                    if (
                        nodePath?.parentPath?.node?.type === 'ExportSpecifier' &&
                        nodePath?.parentPath?.node?.exported?.type === 'Identifier'
                    ) {
                        importType = 'ImportSpecifier';
                        exportName = nodePath?.parentPath?.node?.exported?.name;
                        nodePath.stop();
                        return;
                    }

                    if (nodePath?.parentPath?.node?.type === 'ExportDefaultDeclaration') {
                        importType = 'ImportDefaultSpecifier';
                        exportName = nodePath?.node?.name;
                        nodePath.stop();
                        return;
                    }

                    if (
                        nodePath?.parentPath?.node?.type === 'ClassDeclaration' &&
                        nodePath?.parentPath?.parentPath?.node?.type === 'ExportDefaultDeclaration'
                    ) {
                        importType = 'ImportDefaultSpecifier';
                        exportName = nodePath?.node?.name;
                        nodePath.stop();
                        return;
                    }
                },
            });

            if ((!importType && !description.importType) || (!exportName && !description.exportName)) {
                continue;
            }

            const controllerItem = this.findControllerListPath(
                pathname.split('.').slice(0, -1).join('.'),
                result,
            );

            if (!controllerItem) {
                continue;
            }

            controllerItem.children.push({
                path: pathname.split('.').pop(),
                children: [],
                controllerDescriptor: {
                    exportName: description.exportName || exportName,
                    filePath: absoluteFilePath,
                    importType: description.importType || importType,
                    name: controller.name,
                },
            });
        }

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

    private findControllerListPath(pathname: string, controllerList: ControllerPath[]) {
        if (!pathname || !controllerList || !Array.isArray(controllerList)) {
            return null;
        }

        const pathnameSegments = pathname.split('.');
        let currentList = controllerList;
        let result: ControllerPath;

        while (pathnameSegments.length > 0) {
            const currentPathnameSegment = pathnameSegments.shift();
            result = currentList.find((listItem) => listItem.path === currentPathnameSegment);

            if (!result) {
                result = {
                    path: currentPathnameSegment,
                    children: [],
                };
                currentList.push(result);
            }

            currentList = result.children;
        }

        return result;
    }
}

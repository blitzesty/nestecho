import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs-extra';
import {
    ControllerPath,
    ControllerTemplateDescriptor,
    DescribeDecoratorOptions,
    GeneratorOptions,
    ImportType,
    Options,
    TemplateContext,
} from './interfaces';
import {
    ensureImport,
    loadConfig,
    parseAst,
} from './utils';
import {
    DynamicModule,
    ForwardReference,
    RequestMethod,
    Type,
} from '@nestjs/common';
import {
    FILE_PATH,
    NESTECHO_DESCRIPTION,
    NESTECHO_EXCLUDE,
} from './constants';
import traverse from '@babel/traverse';
import * as Handlebars from 'handlebars';
import generate from '@babel/generator';
import { globSync } from 'glob';
import { ParseResult } from '@babel/parser';
import { File } from '@babel/types';

interface CustomFileProcessorContext {
    entryAst: ParseResult<File>;
    entryControllerPaths: ControllerPath[];
    rawContent: string;
    templateContext: TemplateContext;
}

export class Generator {
    protected outputAbsolutePath: string;
    protected projectConfig: Options;
    protected result: Record<string, string> = {};
    protected workDir: string;
    protected customFileProcessors: Record<string, (context: CustomFileProcessorContext) => string> = {
        '{{outputCodeFolder}}/index.ts': ({
            entryAst,
            templateContext,
            rawContent,
        }) => {
            const contentTemplate = Handlebars.compile(rawContent);
            return [
                generate(entryAst).code,
                contentTemplate(templateContext),
            ].join('\n');
        },
    };
    protected readonly internalTemplateAbsolutePath = path.resolve(__dirname, '../templates');

    private controllerDescriptors: ControllerTemplateDescriptor[] = [];
    private entryAst: ParseResult<File>;
    private entryControllerPaths: ControllerPath[] = [];

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
        this.outputAbsolutePath = path.resolve(this.workDir, this.projectConfig.outputDir);
    }

    public generate() {
        this.generateControllers();

        let fileTemplatePaths = globSync(this.internalTemplateAbsolutePath + '/**/*.hbs')
            .map((fileTemplatePath) => path.relative(this.internalTemplateAbsolutePath, fileTemplatePath))
            .map((fileTemplateRelativePath) => fileTemplateRelativePath.replace(/\.hbs$/g, ''));

        for (const fileTemplatePath of fileTemplatePaths) {
            this.generateFileFromTemplate(fileTemplatePath);
        }

        return this.result;
    }

    protected generateControllers() {
        this.entryAst = parseAst('');

        const allControllers = this.findAllControllers(this.appModule);
        const paths: string[] = [];

        for (const controller of allControllers) {
            const fileAbsolutePath = Reflect.getMetadata(FILE_PATH, controller);
            let pathname: string;

            if (
                !fileAbsolutePath ||
                typeof fileAbsolutePath !== 'string' ||
                Reflect.getMetadata(NESTECHO_EXCLUDE, controller)
            ) {
                continue;
            }

            try {
                pathname = this.projectConfig.controllerScheme({
                    filePath: fileAbsolutePath,
                    name: controller.name,
                    workDir: this.workDir,
                });
            } catch (e) {
                continue;
            }

            if (!pathname || typeof pathname !== 'string' || paths.includes(pathname)) {
                continue;
            }

            paths.push(pathname);

            let importType: ImportType;
            let exportName: string;
            const ast = parseAst(fs.readFileSync(fileAbsolutePath).toString());
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

                        if (!exportName) {
                            exportName = path.basename(fileAbsolutePath).split('.').slice(0, -1).join('.');
                        }

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
                this.entryControllerPaths,
            );

            if (!controllerItem) {
                continue;
            }

            const controllerDescriptorWithoutImportName: Omit<ControllerTemplateDescriptor, 'importName'> = {
                exportName: description.exportName || exportName,
                filePath: fileAbsolutePath,
                importType: description.importType || importType,
                methods: Object.entries(Object.getOwnPropertyDescriptors(controller.prototype)).reduce((result, [methodName, descriptor]) => {
                    const pathname = Reflect.getMetadata('path', descriptor?.value);
                    const methodIndex = Reflect.getMetadata('method', descriptor?.value);

                    if (
                        !pathname ||
                        typeof methodIndex !== 'number' ||
                        Reflect.getMetadata(NESTECHO_EXCLUDE, controller.prototype?.[methodName])
                    ) {
                        return result;
                    }

                    const method = Object.getOwnPropertyDescriptors(RequestMethod)?.[methodIndex]?.value;

                    result[methodName] = {
                        method,
                        path: pathname,
                    };

                    return result;
                }, {}),
                name: controller.name,
            };

            if (!Object.keys(controllerDescriptorWithoutImportName.methods).length) {
                continue;
            }

            const [importName] = ensureImport({
                ast: this.entryAst,
                type: controllerDescriptorWithoutImportName.importType,
                identifier: controllerDescriptorWithoutImportName.exportName,
                sourceMatcher: new RegExp(path.basename(fileAbsolutePath.split('.').slice(0, -1).join('.')), 'g'),
                source: '.' + path.sep + path.relative(
                    path.resolve(
                        this.outputAbsolutePath,
                        this.projectConfig.outputCodeDir,
                    ),
                    path.resolve(
                        this.outputAbsolutePath,
                        this.projectConfig.outputCodeDir,
                        this.projectConfig.controllersOutputDir,
                        path.relative(
                            path.resolve(
                                this.workDir,
                                this.projectConfig.sourceCodeDir,
                            ),
                            fileAbsolutePath,
                        ),
                    ),
                ),
                addImport: true,
            });
            const controllerDescriptor: ControllerTemplateDescriptor = {
                ...controllerDescriptorWithoutImportName,
                importName,
            };

            controllerItem.children.push({
                path: pathname.split('.').pop(),
                children: [],
                controllerDescriptor,
            });
            this.controllerDescriptors.push(controllerDescriptor);
        }
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

    private generateFileFromTemplate(filePath: string) {
        const customTemplateFileRelativePath = this.projectConfig.templateReplacements[filePath];
        let templateFileAbsolutePath: string;
        let fileRawContent: string;
        const outputCodeFolder = path.relative(this.workDir, path.resolve(this.workDir, this.projectConfig.outputCodeDir));

        if (customTemplateFileRelativePath && typeof customTemplateFileRelativePath === 'string') {
            templateFileAbsolutePath = path.resolve(
                this.workDir,
                this.projectConfig.templateDir,
                customTemplateFileRelativePath,
            );
        } else if (customTemplateFileRelativePath === true || typeof customTemplateFileRelativePath === 'undefined') {
            templateFileAbsolutePath = path.resolve(this.internalTemplateAbsolutePath, filePath);
        } else if (customTemplateFileRelativePath === false) {
            return false;
        }

        try {
            fileRawContent = fs.readFileSync(templateFileAbsolutePath + '.hbs').toString();
        } catch (e) {}

        if (!fileRawContent) {
            return false;
        }

        const fileTemplate = Handlebars.compile(fileRawContent);
        const pathTemplate = Handlebars.compile(filePath);
        const pathname = pathTemplate({
            outputCodeFolder,
        });
        let fileContent: string;
        const customProcessor = this.customFileProcessors[filePath];
        const templateContext = this.getTemplateContext();

        if (typeof customProcessor === 'function') {
            fileContent = customProcessor({
                entryAst: this.entryAst,
                entryControllerPaths: this.entryControllerPaths,
                rawContent: fileRawContent,
                templateContext,
            });
        } else {
            fileContent = fileTemplate(templateContext);
        }

        this.result[path.resolve(this.outputAbsolutePath, pathname)] = fileContent;

        return true;
    }

    private getTemplateContext(): TemplateContext {
        return {
            projectConfig: this.projectConfig,
            workDir: this.workDir,
            outputAbsolutePath: this.outputAbsolutePath,
            paths: this.entryControllerPaths,
        };
    }
}

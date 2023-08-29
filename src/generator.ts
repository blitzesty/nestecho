import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs-extra';
import {
    ControllerPath,
    ControllerDescriptor,
    DescribeDecoratorOptions,
    GeneratorOptions,
    ImportType,
    Options,
    TemplateContext,
    ControllerMethodDescriptor,
    MethodOptionsMap,
} from './interfaces';
import {
    ensureImport,
    isInReturnTypeAnnotation,
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
    ROUTE_PARAM_TYPES,
} from './constants';
import traverse from '@babel/traverse';
import * as Handlebars from 'handlebars';
import generate from '@babel/generator';
import { globSync } from 'glob';
import { ParseResult } from '@babel/parser';
import {
    File,
    ImportDeclaration,
    ImportDefaultSpecifier,
    ImportSpecifier,
    Statement,
    TSTypeAnnotation,
    blockStatement,
    identifier,
    tsPropertySignature,
    tsTypeAnnotation,
    tsTypeLiteral,
    tsTypeParameterInstantiation,
} from '@babel/types';
import * as _ from 'lodash';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import template from '@babel/template';

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

    private controllerDescriptors: ControllerDescriptor[] = [];
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
            let noExplicitName = false;
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
                            noExplicitName = true;
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

            const controllerDescriptorWithoutImportName: Omit<ControllerDescriptor, 'importName'> = {
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
                    const routeArgsMetadata: Record<string, {
                        index: number;
                        data: object | string | number | undefined;
                        pipes: any[];
                    }> = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, methodName) ?? {};

                    result[methodName] = {
                        method,
                        path: pathname,
                        routeParams: Object
                            .entries(routeArgsMetadata)
                            .map(([key, metadata]) => {
                                const [routeParamTypeIndex] = key.split(':');
                                const routeParamType = ROUTE_PARAM_TYPES[routeParamTypeIndex];

                                if (
                                    !metadata ||
                                    typeof metadata?.index !== 'number' ||
                                    !routeParamType ||
                                    typeof metadata?.data !== 'string' ||
                                    typeof metadata?.data !== 'undefined' ||
                                    (typeof metadata?.data === 'undefined' && routeParamType !== 'body')
                                ) {
                                    return null;
                                }

                                return {
                                    index: metadata?.index,
                                    mappedName: metadata?.data,
                                    type: routeParamType,
                                };
                            })
                            .filter((metadata) => !!metadata),
                    };

                    return result;
                }, {} as Record<string, ControllerMethodDescriptor>),
                name: controller.name,
                noExplicitName,
                path: Reflect.getMetadata('path', controller),
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
            const controllerDescriptor: ControllerDescriptor = {
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

    protected transpileAndGenerateControllers() {
        const controllerFilePaths = _.uniq(this.controllerDescriptors.map(({ filePath }) => filePath));

        for (const controllerFilePath of controllerFilePaths) {
            let content: string;
            const controllerFileRelativePath = path.relative(
                path.resolve(
                    this.workDir,
                    this.projectConfig.sourceCodeDir,
                ),
                controllerFilePath,
            );

            try {
                content = fs.readFileSync(controllerFilePath).toString();
            } catch (e) {
                continue;
            }

            if (!content) {
                continue;
            }

            const ast = parseAst(content);
            const controllerDescriptors = this.controllerDescriptors.filter(({ filePath }) => filePath === controllerFilePath);
            const ensuredImportMap: Record<string, [string, string]> = {
                request: ensureImport({
                    ast,
                    identifier: 'request',
                    addImport: true,
                    type: 'ImportSpecifier',
                    source: path.relative(
                        path.resolve(
                            this.outputAbsolutePath,
                            this.projectConfig.outputCodeDir,
                            this.projectConfig.controllersOutputDir,
                            controllerFileRelativePath,
                        ),
                        path.resolve(
                            this.outputAbsolutePath,
                            this.projectConfig.outputCodeDir,
                            'request',
                        ),
                    ),
                    sourceMatcher: /\@blitzesty\/nestecho/g,
                }),
                ...(this.projectConfig.ensureImports.reduce((result, ensureImportOptions) => {
                    result[ensureImportOptions.identifier] = ensureImport({
                        ast,
                        ...ensureImportOptions,
                    });
                    return result;
                }, {})),
            };
            const importedDtoIdentifierNames = ast.program.body
                .filter((declaration) => declaration?.type === 'ImportDeclaration')
                .reduce((result: Array<ImportSpecifier | ImportDefaultSpecifier>, declaration: ImportDeclaration) => {
                    return result.concat((declaration.specifiers || []).filter((specifier) => {
                        const source = declaration.source.value;
                        let matched = false;
                        let matcher = this.projectConfig.dtoImportMatcher?.sourceMatcher;

                        if (typeof matcher === 'string') {
                            matched = matcher === source;
                        } else if (_.isRegExp(matcher)) {
                            matched = matcher.test(source);
                        } else if (typeof matcher === 'function') {
                            matched = matcher(source);
                        }

                        return (specifier.type === 'ImportSpecifier' || specifier.type === 'ImportDefaultSpecifier') && matched;
                    }) as Array<ImportSpecifier | ImportDefaultSpecifier>);
                }, [] as Array<ImportSpecifier | ImportDefaultSpecifier>)
                .map((specifier) => specifier.local.name);
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const generatorContext = this;

            ast.program.body.unshift(template.ast('import \'reflect-metadata\';') as Statement);

            traverse(ast, {
                ClassDeclaration(nodePath1) {
                    let controllerDescriptor: ControllerDescriptor;

                    controllerDescriptor = controllerDescriptors.find(({
                        noExplicitName,
                        name,
                    }) => {
                        return (!noExplicitName && !nodePath1?.node?.id) || nodePath1?.node?.id?.name === name;
                    });

                    if (!controllerDescriptor) {
                        return;
                    }

                    traverse(
                        nodePath1?.node,
                        {
                            ClassMethod(nodePath2) {
                                if (nodePath2?.node?.key?.type !== 'Identifier' || !controllerDescriptor.methods?.[nodePath2?.node?.key?.name]) {
                                    nodePath2.remove();
                                    return;
                                }

                                const methodDescriptor = controllerDescriptor.methods[nodePath2?.node?.key?.name];
                                const optionsIdentifier = identifier('options');
                                const methodOptionsMap: MethodOptionsMap = {};

                                if (!methodDescriptor) {
                                    nodePath2.remove();
                                    return;
                                }

                                optionsIdentifier.optional = true;
                                optionsIdentifier.typeAnnotation = tsTypeAnnotation(
                                    tsTypeLiteral(
                                        methodDescriptor?.routeParams?.map((routeParam) => {
                                            const {
                                                index,
                                                type,
                                                mappedName,
                                            } = routeParam;
                                            const param = nodePath2?.node?.params?.[index];

                                            if (!param) {
                                                return null;
                                            }

                                            let currentIdentifier: string;
                                            let annotation: TSTypeAnnotation;
                                            let required = true;

                                            switch (param.type) {
                                                case 'Identifier':
                                                    currentIdentifier = param.name;
                                                    if (param.typeAnnotation?.type === 'TSTypeAnnotation') {
                                                        annotation = param.typeAnnotation;
                                                    }
                                                    break;
                                                case 'AssignmentPattern':
                                                    if (param.left.type === 'Identifier') {
                                                        currentIdentifier = param.left.name;
                                                        if (param?.left?.typeAnnotation?.type === 'TSTypeAnnotation') {
                                                            annotation = param.left.typeAnnotation;
                                                        }
                                                        required = false;
                                                    }
                                                    break;
                                                default:
                                                    break;
                                            }

                                            if (!currentIdentifier || !annotation) {
                                                return null;
                                            }

                                            const propertySignature = tsPropertySignature(identifier(currentIdentifier), annotation);

                                            propertySignature.optional = !required;

                                            if (!methodOptionsMap[type]) {
                                                methodOptionsMap[type] = {};
                                            }

                                            methodOptionsMap[type][currentIdentifier] = mappedName;

                                            return propertySignature;
                                        }),
                                    ),
                                );

                                const newBody = template.ast(generatorContext.projectConfig.methodGenerator({
                                    controllerDescriptor,
                                    methodDescriptor: controllerDescriptor.methods[nodePath2?.node?.key?.name],
                                    ensuredImportMap,
                                    methodName: nodePath2?.node?.key?.name,
                                    methodOptionsMap,
                                }));

                                nodePath2.node.params = [optionsIdentifier];
                                nodePath2.node.body = blockStatement(Array.isArray(newBody) ? newBody : [newBody]);
                            },
                        },
                        nodePath1.scope,
                    );

                    traverse(
                        nodePath1.node,
                        {
                            TSTypeReference(nodePath2) {
                                if (
                                    nodePath2?.node?.typeName?.type === 'Identifier' &&
                                    importedDtoIdentifierNames.includes(nodePath2?.node?.typeName?.name) &&
                                    !isInReturnTypeAnnotation(nodePath2)
                                ) {
                                    nodePath2.node.typeParameters = tsTypeParameterInstantiation([
                                        _.clone(nodePath2.node),
                                    ]);
                                    nodePath2.node.typeName = identifier(ensuredImportMap.DeepPartial[0]);
                                }
                            },
                        },
                        nodePath1.scope,
                    );
                },
            });
        }
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
        } else if (typeof customTemplateFileRelativePath === 'undefined') {
            templateFileAbsolutePath = path.resolve(this.internalTemplateAbsolutePath, filePath);
        } else {
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

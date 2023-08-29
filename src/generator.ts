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
    ImportItem,
} from './interfaces';
import {
    ensureImport,
    getImports,
    lintCode,
    loadConfig,
    parseAst,
    removeDecorators,
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
    Identifier,
    Statement,
    TSTypeAnnotation,
    TSTypeReference,
    blockStatement,
    identifier,
    tsAnyKeyword,
    tsPropertySignature,
    tsTypeAnnotation,
    tsTypeLiteral,
    tsTypeParameterInstantiation,
    tsTypeReference,
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

    public async generate() {
        this.generateControllerDescriptors();

        let fileTemplatePaths = globSync(this.internalTemplateAbsolutePath + '/**/*.hbs')
            .map((fileTemplatePath) => path.relative(this.internalTemplateAbsolutePath, fileTemplatePath))
            .map((fileTemplateRelativePath) => fileTemplateRelativePath.replace(/\.hbs$/g, ''));

        for (const fileTemplatePath of fileTemplatePaths) {
            this.generateFileFromTemplate(fileTemplatePath);
        }

        await this.transpileAndGenerateControllers();
    }

    public write() {
        if (fs.existsSync(this.outputAbsolutePath)) {
            fs.removeSync(this.outputAbsolutePath);
        }

        Object.entries(this.result).forEach(([filePath, fileContent]) => {
            const dirPath = path.dirname(filePath);

            if (fs.existsSync(dirPath) && !fs.statSync(dirPath).isDirectory()) {
                fs.removeSync(dirPath);
            }

            if (!fs.existsSync(dirPath)) {
                fs.mkdirpSync(dirPath);
            }

            fs.writeFileSync(filePath, fileContent, 'utf-8');
        });
    }

    protected generateControllerDescriptors() {
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
                                    (typeof metadata?.data !== 'string' && routeParamType !== 'body')
                                ) {
                                    return null;
                                }

                                return {
                                    index: metadata?.index,
                                    mappedName: metadata?.data as string,
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

    protected async transpileAndGenerateControllers() {
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
            const controllerFileOutputAbsolutePath = path.resolve(
                this.outputAbsolutePath,
                this.projectConfig.outputCodeDir,
                this.projectConfig.controllersOutputDir,
                controllerFileRelativePath,
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
                        path.dirname(
                            path.resolve(
                                this.outputAbsolutePath,
                                this.projectConfig.outputCodeDir,
                                this.projectConfig.controllersOutputDir,
                                controllerFileRelativePath,
                            ),
                        ),
                        path.resolve(
                            this.outputAbsolutePath,
                            this.projectConfig.outputCodeDir,
                            'request',
                        ),
                    ),
                    sourceMatcher: /request/g,
                }),
                ...(this.projectConfig.ensureImports.reduce((result, ensureImportOptions) => {
                    result[ensureImportOptions.identifier] = ensureImport({
                        ast,
                        ...ensureImportOptions,
                    });
                    return result;
                }, {})),
            };
            const importItems = getImports(ast);
            const importedDtoSpcifiers = Array
                .from(importItems)
                .reduce((result: Array<[ImportItem, string]>, importItem: ImportItem) => {
                    let matched = false;
                    let matcher = this.projectConfig.dtoImportMatcher?.sourceMatcher;
                    const source = importItem.source;
                    const currentResult = Array.from(result);

                    if (typeof matcher === 'string') {
                        matched = matcher === source;
                    } else if (_.isRegExp(matcher)) {
                        matched = matcher.test(source);
                    } else if (typeof matcher === 'function') {
                        matched = matcher(source);
                    }

                    if (!matched) {
                        return result;
                    }

                    currentResult.push(([importItem, source] as [ImportItem, string]));

                    return currentResult;
                }, [] as Array<[ImportItem, string]>);
            const allowedDecoratorImports = importItems.filter((importItem) => !this.projectConfig.decoratorRemovableChecker(importItem));
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
                                if (
                                    nodePath2?.node?.key?.type !== 'Identifier' ||
                                    nodePath2?.node?.key?.name === 'constructor'
                                ) {
                                    return nodePath2.remove();
                                }

                                const methodDescriptor = controllerDescriptor.methods?.[nodePath2?.node?.key?.name];
                                const optionsIdentifier = identifier('options');
                                const methodOptionsMap: MethodOptionsMap = {};

                                if (!methodDescriptor) {
                                    return nodePath2.remove();
                                }

                                if (nodePath2?.node?.key?.name === 'createOrUpdateDataset') {
                                    console.log(JSON.stringify(methodDescriptor));
                                }

                                const signatures = (methodDescriptor?.routeParams || [])?.map((routeParam) => {
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
                                    if ((nodePath2 as any)?.node?.key?.name === 'createOrUpdateDataset') {
                                        console.log('lenconda:1');
                                    }
                                    methodOptionsMap[type][currentIdentifier] = mappedName || null;

                                    return propertySignature;
                                }).filter((signature) => !!signature);

                                optionsIdentifier.optional = true;
                                optionsIdentifier.typeAnnotation = tsTypeAnnotation((
                                    signatures?.length > 0
                                        ? tsTypeLiteral(signatures)
                                        : tsAnyKeyword()
                                ));

                                const newBody = template.ast(generatorContext.projectConfig.methodGenerator({
                                    controllerDescriptor,
                                    methodDescriptor: controllerDescriptor.methods[nodePath2?.node?.key?.name],
                                    ensuredImportMap,
                                    methodName: nodePath2?.node?.key?.name,
                                    methodOptionsMap,
                                }));

                                nodePath2.node.params = signatures.length > 0 ? [optionsIdentifier] : [];
                                nodePath2.node.body = blockStatement(Array.isArray(newBody) ? newBody : [newBody]);
                                nodePath2.node.returnType = tsTypeAnnotation(
                                    tsTypeReference(
                                        identifier(ensuredImportMap?.['Response']?.[0] || 'Response'),
                                        tsTypeParameterInstantiation([
                                            tsTypeReference(
                                                identifier('Awaited'),
                                                tsTypeParameterInstantiation([
                                                    (nodePath2.node?.returnType as TSTypeAnnotation)?.typeAnnotation ?? tsAnyKeyword(),
                                                ]),
                                            ),
                                            tsTypeReference(identifier(ensuredImportMap?.['ResponseError']?.[0])),
                                        ]),
                                    ),
                                );
                                removeDecorators(nodePath2.node, allowedDecoratorImports);
                                (nodePath2?.node?.params || []).forEach((param) => {
                                    const shouldAddGenericTypeParams: TSTypeReference[] = [];

                                    traverse(
                                        param,
                                        {
                                            TSTypeReference(nodePath2) {
                                                if (nodePath2?.node?.typeName?.type !== 'Identifier') {
                                                    return;
                                                }

                                                if (!importedDtoSpcifiers.some(([specifier]) => {
                                                    return specifier.local === (nodePath2.node.typeName as Identifier).name;
                                                })) {
                                                    return;
                                                }

                                                shouldAddGenericTypeParams.push(nodePath2.node);
                                            },
                                        },
                                        nodePath2.scope,
                                    );

                                    shouldAddGenericTypeParams.reverse().forEach((param) => {
                                        param.typeParameters = tsTypeParameterInstantiation([_.clone(param)]);
                                        param.typeName = identifier(ensuredImportMap?.['DeepPartial']?.[0]);
                                    });
                                });
                            },
                        },
                        nodePath1.scope,
                    );

                    removeDecorators(nodePath1.node, allowedDecoratorImports);
                },
            });

            const code = await lintCode(generate(ast)?.code);

            this.result[controllerFileOutputAbsolutePath] = code;
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
        const templateFileAbsolutePath = path.resolve(this.internalTemplateAbsolutePath, filePath);
        let fileRawContent: string;
        const outputCodeFolder = path.relative(this.workDir, path.resolve(this.workDir, this.projectConfig.outputCodeDir));

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

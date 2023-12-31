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
    getImports,
    lintCode,
    loadConfig,
    parseAst,
    removeDecorators,
    removeUnusedImports,
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
import traverse, { NodePath } from '@babel/traverse';
import * as Handlebars from 'handlebars';
import generate from '@babel/generator';
import { globSync } from 'glob';
import {
    Identifier,
    Statement,
    TSTypeAnnotation,
    blockStatement,
    exportNamedDeclaration,
    identifier,
    tsAnyKeyword,
    tsInterfaceBody,
    tsInterfaceDeclaration,
    tsPropertySignature,
    tsTypeAliasDeclaration,
    tsTypeAnnotation,
    tsTypeParameterInstantiation,
    tsTypeReference,
} from '@babel/types';
import * as _ from 'lodash';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import template from '@babel/template';

export class Generator {
    protected outputAbsolutePath: string;
    protected projectConfig: Options;
    protected result: Record<string, string> = {};
    protected workDir: string;
    protected readonly internalTemplateAbsolutePath = path.resolve(__dirname, '../templates');

    private controllerDescriptors: ControllerDescriptor[] = [];
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

        Handlebars.registerHelper('switch', function(value, options) {
            // eslint-disable-next-line @typescript-eslint/no-invalid-this
            this.switch_value = value;
            // eslint-disable-next-line @typescript-eslint/no-invalid-this
            return options.fn(this);
        });
        Handlebars.registerHelper('case', function(value, options) {
            // eslint-disable-next-line @typescript-eslint/no-invalid-this
            if (value === this.switch_value) {
                // eslint-disable-next-line @typescript-eslint/no-invalid-this
                return options.fn(this);
            }
        });
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
                            exportName = _.startCase(
                                path
                                    .basename(fileAbsolutePath)
                                    .split('.')
                                    .slice(0, -1)
                                    .join('_'),
                            )
                                .split(/\s+/g)
                                .join('');
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

            const controllerDescriptor: ControllerDescriptor = {
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
                importName: description.exportName || exportName,
            };

            if (!Object.keys(controllerDescriptor.methods).length) {
                continue;
            }

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
            const allowedDecoratorImports = importItems.filter((importItem) => !this.projectConfig.decoratorRemovableChecker(importItem));
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const generatorContext = this;
            let lastImportDeclarationIndex = -1;
            const generatedInterfaces: string[] = [];

            ast.program.body.unshift(template.ast('import \'reflect-metadata\';') as Statement);
            ast.program.body.forEach((declaration, index) => {
                if (declaration.type === 'ImportDeclaration') {
                    lastImportDeclarationIndex = index;
                }
            });

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

                                const methodName = nodePath2?.node?.key?.name;
                                const methodStartCaseName = _.startCase(methodName).split(/\s+/g).join('');
                                const methodDescriptor = controllerDescriptor.methods?.[methodName];
                                let optionsIdentifier: Identifier;
                                const methodOptionsMap: MethodOptionsMap = {};
                                const responseTypeIdentifierName = `${methodStartCaseName}Response`;
                                const requestTypeIdentifierName = `${methodStartCaseName}RequestOptions`;

                                if (!methodDescriptor) {
                                    return nodePath2.remove();
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
                                            }
                                            break;
                                        default:
                                            break;
                                    }

                                    if (!currentIdentifier || !annotation) {
                                        return null;
                                    }

                                    const propertySignature = tsPropertySignature(identifier(currentIdentifier), annotation);

                                    propertySignature.optional = true;

                                    if (!methodOptionsMap[type]) {
                                        methodOptionsMap[type] = {};
                                    }

                                    methodOptionsMap[type][currentIdentifier] = mappedName || null;

                                    return propertySignature;
                                }).filter((signature) => !!signature);

                                if (signatures.length > 0) {
                                    ast.program.body.splice(
                                        lastImportDeclarationIndex,
                                        0,
                                        exportNamedDeclaration(
                                            tsInterfaceDeclaration(
                                                identifier(requestTypeIdentifierName),
                                                null,
                                                [],
                                                tsInterfaceBody(signatures),
                                            ),
                                        ),
                                    );
                                    optionsIdentifier = identifier('options');
                                    optionsIdentifier.optional = true;
                                    optionsIdentifier.typeAnnotation = tsTypeAnnotation(
                                        tsTypeReference(
                                            identifier(requestTypeIdentifierName),
                                        ),
                                    );
                                    generatedInterfaces.push(requestTypeIdentifierName);
                                }

                                const newBody = generatorContext.projectConfig.methodGenerator({
                                    controllerDescriptor,
                                    methodDescriptor: controllerDescriptor.methods[nodePath2?.node?.key?.name],
                                    ensuredImportMap,
                                    methodName: nodePath2?.node?.key?.name,
                                    methodOptionsMap,
                                    requestTypeIdentifierName,
                                    responseTypeIdentifierName,
                                });

                                nodePath2.node.params = optionsIdentifier ? [optionsIdentifier] : [];
                                nodePath2.node.body = blockStatement(Array.isArray(newBody) ? newBody : [newBody]);
                                ast.program.body.splice(
                                    lastImportDeclarationIndex,
                                    0,
                                    exportNamedDeclaration(
                                        tsTypeAliasDeclaration(
                                            identifier(responseTypeIdentifierName),
                                            null,
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
                                        ),
                                    ),
                                );
                                nodePath2.node.returnType = tsTypeAnnotation(
                                    tsTypeReference(
                                        identifier('Promise'),
                                        tsTypeParameterInstantiation([
                                            tsTypeReference(identifier(responseTypeIdentifierName)),
                                        ]),
                                    ),
                                );
                                removeDecorators(nodePath2.node, allowedDecoratorImports);
                            },
                        },
                        nodePath1.scope,
                    );

                    removeDecorators(nodePath1.node, allowedDecoratorImports);
                },
            });
            traverse(ast, {
                TSInterfaceDeclaration(nodePath1) {
                    const identifierNodePaths: NodePath<Identifier>[] = [];

                    if (!generatedInterfaces.includes(nodePath1.node.id.name)) {
                        return;
                    }

                    traverse(
                        nodePath1.node,
                        {
                            Identifier(nodePath2) {
                                if (nodePath2?.parentPath?.node?.type === 'TSTypeReference') {
                                    identifierNodePaths.push(nodePath2);
                                }
                            },
                        },
                        nodePath1.scope,
                    );

                    identifierNodePaths.reverse().forEach((identifierNodePath) => {
                        if (identifierNodePath?.parentPath?.node?.type !== 'TSTypeReference') {
                            return;
                        }

                        const originalIdentifier = _.clone(identifierNodePath.parentPath.node);

                        identifierNodePath.parentPath.node.typeName = identifier(ensuredImportMap?.['DeepPartial']?.[0]);
                        identifierNodePath.parentPath.node.typeParameters = tsTypeParameterInstantiation([originalIdentifier]);
                    });
                },
            });
            removeUnusedImports(ast);

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
        const templateContext = this.getTemplateContext();

        fileContent = fileTemplate(templateContext);
        this.result[path.resolve(this.outputAbsolutePath, pathname)] = fileContent;

        return true;
    }

    private getTemplateContext(): TemplateContext {
        return {
            controllerSourceDescriptors: this.controllerDescriptors.map((controllerDescriptor) => {
                return {
                    ...controllerDescriptor,
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
                                controllerDescriptor.filePath.split('.').slice(0, -1).join('.'),
                            ),
                        ),
                    ),
                };
            }),
            outputAbsolutePath: this.outputAbsolutePath,
            paths: this.entryControllerPaths,
            projectConfig: this.projectConfig,
            workDir: this.workDir,
        };
    }
}

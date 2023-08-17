// import {
//     CodegenOptions,
//     ControllerClassExport,
//     EnsuredImportMap,
// ImportItem,
// } from './interfaces';
// import { TSTypeAnnotation } from '@babel/types';
// import traverse from '@babel/traverse';
// import {
//     controllerPathScheme,
//     ensureImport,
//     methodPathScheme,
//     parseAst,
// } from './utils';
// import * as _ from 'lodash';
// import { globSync } from 'glob';
// import * as fs from 'fs-extra';
// import * as path from 'path';

export class Codegen {
    // protected options: CodegenOptions;

    // public constructor(options: CodegenOptions) {
    //     const defaultOptions: Omit<CodegenOptions, 'apiBaseURL'> = {
    //         workDir: process.cwd(),
    //         outputDir: path.resolve(process.cwd(), 'sdk'),
    //         authGuardWhiteList: [
    //             'api-key',
    //         ],
    //         classTransformOptions: {
    //             groups: ['response'],
    //             excludeExtraneousValues: true,
    //             enableImplicitConversion: true,
    //         },
    //         controllerGlobPatterns: [
    //             '**/*.controller.ts',
    //         ],
    //         customizer: {
    //             controllers: [
    //                 {
    //                     imported: 'AdminApiController',
    //                     type: 'ImportSpecifier',
    //                     source: 'src/common',
    //                     pathScheme: (context) => {
    //                         const result = controllerPathScheme(context);

    //                         if (!result || typeof result !== 'string') {
    //                             return null;
    //                         }

    //                         return `/admin_api${context?.versioning && context?.version ? `/v${context?.version}` : ''}${result.startsWith('/') ? result : `/${result}`}`;
    //                     },
    //                 },
    //                 {
    //                     imported: 'ApiController',
    //                     type: 'ImportSpecifier',
    //                     source: 'src/common',
    //                     pathScheme: (context) => {
    //                         const result = controllerPathScheme(context);

    //                         if (!result || typeof result !== 'string') {
    //                             return null;
    //                         }

    //                         return `/api${context?.versioning && context?.version ? `/v${context?.version}` : ''}${result.startsWith('/') ? result : `/${result}`}`;
    //                     },
    //                 },
    //                 {
    //                     imported: 'Controller',
    //                     type: 'ImportSpecifier',
    //                     source: '@nestjs/common',
    //                     pathScheme: controllerPathScheme,
    //                 },
    //             ],
    //             httpMethodMap: {
    //                 GET: {
    //                     imported: 'Get',
    //                     source: '@nestjs/common',
    //                     type: 'ImportSpecifier',
    //                     pathScheme: methodPathScheme,
    //                 },
    //                 POST: {
    //                     imported: 'Post',
    //                     source: '@nestjs/common',
    //                     type: 'ImportSpecifier',
    //                     pathScheme: methodPathScheme,
    //                 },
    //                 PUT: {
    //                     imported: 'Put',
    //                     source: '@nestjs/common',
    //                     type: 'ImportSpecifier',
    //                     pathScheme: methodPathScheme,
    //                 },
    //                 PATCH: {
    //                     imported: 'Patch',
    //                     source: '@nestjs/common',
    //                     type: 'ImportSpecifier',
    //                     pathScheme: methodPathScheme,
    //                 },
    //                 DELETE: {
    //                     imported: 'Delete',
    //                     source: '@nestjs/common',
    //                     type: 'ImportSpecifier',
    //                     pathScheme: methodPathScheme,
    //                 },
    //             },
    //             ensureImports: [
    //                 {
    //                     identifier: 'PartialDeep',
    //                     type: 'ImportSpecifier',
    //                     source: /\@blitzesty\/nestjs\-sdk\-maker/g,
    //                     actualSource: '@blitzesty/nestjs-sdk-maker/dist/interfaces',
    //                 },
    //                 {
    //                     identifier: 'SDKResponse',
    //                     type: 'ImportSpecifier',
    //                     source: /\@blitzesty\/nestjs\-sdk\-maker/g,
    //                     actualSource: '@blitzesty/nestjs-sdk-maker/dist/interfaces',
    //                 },
    //                 {
    //                     identifier: 'DESERIALIZER',
    //                     type: 'ImportSpecifier',
    //                     source: /\@blitzesty\/nestjs\-sdk\-maker/g,
    //                     actualSource: '@blitzesty/nestjs-sdk-maker/dist/constants',
    //                 },
    //                 {
    //                     identifier: 'request',
    //                     type: 'ImportSpecifier',
    //                     source: /\@blitzesty\/nestjs\-sdk\-maker/g,
    //                     actualSource: '@blitzesty/nestjs-sdk-maker/dist/request',
    //                 },
    //                 {
    //                     identifier: 'plainToInstance',
    //                     type: 'ImportSpecifier',
    //                     actualSource: 'class-transformer',
    //                     source: /class\-transformer/g,
    //                 },
    //                 {
    //                     identifier: null,
    //                     type: 'ImportDefaultSpecifier',
    //                     actualSource: 'reflect-metadata',
    //                     source: /reflect\-metadata/g,
    //                 },
    //             ],
    //         },
    //         getReturnDto: (context) => {
    //             const returnTypeStatement: TSTypeAnnotation = context?.returnType as TSTypeAnnotation;

    //             if (returnTypeStatement?.type !== 'TSTypeAnnotation') {
    //                 return null;
    //             }

    //             try {
    //                 let dtoClassName: string;
    //                 traverse(
    //                     returnTypeStatement,
    //                     {
    //                         Identifier(nodePath) {
    //                             if (context?.dtoIdentifiers?.includes(nodePath.node.name)) {
    //                                 dtoClassName = nodePath.node.name;
    //                                 nodePath.stop();
    //                             }
    //                         },
    //                     },
    //                     context?.scope,
    //                 );
    //                 return dtoClassName;
    //             } catch (e) {
    //                 console.log(e);
    //                 return null;
    //             }
    //         },
    //         getAuthGuardTypes: (context) => {
    //             const {
    //                 scope,
    //                 decorators: decoratorExpressions,
    //                 importItems = [],
    //             } = context;
    //             const result: string[] = [];

    //             if (
    //                 !Array.isArray(decoratorExpressions) ||
    //                 !decoratorExpressions.length ||
    //                 !Array.isArray(importItems)
    //             ) {
    //                 return result;
    //             }

    //             const authGuardIdentifier = importItems.find((importItem) => {
    //                 return importItem.type === 'ImportSpecifier' && importItem.imported === 'AuthGuard' && importItem.source === '@nestjs/passport';
    //             })?.local;
    //             const useGuardsIdentifier = importItems.find((importItem) => {
    //                 return importItem.type === 'ImportSpecifier' && importItem.imported === 'UseGuards' && importItem.source === '@nestjs/common';
    //             })?.local;

    //             if (!authGuardIdentifier || !useGuardsIdentifier) {
    //                 return result;
    //             }

    //             for (const decoratorExpression of decoratorExpressions) {
    //                 traverse(
    //                     decoratorExpression,
    //                     {
    //                         Identifier(nodePath) {
    //                             if (
    //                                 nodePath.node.name === authGuardIdentifier &&
    //                                 nodePath?.parentPath?.node?.type === 'CallExpression' &&
    //                                 nodePath?.parentPath?.parentPath?.node?.type === 'CallExpression' &&
    //                                 nodePath?.parentPath?.parentPath?.node?.callee?.type === 'Identifier' &&
    //                                 nodePath?.parentPath?.parentPath?.node?.callee?.name === useGuardsIdentifier &&
    //                                 nodePath?.parentPath?.parentPath?.parentPath?.node?.type === 'Decorator' &&
    //                                 nodePath?.parentPath?.parentPath?.node?.arguments?.length > 0
    //                             ) {
    //                                 traverse(
    //                                     nodePath?.parentPath?.node?.arguments?.[0],
    //                                     {
    //                                         StringLiteral(stringLiteralNodePath) {
    //                                             if (stringLiteralNodePath?.node?.value) {
    //                                                 result.push(stringLiteralNodePath?.node?.value);
    //                                             }
    //                                         },
    //                                     },
    //                                     nodePath?.parentPath?.scope,
    //                                 );
    //                             }
    //                         },
    //                     },
    //                     scope,
    //                 );
    //             }

    //             return result;
    //         },
    //     };

    //     const mergedOptions = _.merge(
    //         _.cloneDeep(defaultOptions),
    //         options,
    //     );

    //     mergedOptions.customizer.ensureImports = defaultOptions.customizer.ensureImports.concat(mergedOptions.customizer.ensureImports);

    //     this.options = mergedOptions;
    // }

    // public async generate() {
    //     this.scanControllers();
    // }

    // private scanControllers() {
    //     let ignore: string[] = [];

    //     try {
    //         ignore = fs.readFileSync(path.resolve(__dirname, '../.gitignore'))
    //             .toString()
    //             .split(/\n|\r\n/g)
    //             .filter((item) => !!item);
    //     } catch (e) {
    //         ignore = [
    //             'node_modules/**/*',
    //             '.vscode/**/*',
    //             '.idea/**/*',
    //             '.git/**/*',
    //             'dist/**/*',
    //             'build/**/*',
    //         ];
    //     }

    //     console.log(ignore);

    //     const controllerFilePaths = globSync(this.options.controllerGlobPatterns, {
    //         cwd: this.options.workDir,
    //         nodir: true,
    //         ignore,
    //     });

    //     console.log(controllerFilePaths);

    //     for (const controllerFilePath of controllerFilePaths) {
    //         try {
    //             const code = fs.readFileSync(path.resolve(this.options.workDir, controllerFilePath)).toString();
    //             const ast = parseAst(code);
    //             // TODO:
    //             // eslint-disable-next-line @typescript-eslint/no-unused-vars
    //             const ensuredImportMap: EnsuredImportMap = (this?.options?.customizer?.ensureImports ?? []).reduce((result: EnsuredImportMap, ensureImportItem) => {
    //                 const {
    //                     type: importType,
    //                     identifier,
    //                     actualSource,
    //                 } = ensureImportItem;
    //                 const ensureImportResult = ensureImport({
    //                     ast,
    //                     ...ensureImportItem,
    //                 });
    //                 const exportedControllers: ControllerClassExport[] = [];

    //                 if (ensureImportResult && ensureImportResult.length === 2) {
    //                     result[`${identifier}@${actualSource}`] = {
    //                         imported: identifier,
    //                         local: ensureImportResult[0],
    //                         source: ensureImportResult[1],
    //                         type: importType,
    //                     };
    //                 }

    //                 traverse(ast, {
    //                     ExportNamedDeclaration(nodePath1) {
    //                         if (
    //                             nodePath1.node?.declaration?.type === 'ClassDeclaration'
    //                             // Object.keys(controllerDeclarationTypeMap).includes(nodePath1.node?.declaration?.id?.name)
    //                         ) {
    //                             const controllerName = nodePath1.node?.declaration?.id?.name;
    //                             exportedControllers.push({
    //                                 localName: controllerName,
    //                                 exportedName: controllerName,
    //                                 importType: 'ImportSpecifier',
    //                                 // controllerType: controllerDeclarationTypeMap?.[controllerName]?.type,
    //                                 // name: controllerDeclarationTypeMap?.[controllerName]?.name,
    //                             });
    //                         } else if (nodePath1.node?.specifiers?.length > 0) {
    //                             for (const specifier of nodePath1.node.specifiers) {
    //                                 if (
    //                                     specifier.type === 'ExportSpecifier' &&
    //                                     // Object.keys(controllerDeclarationTypeMap).includes(specifier.local.name) &&
    //                                     specifier.exported.type === 'Identifier'
    //                                 ) {
    //                                     exportedControllers.push({
    //                                         localName: specifier.local.name,
    //                                         exportedName: specifier.exported.name,
    //                                         importType: 'ImportSpecifier',
    //                                     });
    //                                 }
    //                             }
    //                         }
    //                     },
    //                     ExportDefaultDeclaration(nodePath1) {
    //                         if (nodePath1?.node?.declaration?.type === 'ClassDeclaration') {
    //                             if (
    //                                 !nodePath1?.node?.declaration?.id
    //                                 // Boolean(controllerDeclarationTypeMap[exportDefaultController])
    //                             ) {
    //                                 exportedControllers.push({
    //                                     localName: null,
    //                                     exportedName: null,
    //                                     importType: 'ImportDefaultSpecifier',
    //                                 });
    //                             } else {
    //                                 const controllerName = nodePath1.node.declaration.id.name;
    //                                 exportedControllers.push({
    //                                     localName: controllerName,
    //                                     exportedName: controllerName,
    //                                     importType: 'ImportDefaultSpecifier',
    //                                 });
    //                             }
    //                         } else if (
    //                             nodePath1.node.declaration.type === 'Identifier'
    //                             // Boolean(controllerDeclarationTypeMap[nodePath1.node.declaration.name])
    //                         ) {
    //                             const controllerName = nodePath1.node.declaration.name;
    //                             exportedControllers.push({
    //                                 localName: controllerName,
    //                                 exportedName: controllerName,
    //                                 importType: 'ImportDefaultSpecifier',
    //                             });
    //                         }
    //                     },
    //                 });

    //                 return result;
    //             }, {} as EnsuredImportMap);
    //         } catch (e) {
    //             continue;
    //         }
    //     }
    // }
}

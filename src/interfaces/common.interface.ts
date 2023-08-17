import {
    // CallExpression,
    // ClassMethod,
    // Expression,
    // Identifier,
    // TSTypeAnnotation,
    File,
    // Decorator,
} from '@babel/types';
// import { DeclarationFileType } from './declaration-file-type.enum';
import { ClassTransformOptions } from 'class-transformer';
import { AxiosRequestConfig } from 'axios';
// import {
// NodePath,
// Scope,
// } from '@babel/traverse';
import { ParseResult } from '@babel/parser';

// export interface SDKMakerOptions {
//     name: string;
//     templateDir?: string;
//     basicPackageName?: string;
// }

// export interface ImportItem {
//     path: string;
//     name: string;
//     aliasedName: string;
// }

// interface BaseDeclaration {
//     path: string;
//     name: string;
//     imports: ImportItem[];
// }

// export interface DTOClassDeclaration extends BaseDeclaration {
//     type: DeclarationFileType.DTO;
//     superClass: Identifier;
//     structure: Record<string, TSTypeAnnotation>;
// }

// export interface EnumDeclaration extends BaseDeclaration {
//     type: DeclarationFileType.ENUM;
//     structure: Record<string, Expression>;
// }

// export interface Context {
//     absolutePath: string;
// }

// export type Declaration = DTOClassDeclaration | EnumDeclaration;

///

// export interface CodegenOptions {
//     apiBaseURL: string;
//     outputDir?: string;
//     workDir?: string;
//     cleanupDirs?: string[];
//     authGuardWhiteList?: string[];
//     classTransformOptions?: ClassTransformOptions;
//     controllerGlobPatterns?: string[];
//     customizer?: Customizer;
//     requestOptions?: Omit<AxiosRequestConfig, 'url' | 'method' | 'baseURL'>;
//     version?: string;
//     versioning?: boolean;
//     getAuthGuardTypes?: GetAuthGuardTypes;
//     getReturnDto?: GetReturnDTO;
// }

export interface RequestOptionsContext {
    options: any;
};

export interface Options {
    apiBaseURL: string;
    appEntry?: string;
    appModule?: AppModuleOptions;
    classTransformOptions?: ClassTransformOptions;
    cleanupDirs?: string[];
    controllerPatterns?: string[];
    dtoImportMatcher?: DTOImportMatcher;
    outputDir?: string;
    sdkOptionsInterfaceDescriptor?: Required<Omit<EnsureImportInputOptions, 'addImport'>>;
    version?: string;
    versioning?: boolean;
    workDir?: string;
    requestOptions?: (context: RequestOptionsContext) => RequestOptions;
}

export interface AppModuleOptions {
    entry?: string;
    identifier?: string;
    importType?: ImportType;
}

export interface DTOImportMatcher {
    importType: ImportType[];
    sourceMatcher: RegExp;
}

export type RequestOptions = Omit<AxiosRequestConfig, 'url' | 'method' | 'baseURL'>;

// export interface GetReturnDTOContext {
//     returnType: TSTypeAnnotation;
//     scope: Scope;
//     dtoIdentifiers: string[];
// }

// export interface GetAuthGuardTypesContext {
//     decorators: Decorator[];
//     scope: Scope;
//     importItems: ImportItem[];
// }

// export type GetAuthGuardTypes = (context: GetAuthGuardTypesContext) => string[];
// export type GetReturnDTO = (context: GetReturnDTOContext) => string;
export type ImportType = 'ImportSpecifier' | 'ImportDefaultSpecifier' | 'ImportNamespaceSpecifier';
// export type HTTPMethodType = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
// export type DecoratorExpression = CallExpression | Identifier;

export interface EnsureImportOptions {
    ast: ParseResult<File>;
    type: ImportType;
    sourceMatcher: string | RegExp | ((sources: string[]) => string);
    source: string;
    identifier?: string;
    addImport?: boolean;
}

export type EnsureImportInputOptions = Omit<EnsureImportOptions, 'ast'>;

export interface ImportItem {
    imported: string;
    local: string;
    source: string;
    type: ImportType;
}

// export interface PathSchemeContext extends Required<Pick<CodegenOptions, 'versioning' | 'version'>> {
//     decoratorExpression: DecoratorExpression;
// }

// export type PathScheme = (context: PathSchemeContext) => string;

// export interface CustomControllerDecorator extends Omit<ImportItem, 'local'> {
//     pathScheme?: PathScheme;
// }

// export interface CustomHTTPMethodDecorator extends Omit<ImportItem, 'local'> {
//     pathScheme?: PathScheme;
// }

// export type CustomHTTPMethodDecoratorMap = Partial<Record<HTTPMethodType, CustomHTTPMethodDecorator>>;

// export interface Customizer {
//     controllers?: CustomControllerDecorator[];
//     httpMethodMap?: CustomHTTPMethodDecoratorMap;
//     ensureImports?: Omit<EnsureImportOption, 'ast'>[];
// }

// export interface ControllerClassExport {
// exportedName: string;
// importType: ImportType;
// localName: string;
// controller: CustomControllerDecorator;
// }

// export type EnsuredImportMap = Record<string, ImportItem>;

// export interface ControllerFileScanResult {
//     ast: ParseResult<File>;
//     code: string;
//     exports: ControllerClassExport[];
//     ensuredImportMap: EnsuredImportMap;
// }

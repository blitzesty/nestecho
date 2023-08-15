import {
    CallExpression,
    // ClassMethod,
    Expression,
    Identifier,
    TSTypeAnnotation,
    File,
    Decorator,
} from '@babel/types';
import { DeclarationFileType } from './declaration-file-type.enum';
import { ClassTransformOptions } from 'class-transformer';
import { AxiosRequestConfig } from 'axios';
import {
    // NodePath,
    Scope,
} from '@babel/traverse';
import { ParseResult } from '@babel/parser';

export interface SDKMakerOptions {
    name: string;
    templateDir?: string;
    basicPackageName?: string;
}

// export interface ImportItem {
//     path: string;
//     name: string;
//     aliasedName: string;
// }

interface BaseDeclaration {
    path: string;
    name: string;
    imports: ImportItem[];
}

export interface DTOClassDeclaration extends BaseDeclaration {
    type: DeclarationFileType.DTO;
    superClass: Identifier;
    structure: Record<string, TSTypeAnnotation>;
}

export interface EnumDeclaration extends BaseDeclaration {
    type: DeclarationFileType.ENUM;
    structure: Record<string, Expression>;
}

export interface Context {
    absolutePath: string;
}

export type Declaration = DTOClassDeclaration | EnumDeclaration;

///

export interface CodegenOptions {
    baseURL: string;
    outputDir: string;
    workDir: string;
    authGuardWhiteList: string[];
    classTransformOptions?: ClassTransformOptions;
    controllerGlobPatterns?: string[];
    customizer?: Customizer;
    requestOptions?: Omit<AxiosRequestConfig, 'url' | 'method' | 'baseURL'>;
    version?: string;
    versioning?: boolean;
    getAuthGuardTypes?: GetAuthGuardTypes;
    getReturnDto?: GetReturnDTO;
}

export interface GetReturnDTOContext {
    returnType: TSTypeAnnotation;
    scope: Scope;
    dtoIdentifiers: string[];
}

export interface GetAuthGuardTypesContext {
    decorators: Decorator[];
    scope: Scope;
    importItems: ImportItem[];
}

export type GetAuthGuardTypes = (context: GetAuthGuardTypesContext) => string[];
export type GetReturnDTO = (context: GetReturnDTOContext) => string;
export type ImportType = 'ImportSpecifier' | 'ImportDefaultSpecifier' | 'ImportNamespaceSpecifier';
export type HTTPMethodType = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type DecoratorExpression = CallExpression | Identifier;

export interface EnsureImportOption {
    ast: ParseResult<File>;
    type: ImportType;
    sourceFn: (sources: string[]) => string;
    identifier?: string;
    addImport?: boolean;
}

export interface ImportItem {
    imported: string;
    local: string;
    source: string;
    type: ImportType;
}

export interface PathSchemeContext extends Required<Pick<CodegenOptions, 'versioning' | 'version'>> {
    decoratorExpression: DecoratorExpression;
}

export type PathScheme = (context: PathSchemeContext) => string;

export interface CustomControllerDecorator extends Omit<ImportItem, 'local'> {
    pathScheme?: PathScheme;
}

export interface CustomHTTPMethodDecorator extends Omit<ImportItem, 'local'> {
    pathScheme?: PathScheme;
}

export type CustomHTTPMethodDecoratorMap = Partial<Record<HTTPMethodType, CustomHTTPMethodDecorator>>;

export interface Customizer {
    controllers?: CustomControllerDecorator[];
    httpMethodMap?: CustomHTTPMethodDecoratorMap;
    ensureImports?: Omit<EnsureImportOption, 'ast'>[];
}

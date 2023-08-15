import {
    CallExpression,
    Expression,
    Identifier,
    TSTypeAnnotation,
} from '@babel/types';
import { DeclarationFileType } from './declaration-file-type.enum';
import { EnsureImportOption } from './utils';

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

export interface NestSDKMakerOptions {
    outputDir: string;
    workDir: string;
    baseURL: string;
    customizer?: Customizer;
    version?: string;
    versioning?: boolean;
}

export type ImportType = 'ImportSpecifier' | 'ImportDefaultSpecifier' | 'ImportNamespaceSpecifier';
export type HTTPMethodType = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type DecoratorExpression = CallExpression | Identifier;

export interface ImportItem {
    imported: string;
    local: string;
    source: string;
    type: ImportType;
}

export interface PathGetterData extends Required<Pick<NestSDKMakerOptions, 'versioning' | 'version'>> {
    decoratorExpression: DecoratorExpression;
}

export type PathGetter = (data: PathGetterData) => string;

export interface CustomControllerDecorator extends ImportItem {
    controllerType: string;
    pathGetter: PathGetter;
}

export interface CustomHTTPMethodDecorator extends ImportItem {
    pathGetter: PathGetter;
}

export type CustomHTTPMethodDecoratorMap = Partial<Record<HTTPMethodType, CustomHTTPMethodDecorator>>;

export interface Customizer {
    controllerDecorators?: CustomControllerDecorator[];
    httpMethodDecoratorMap?: CustomHTTPMethodDecoratorMap;
    ensureImports?: EnsureImportOption[];
}

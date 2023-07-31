import {
    Expression,
    Identifier,
    TSTypeAnnotation,
} from '@babel/types';
import { DeclarationFileType } from './declaration-file-type.enum';

export interface SDKMakerOptions {
    name: string;
    templateDir?: string;
    basicPackageName?: string;
}

export interface ImportItem {
    path: string;
    name: string;
    aliasedName: string;
}

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

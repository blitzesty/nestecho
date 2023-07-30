import { DeclarationFileType } from './declaration-file-type.enum';

export interface SDKMakerOptions {
    name: string;
    templateDir?: string;
    basicPackageName?: string;
}

export interface DeclarationImportMap {
    [pathname: string]: {
        name: string;
        aliasedName: string;
    }
}

export interface DeclarationClass {
    [name: string]: {
        type: string;
        isTypeImported: boolean;
    }
}

interface BaseDeclaration {
    pathname: string;
}

export interface DTOClassDeclaration extends BaseDeclaration {
    type: 'dto';
    importMap: DeclarationImportMap;
    classes: DeclarationClass[];
}

export interface Context {
    absolutePathname: string;
}

export type DeclarationMap = {
    type: DeclarationFileType.DTO;
    declarations: DTOClassDeclaration;
} | {};


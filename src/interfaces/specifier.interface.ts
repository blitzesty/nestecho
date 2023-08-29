import {
    ImportDefaultSpecifier,
    ImportNamespaceSpecifier,
    ImportSpecifier,
} from '@babel/types';

export type Specifier = ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier;

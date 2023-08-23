import { ParseResult } from '@babel/parser';
import {
    File,
    ImportDeclaration,
} from '@babel/types';
import { ImportItem } from '../interfaces';

export function getImports(ast: ParseResult<File>) {
    const importDeclarations: ImportDeclaration[] = (ast?.program?.body || [])?.filter((declaration) => declaration.type === 'ImportDeclaration') as ImportDeclaration[];
    const importItems = importDeclarations.reduce((result: ImportItem[], importDeclaration) => {
        const sourceValue = importDeclaration?.source?.value;
        const currentImportItems: ImportItem[] = importDeclaration.specifiers?.map((specifier) => {
            let imported: string;
            const local = specifier.local.name;

            switch (specifier.type) {
                case 'ImportNamespaceSpecifier':
                case 'ImportDefaultSpecifier': {
                    imported = specifier.local.name;
                    break;
                }
                case 'ImportSpecifier': {
                    if (specifier.imported.type === 'Identifier') {
                        imported = specifier.imported.name;
                    }
                    break;
                }
                default:
                    break;
            }

            if (!imported) {
                return null;
            }

            return {
                source: sourceValue,
                type: specifier.type,
                imported,
                local,
            };
        }).filter((item) => !!item);

        return result.concat(currentImportItems);
    }, [] as ImportItem[]);
    return importItems;
};

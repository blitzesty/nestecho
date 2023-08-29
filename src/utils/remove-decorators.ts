import {
    ClassDeclaration,
    ClassMethod,
} from '@babel/types';
import { ImportItem } from '../interfaces';

export const removeDecorators = (
    node: ClassDeclaration | ClassMethod,
    allowedDecoratorImportItems: ImportItem[],
) => {
    node.decorators = (node?.decorators || []).filter((decorator) => {
        let identifierName: string;

        switch (decorator?.expression?.type) {
            case 'Identifier':
                identifierName = decorator.expression.name;
                break;
            case 'CallExpression':
                if (decorator?.expression?.callee?.type === 'Identifier') {
                    identifierName = decorator.expression.callee.name;
                }
                break;
            default:
                break;
        }

        return (
            identifierName &&
            allowedDecoratorImportItems.some((importItem) => importItem.local === identifierName)
        );
    });
};

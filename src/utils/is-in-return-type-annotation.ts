import { NodePath } from '@babel/traverse';

export const isInReturnTypeAnnotation = (nodePath: NodePath) => {
    if (!nodePath) {
        return false;
    }

    const getAnnotationNodePath = (nodePath: NodePath): NodePath => {
        if (!nodePath) {
            return null;
        }

        if (nodePath?.node?.type === 'TSTypeAnnotation') {
            return nodePath;
        }

        return getAnnotationNodePath(nodePath?.parentPath);
    };

    const annotationNodePath = getAnnotationNodePath(nodePath);

    if (!annotationNodePath) {
        return false;
    }

    return (
        annotationNodePath?.parentPath?.node?.type === 'ClassMethod' || (
            nodePath?.parentPath?.node?.type === 'TSTypeParameterInstantiation' &&
            nodePath?.parentPath?.parentPath?.node?.type === 'TSTypeReference' &&
            nodePath?.parentPath?.parentPath?.node?.typeName?.type === 'Identifier' &&
            nodePath?.parentPath?.parentPath?.node?.typeName?.name === 'PartialDeep'
        )
    );
};

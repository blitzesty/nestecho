import {
    ImportDeclaration,
    // StringLiteral,
    identifier,
    importSpecifier,
} from '@babel/types';
import {
    EnsureImportOptions,
    // PathSchemeContext,
} from '../interfaces/common.interface';
import traverse from '@babel/traverse';
import template from '@babel/template';
import { parse } from '@babel/parser';

export class AstUtil {
    // public methodPathScheme = this.controllerPathScheme;

    // public controllerPathScheme(context: PathSchemeContext) {
    //     if (
    //         context?.decoratorExpression?.type !== 'CallExpression' ||
    //         context?.decoratorExpression?.callee?.type !== 'Identifier' ||
    //         (
    //             context?.decoratorExpression?.arguments?.[0] &&
    //             context?.decoratorExpression?.arguments?.[0]?.type !== 'StringLiteral'
    //         )
    //     ) {
    //         return null;
    //     }

    //     return (context?.decoratorExpression?.arguments?.[0] as StringLiteral)?.value ?? null;
    // };

    public ensureImport(options?: EnsureImportOptions) {
        const {
            type,
            ast,
            identifier: inputIdentifier,
            addImport = true,
            sourceMatcher: inputSource,
            source: inputActualSource,
        } = options;

        if (!type || !inputSource || !inputActualSource) {
            return null;
        }

        let newIdentifier = inputIdentifier;

        traverse(ast, {
            ImportDeclaration(nodePath1) {
                traverse(
                    nodePath1.node,
                    {
                        Identifier(nodePath2) {
                            if (inputIdentifier && nodePath2?.node?.name === inputIdentifier) {
                                const randomPrefix = new Array(8).fill('').map(() => {
                                    return 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
                                }).join('');
                                newIdentifier = `${randomPrefix}$$${inputIdentifier}`;
                                nodePath2.stop();
                            }
                        },
                    },
                    nodePath1.scope,
                );
            },
        });

        const importSources = ast.program.body
            .filter((statement) => statement.type === 'ImportDeclaration')
            .map((importDeclaration: ImportDeclaration) => importDeclaration.source.value)
            .filter((source) => !!source);
        const targetImportDeclaration: ImportDeclaration = ast.program.body.find((statement) => {
            if (statement.type !== 'ImportDeclaration') {
                return false;
            }

            let targeted = false;

            if (typeof inputSource === 'string') {
                targeted = statement.source.value === inputSource;
            } else if (inputSource instanceof RegExp) {
                targeted = inputSource.test(statement.source.value);
            } else if (typeof inputSource === 'function') {
                targeted = statement.source.value === inputSource(importSources);
            }

            return targeted;
        }) as ImportDeclaration;

        if (!inputIdentifier && !targetImportDeclaration) {
            ast.program.body.unshift(template.ast(`import '${inputActualSource}'`) as ImportDeclaration);
            return;
        }

        if (!targetImportDeclaration) {
            if (addImport) {
                let importDeclaration: ImportDeclaration;
                switch (type) {
                    case 'ImportDefaultSpecifier': {
                        importDeclaration = template.ast(`import ${newIdentifier} from '${inputActualSource}';`) as ImportDeclaration;
                        break;
                    }
                    case 'ImportSpecifier': {
                        importDeclaration = template.ast(`import { ${inputIdentifier} as ${newIdentifier} } from '${inputActualSource}';`) as ImportDeclaration;
                        break;
                    }
                    case 'ImportNamespaceSpecifier': {
                        importDeclaration = template.ast(`import * as ${newIdentifier} from '${inputActualSource}';`) as ImportDeclaration;
                        break;
                    }
                }

                ast.program.body.unshift(importDeclaration);

                return newIdentifier;
            } else {
                return null;
            }
        }

        let localIdentifier: string;

        for (const specifier of targetImportDeclaration.specifiers) {
            if (
                (type === 'ImportDefaultSpecifier' || type === 'ImportNamespaceSpecifier') &&
                specifier.type === type &&
                specifier.local.name === inputIdentifier
            ) {
                localIdentifier = inputIdentifier;
                break;
            }

            if (
                type === 'ImportSpecifier' &&
                specifier.type === 'ImportSpecifier' &&
                specifier.imported?.type === 'Identifier' &&
                specifier.imported.name === inputIdentifier
            ) {
                localIdentifier = specifier.local.name;
                break;
            }
        }

        if (!localIdentifier) {
            if (addImport && type === 'ImportSpecifier') {
                targetImportDeclaration.specifiers.push(importSpecifier(
                    identifier(newIdentifier),
                    identifier(inputIdentifier),
                ));
                localIdentifier = newIdentifier;
            } else {
                return null;
            }
        }

        return [localIdentifier, targetImportDeclaration.source.value];
    };

    public parseAst(content) {
        return parse(content, {
            sourceType: 'module',
            plugins: [
                'jsx',
                'typescript',
                'decorators-legacy',
                'dynamicImport',
                'throwExpressions',
                'objectRestSpread',
                'optionalChaining',
                'classPrivateMethods',
                'classPrivateProperties',
                'classProperties',
                'classStaticBlock',
                'exportDefaultFrom',
                'exportNamespaceFrom',
            ],
        });
    };
}

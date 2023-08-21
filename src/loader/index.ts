/* eslint-disable @typescript-eslint/no-invalid-this */
import { defaultOptions } from '../constants';
import * as _ from 'lodash';
import { Options } from '../interfaces';
import * as path from 'path';
import {
    AstUtil,
    MatchUtil,
    parseAst,
} from '../utils';
import { FilePath } from '../decorators';
import traverse from '@babel/traverse';
import {
    callExpression,
    decorator,
    identifier,
    stringLiteral,
} from '@babel/types';

export default function(source) {
    const callback = this.async();
    const options = {
        ..._.pick(defaultOptions, [
            'controllerPatterns',
            'workDir',
            'appEntry',
            'appModule',
        ]),
        ..._.pick(
            this.getOptions() ?? {},
            [
                'controllerPatterns',
                'workDir',
                'appEntry',
                'appModule',
            ],
        ),
    } as Required<Pick<Options, 'controllerPatterns' | 'appEntry' | 'appModule'>>;
    const requestAbsolutePath = this.resourcePath;
    const workDir = process.cwd();
    const requestRelativePath = path.relative(workDir, requestAbsolutePath);
    const matchUtil = new MatchUtil();

    try {
        (async function() {
            if (requestRelativePath === options.appEntry) {
                let appModuleImportCode: string;
                const appModuleRelativePath = './' + path
                    .relative(
                        path.dirname(path.resolve(workDir, options.appEntry)),
                        path.resolve(workDir, options.appModule.entry),
                    )
                    .replace(/\.[^/.]+$/, '');

                switch (options.appModule.importType) {
                    case 'ImportDefaultSpecifier': {
                        appModuleImportCode = `import ${options.appModule.identifier} from '${appModuleRelativePath}';`;
                        break;
                    }
                    case 'ImportNamespaceSpecifier': {
                        appModuleImportCode = `import * as ${options.appModule.identifier} from '${appModuleRelativePath}';`;
                        break;
                    }
                    case 'ImportSpecifier': {
                        appModuleImportCode = `import { ${options.appModule.identifier} } from '${appModuleRelativePath}';`;
                        break;
                    }
                    default:
                        break;
                }

                const code = [
                    'import \'reflect-metadata\';',
                    'import { Codegen } from \'@blitzesty/nestecho/dist/codegen\';',
                    appModuleImportCode,
                    '',
                    `console.log('LENCONDA:', Reflect.getMetadataKeys(${options.appModule.identifier}))`,
                ].join('\n');

                return callback(null, code);
            } else if (matchUtil.match(options.controllerPatterns, requestRelativePath)) {
                const ast = parseAst(source);
                const astUtil = new AstUtil(ast);
                const filePathDecoratorSource = '@blitzesty/nestecho/dist/decorators/filepath.decorator';
                const [filePathIdentifier] = astUtil.ensureImport({
                    addImport: true,
                    source: filePathDecoratorSource,
                    sourceMatcher: /^\@blitzesty\/nestecho/g,
                    identifier: FilePath.name,
                    type: 'ImportSpecifier',
                });

                traverse(ast, {
                    ClassDeclaration(nodePath) {
                        if (!Array.isArray(nodePath.node.decorators)) {
                            nodePath.node.decorators = [];
                        }

                        nodePath.node.decorators.push(decorator(
                            callExpression(
                                identifier(filePathIdentifier),
                                [
                                    stringLiteral(filePathDecoratorSource),
                                ],
                            ),
                        ));
                    },
                });

                return callback(null, astUtil.getCode());
            }

            callback(null, source);
        })();
    } catch (e) {
        callback(e, source);
    }
}

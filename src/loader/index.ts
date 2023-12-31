/* eslint-disable @typescript-eslint/no-invalid-this */
import { defaultOptions } from '../constants';
import * as _ from 'lodash';
import { Options } from '../interfaces';
import * as path from 'path';
import {
    ensureImport,
    matchOnce,
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
import generate from '@babel/generator';

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
                    'import { Generator } from \'@blitzesty/nestecho/dist/generator\';',
                    appModuleImportCode,
                    '',
                    'const run = async () => {',
                    `    const generator = new Generator(${options.appModule.identifier});`,
                    '',
                    '    await generator.generate();',
                    '    generator.write();',
                    '};',
                    '',
                    'run();',
                ].join('\n');

                return callback(null, code);
            } else if (matchOnce(options.controllerPatterns, requestRelativePath)) {
                const ast = parseAst(source);
                const filePathDecoratorSource = '@blitzesty/nestecho/dist/decorators/file-path.decorator';
                const [filePathIdentifier] = ensureImport({
                    ast,
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
                                    stringLiteral(requestAbsolutePath),
                                ],
                            ),
                        ));
                    },
                });

                return callback(null, generate(ast)?.code);
            }

            return callback(null, source);
        })();
    } catch (e) {
        callback(e, source);
    }
}

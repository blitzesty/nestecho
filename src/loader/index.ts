/* eslint-disable @typescript-eslint/no-invalid-this */

import { defaultOptions } from '../constants';
import * as _ from 'lodash';
import { Options } from '../interfaces/common.interface';
import * as path from 'path';
// import { minimatch } from 'minimatch';
// import { MatchUtil } from '../utils/match-util';

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
    } as Required<Pick<Options, 'controllerPatterns' | 'workDir' | 'appEntry' | 'appModule'>>;
    const requestAbsolutePath = this.resourcePath;
    const requestRelativePath = path.relative(options.workDir, requestAbsolutePath);
    // const matchUtil = new MatchUtil();

    try {
        (async function() {
            if (requestRelativePath === options.appEntry) {
                let appModuleImportCode: string;
                const appModuleRelativePath = './' + path
                    .relative(
                        path.dirname(path.resolve(options.workDir, options.appEntry)),
                        path.resolve(options.workDir, options.appModule.entry),
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
            }

            callback(null, source);
        })();
    } catch (e) {
        callback(e, source);
    }
}

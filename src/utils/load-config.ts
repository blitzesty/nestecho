import * as fs from 'fs-extra';
import * as path from 'path';
import { Options } from '../interfaces';
import { defaultOptions } from '../constants';
import * as requireFromString from 'require-from-string';
// import { requireFromString } from './require-from-string';

export function loadConfig(filePath: string) {
    const result: Options = {
        packageName: fs.readJsonSync(path.resolve(path.dirname(filePath), 'package.json'))?.name + '-sdk',
        ...defaultOptions,
        ...(
            !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()
                ? defaultOptions
                : requireFromString(
                    fs.readFileSync(filePath).toString(),
                    {
                        prependPaths: [
                            path.dirname(filePath),
                        ],
                    },
                ) as Options
        ),
    };
    return result;
}

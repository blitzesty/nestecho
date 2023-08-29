import { ESLint } from 'eslint';
import * as path from 'path';
import * as _ from 'lodash';
import * as fs from 'fs-extra';
import { cosmiconfigSync } from 'cosmiconfig';

type LinterPlugin = (code: string, fromPath: string) => Promise<string>;
interface LinterOptions extends ESLint.Options {
    prePlugins?: LinterPlugin[];
    postPlugins?: LinterPlugin[];
}

export const lintCode = async (
    code: string,
    options: LinterOptions = {},
): Promise<string> => {
    const {
        cwd: userSpecifiedCwd,
        prePlugins = [],
        postPlugins = [],
        overrideConfig = {},
        ...otherESLintConfig
    } = options;
    let eslintConfigFilePath = userSpecifiedCwd;

    if (!eslintConfigFilePath) {
        const eslintConfigPaths = [
            path.resolve(__dirname, '../.eslintrc.js'),
        ];
        const currentProjectESLintConfig = cosmiconfigSync('eslint').search();
        eslintConfigFilePath = currentProjectESLintConfig?.filepath
            ? currentProjectESLintConfig.filepath
            : eslintConfigPaths.find((pathname) => fs.existsSync(pathname));
    }

    if (!eslintConfigFilePath) {
        return code;
    }

    const eslint = new ESLint({
        ...otherESLintConfig,
        allowInlineConfig: true,
        cwd: path.dirname(eslintConfigFilePath),
        overrideConfig: _.merge({}, {
            rules: {
                'array-element-newline': ['error', {
                    'multiline': true,
                    'minItems': 2,
                }],
                'array-bracket-newline': ['error', {
                    'multiline': true,
                    'minItems': 2,
                }],
                'object-curly-newline': ['error', {
                    'ObjectExpression': 'always',
                    'ObjectPattern': 'always',
                    'ImportDeclaration': {
                        'multiline': true,
                        'minProperties': 2,
                    },
                    'ExportDeclaration': {
                        'multiline': true,
                        'minProperties': 2,
                    },
                }],
                'object-curly-spacing': ['error', 'always'],
                'object-property-newline': ['error', { allowAllPropertiesOnSameLine: false }],
                'no-undef': 'off',
                'no-unused-vars': 'off', // or "@typescript-eslint/no-unused-vars": "off",
                'unused-imports/no-unused-imports': 'error',
                '@typescript-slint/no-unused-vars': 'error',
                'unused-imports/no-unused-imports-ts': 'error',
                'unused-imports/no-unused-vars': [
                    'warn',
                    {
                        'vars': 'all',
                        'varsIgnorePattern': '^_',
                        'args': 'after-used',
                        'argsIgnorePattern': '^_',
                    },
                ],
            },
        }, overrideConfig),
        fix: true,
    });
    let rawCode: string = code;

    for (const prePlugin of prePlugins) {
        rawCode = await prePlugin(rawCode, eslintConfigFilePath);
    }

    rawCode = _.get(await eslint.lintText(rawCode), '[0].output') as string || rawCode;

    for (const postPlugin of postPlugins) {
        rawCode = await postPlugin(rawCode, eslintConfigFilePath);
    }

    return rawCode;
};

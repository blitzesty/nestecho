import * as path from 'path';
import * as fs from 'fs-extra';

export const findWorkDir = (startPath = process.cwd()) => {
    const configPath = path.resolve(startPath, './nestecho.config.js');

    if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
        return startPath;
    } else {
        const parentPath = path.resolve(startPath, '..');

        if (parentPath === startPath) {
            return null;
        } else {
            return findWorkDir(parentPath);
        }
    }
};

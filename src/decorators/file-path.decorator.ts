import 'reflect-metadata';
import { FILE_PATH } from '../constants';

export function FilePath(path: string) {
    return function(target: any) {
        Reflect.defineMetadata(FILE_PATH, path, target);
    };
}

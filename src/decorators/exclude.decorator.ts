import 'reflect-metadata';
import { NESTECHO_EXCLUDE } from '../constants';

export function Exclude() {
    return function(target: any) {
        Reflect.defineMetadata(NESTECHO_EXCLUDE, true, target);
    };
}

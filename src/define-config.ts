import { defaultOptions } from './constants';
import { Options } from './interfaces';

export function defineOptions(factory: (options: Required<Omit<Options, 'packageName'>>) => Options) {
    return factory(defaultOptions);
}

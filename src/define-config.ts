import { defaultOptions } from './constants';
import { Options } from './interfaces';

export function defineOptions(factory: (options: Required<Omit<Options, 'apiBaseURL' | 'packageName'>>) => Options) {
    return factory(defaultOptions);
}

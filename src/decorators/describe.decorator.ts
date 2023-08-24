import 'reflect-metadata';
import { NESTECHO_DESCRIPTION } from '../constants';
import { DescribeDecoratorOptions } from '../interfaces/describe-decorator-options.interface';

export function Describe(data?: DescribeDecoratorOptions) {
    return function(target: any) {
        Reflect.defineMetadata(NESTECHO_DESCRIPTION, data, target);
    };
}

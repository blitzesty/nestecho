import { RequestOptions } from './request-options.interface';

export interface SDKOptions {
    key?: string;
    secret?: string;
    requestOptions?: RequestOptions
}

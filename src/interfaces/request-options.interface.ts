import { AxiosRequestConfig } from 'axios';
import { MethodOptionsMap } from './method-options-map.interface';

export interface RequestOptions<T = Record<string, any>> extends Omit<AxiosRequestConfig, 'baseURL'> {
    metadatas?: Record<string, any>;
    options?: T;
    optionsMap?: MethodOptionsMap;
}

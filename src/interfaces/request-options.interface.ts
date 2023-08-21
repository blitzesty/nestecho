import { AxiosRequestConfig } from 'axios';

export type RequestOptions = Omit<AxiosRequestConfig, 'url' | 'method' | 'baseURL'>;

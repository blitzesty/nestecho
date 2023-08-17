import { AxiosResponse } from 'axios';

export type CustomDeserializerFactory = (response: AxiosResponse) => any;

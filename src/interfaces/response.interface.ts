import { ResponseError } from './response-error.interface';

export interface Response<R = any, E = ResponseError> {
    response: R;
    error: E;
}

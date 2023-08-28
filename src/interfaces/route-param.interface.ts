import { RouteParamType } from './route-param-type.interface';

export interface RouteParam {
    index: number;
    mappedName: string;
    type: RouteParamType;
}

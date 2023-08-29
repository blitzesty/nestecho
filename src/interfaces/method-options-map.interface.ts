import { RouteParamType } from './route-param-type.interface';

export type MethodOptionsMap = Partial<Record<RouteParamType, Record<string, string | null>>>;

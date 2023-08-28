import { RouteParam } from './route-param.interface';

export interface ControllerMethodDescriptor {
    /**
     * @description https://github.com/nestjs/nest/blob/master/packages/common/enums/request-method.enum.ts
     */
    method: string;
    path: string;
    routeParams: RouteParam[];
}

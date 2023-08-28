import { ControllerDescriptor } from './controller-descriptor.interface';

export interface ControllerPath {
    children: ControllerPath[];
    path: string;
    controllerDescriptor?: ControllerDescriptor;
}

import { ControllerTemplateDescriptor } from './controller-template-descriptor.interface';

export interface ControllerPath {
    children: ControllerPath[];
    path: string;
    controllerDescriptor?: ControllerTemplateDescriptor;
}

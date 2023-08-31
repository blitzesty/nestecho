import { ControllerDescriptor } from './controller-descriptor.interface';

export interface ControllerSourceDescriptor extends ControllerDescriptor {
    source: string;
}

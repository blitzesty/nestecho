import { ControllerDescriptor } from './controller-descriptor.interface';

export type DescribeDecoratorOptions = Partial<Pick<ControllerDescriptor, 'exportName' | 'importType'>>;

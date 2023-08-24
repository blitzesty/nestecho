import { ControllerTemplateDescriptor } from './controller-template-descriptor.interface';

export type DescribeDecoratorOptions = Partial<Pick<ControllerTemplateDescriptor, 'exportName' | 'importType'>>;

import { ControllerTemplateDescriptor } from './controller-template-descriptor.interface';

export type ControllerListItem = ControllerTemplateDescriptor | {
    type: 'ListItem';
    path: string;
    children: ControllerListItem[];
};

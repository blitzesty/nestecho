import { ImportType } from './import-type.interface';

export interface ControllerTemplateDescriptor {
    filePath: string;
    importType: ImportType;
    name: string;
    type: 'TemplateDescriptor';
}

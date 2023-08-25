import { ImportType } from './import-type.interface';

export interface ControllerTemplateDescriptor {
    exportName: string;
    filePath: string;
    importName: string;
    importType: ImportType;
    name: string;
}

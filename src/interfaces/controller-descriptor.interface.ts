import { ControllerMethodDescriptor } from './controller-method-descriptor.interface';
import { ImportType } from './import-type.interface';

export interface ControllerDescriptor {
    exportName: string;
    filePath: string;
    importName: string;
    importType: ImportType;
    methods: Record<string, ControllerMethodDescriptor>;
    name: string;
    noExplicitName: boolean;
    path: string;
}

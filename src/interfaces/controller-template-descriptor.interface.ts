import { ImportType } from './import-type.interface';

export interface ControllerTemplateDescriptor {
    exportName: string;
    filePath: string;
    importName: string;
    importType: ImportType;
    methods: Record<string, {
        /**
         * @description https://github.com/nestjs/nest/blob/master/packages/common/enums/request-method.enum.ts
         */
        method: number;
        path: string;
    }>;
    name: string;
}

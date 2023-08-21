import { ImportType } from './import-type.interface';

export interface AppModuleOptions {
    entry?: string;
    identifier?: string;
    importType?: ImportType;
}

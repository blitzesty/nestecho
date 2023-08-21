import { ImportType } from './import-type.interface';

export interface ImportItem {
    imported: string;
    local: string;
    source: string;
    type: ImportType;
}

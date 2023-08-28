import { ImportType } from './import-type.interface';

export interface DTOImportMatcher {
    importType: ImportType[];
    sourceMatcher: string | RegExp | ((source: string) => boolean);
}

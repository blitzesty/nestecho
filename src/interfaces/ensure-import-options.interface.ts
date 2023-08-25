import { ImportType } from './import-type.interface';

export interface EnsureImportOptions {
    type: ImportType;
    sourceMatcher: string | RegExp | ((sources: string[]) => string);
    source: string;
    identifier?: string;
    addImport?: boolean;
}

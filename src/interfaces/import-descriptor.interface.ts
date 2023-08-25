import { EnsureImportOptions } from './ensure-import-options.interface';

export type ImportDescriptor = Required<Omit<EnsureImportOptions, 'addImport'>>;

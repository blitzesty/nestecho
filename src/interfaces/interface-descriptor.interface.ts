import { EnsureImportOptions } from './ensure-import.interface';

export type InterfaceDescriptor = Required<Omit<EnsureImportOptions, 'addImport'>>;

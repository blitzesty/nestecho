import { ControllerDescriptor } from './controller-descriptor.interface';
import { ControllerMethodDescriptor } from './controller-method-descriptor.interface';
import { MethodOptionsMap } from './method-options-map.interface';

export interface MethodContext {
    controllerDescriptor: ControllerDescriptor;
    ensuredImportMap: Record<string, [string, string]>;
    methodDescriptor: ControllerMethodDescriptor;
    methodName: string;
    methodOptionsMap: MethodOptionsMap;
    requestTypeIdentifierName: string;
    responseTypeIdentifierName: string;
}

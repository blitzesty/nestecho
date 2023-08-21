import 'reflect-metadata';
import { CUSTOM_DESERIALIZER } from '../constants';
import { CustomDeserializerFactory } from '../interfaces';

export function CustomDeserializer(factory: CustomDeserializerFactory) {
    return function (target: any, key: any, descriptor: PropertyDescriptor) {
        Reflect.defineMetadata(CUSTOM_DESERIALIZER, factory, descriptor.value);
    };
}

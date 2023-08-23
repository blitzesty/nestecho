import { ControllerSchemeContext } from './controller-scheme-context.interface';

export type ControllerScheme = (context: ControllerSchemeContext) => string;

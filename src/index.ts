import loader from './loader';
import { Command } from 'commander';

export * from './codegen';
export * from './constants';
export * from './decorators';
export * from './define-config';
export * from './interfaces';
export * from './utils';

export default loader;

export function createGenerator() {
    const command = new Command('app-entry');

    command.argument('<work-dir>', 'relative or absolute pathname for working with Nestecho');
    command.option('--config <path>', 'config file pathname for Nestecho');

    command.action(async (workDir: string, options) => {
        console.log(workDir, options);
    });

    command.parse(process.argv);

    return command;
}

createGenerator();

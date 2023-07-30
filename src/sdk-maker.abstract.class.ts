import {
    Context,
    DeclarationMap,
    SDKMakerOptions,
} from './interfaces';
import { exec } from 'child_process';
import { globSync } from 'glob';
import * as path from 'path';
import * as _ from 'lodash';
import { DeclarationFileType } from './declaration-file-type.enum';
import * as fs from 'fs-extra';

export abstract class SDKMaker {
    protected readonly declarationFilePathListMap: Partial<Record<DeclarationFileType, Record<string, string>>> = {};
    protected readonly declarationMap: DeclarationMap = {};
    protected basePackageDistDirectory: string;
    protected cwd: string = process.cwd();
    protected context: Context;
    private templateDir: string;

    public constructor(private readonly options: SDKMakerOptions) {
        if (!this.options.basicPackageName) {
            this.options.basicPackageName = '@matrindex/build-essential';
        }
    }

    public setCwd() {}

    public setContext(context: Context) {
        this.context = context;
    }

    public init(context: Context) {
        this.setContext(context);
        this.setCwd();
        this.basePackageDistDirectory = path.resolve(
            this.cwd,
            'node_modules',
            this.options.basicPackageName,
            'dist',
        );
        this.scanDeclarationFiles([
            {
                type: DeclarationFileType.DTO,
                pattern: '*.dto.ts',
            },
        ]);
        this.templateDir = path.resolve(this.context.absolutePathname, this.options.templateDir || './templates');
    }

    protected getTemplate(pathname: string) {
        try {
            return fs.readFileSync(path.resolve(this.templateDir, pathname));
        } catch (e) {
            return Buffer.from('');
        }
    }

    protected async runCommand(command: string, cwd: string, catchError = false) {
        return new Promise((resolve) => {
            const execution = exec(
                command,
                {
                    cwd,
                },
                (error, stdout, stderr) => {
                    if (error || stderr) {
                        if (!catchError) {
                            console.error((error || stderr));
                            process.exit(1);
                        } else {
                            resolve(error);
                        }
                    }
                    console.log(stdout);
                    resolve(stdout);
                },
            );
            execution.on('message', (message) => console.log(message));
        });
    }

    private scanDeclarationFiles(files: { pattern: string; type: DeclarationFileType; }[] = []) {
        const filteredFiles = _.uniqBy(
            files
                .filter((file) => {
                    return !!file && !!file.pattern && !!file.type;
                }),
            'type',
        );

        for (const file of filteredFiles) {
            const globResultList = globSync(
                this.basePackageDistDirectory + '/**/' + file.pattern,
                {
                    nodir: true,
                },
            );
            this.declarationFilePathListMap[file.type] = globResultList.reduce((result, currentPathname) => {
                if (!currentPathname || typeof currentPathname !== 'string') {
                    return result;
                }

                try {
                    result[currentPathname] = fs.readFileSync(path.resolve(this.basePackageDistDirectory, currentPathname)).toString();
                    return result;
                } catch (e) {
                    return result;
                }
            }, {} as Record<string, string>);
        }
    }

    private parseDeclarations() {
        for (const [declarationFileType, declarationFileMap] of Object.entries(this.declarationFilePathListMap)) {
            if (!declarationFileMap) {
                continue;
            }

            for (const [declarationFilePathname, declarationFileContent] of Object.entries(declarationFileMap)) {
                // TODO:
            }
        }
    }

    public abstract build(): Promise<void>;
    public abstract prePublish(): Promise<void>;
    public abstract publish(): Promise<void>;
    public abstract postPublish(): Promise<void>;
}

import {
    Context,
    DTOClassDeclaration,
    Declaration,
    EnumDeclaration,
    ImportItem,
    SDKMakerOptions,
} from './interfaces';
import { exec } from 'child_process';
import { globSync } from 'glob';
import * as path from 'path';
import * as _ from 'lodash';
import { DeclarationFileType } from './declaration-file-type.enum';
import * as fs from 'fs-extra';
import { parseTypeScriptAST } from './utils';
import {
    ClassBody,
    ClassDeclaration,
    ExportNamedDeclaration,
    Expression,
    Identifier,
    ImportDeclaration,
    ImportSpecifier,
    TSEnumDeclaration,
    TSTypeAnnotation,
} from '@babel/types';

export abstract class SDKMaker {
    protected readonly declarations: Declaration[] = [];
    protected basePackageDistDirectory: string;
    protected cwd: string = process.cwd();
    protected context: Context;

    private templateDir: string;
    private readonly declarationFilePathListMap: Partial<Record<DeclarationFileType, Record<string, string>>> = {};

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
                pattern: '*.dto.d.ts',
            },
            {
                type: DeclarationFileType.ENUM,
                pattern: '*.enum.d.ts',
            },
        ]);
        this.templateDir = path.resolve(this.context.absolutePath, this.options.templateDir || './templates');
        this.parseDeclarations();
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
            this.declarationFilePathListMap[file.type] = globResultList.reduce((result, currentPath) => {
                if (!currentPath || typeof currentPath !== 'string') {
                    return result;
                }

                try {
                    result[currentPath] = fs.readFileSync(path.resolve(this.basePackageDistDirectory, currentPath)).toString();
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

            for (const [declarationFilePath, declarationFileContent] of Object.entries(declarationFileMap)) {
                try {
                    const astBody = parseTypeScriptAST(declarationFileContent)?.program?.body || [];
                    const normalizedPath = declarationFilePath.replace(/\.d\.ts$/g, '');
                    const imports = astBody?.filter((item) => item.type === 'ImportDeclaration').reduce((result: ImportItem[], currentDeclaration: ImportDeclaration) => {
                        const specifiers: ImportSpecifier[] = (currentDeclaration.specifiers || []).filter((specifier) => specifier.type === 'ImportSpecifier') as ImportSpecifier[];
                        const currentResult = Array.from(result);

                        for (const specifier of specifiers) {
                            if (specifier?.imported?.type !== 'Identifier' || specifier?.local?.type !== 'Identifier') {
                                continue;
                            }

                            currentResult.push({
                                path: path.resolve(this.basePackageDistDirectory, currentDeclaration.source.value),
                                name: specifier.imported.name,
                                aliasedName: specifier.local.name,
                            });
                        }

                        return currentResult;
                    }, [] as ImportItem[]);
                    const exportNamedDeclarations: ExportNamedDeclaration[] = astBody.filter((item) => item.type === 'ExportNamedDeclaration') as ExportNamedDeclaration[];

                    switch (DeclarationFileType[declarationFileType]) {
                        case DeclarationFileType.DTO: {
                            const dtoClassDeclarations: ClassDeclaration[] = exportNamedDeclarations
                                .filter((item) => item?.declaration?.type === 'ClassDeclaration')
                                .map((item) => item.declaration as ClassDeclaration);

                            for (const dtoClassDeclaration of dtoClassDeclarations) {
                                const structure: Record<string, TSTypeAnnotation> = ((dtoClassDeclaration.body as ClassBody).body || [])
                                    .reduce((result, currentPropertyDeclaration) => {
                                        if (
                                            currentPropertyDeclaration?.type !== 'ClassProperty' ||
                                            currentPropertyDeclaration?.key?.type !== 'Identifier' ||
                                            currentPropertyDeclaration?.typeAnnotation?.type !== 'TSTypeAnnotation'
                                        ) {
                                            return result;
                                        }

                                        result[currentPropertyDeclaration.key.name] = currentPropertyDeclaration.typeAnnotation;

                                        return result;
                                    }, {} as Record<string, TSTypeAnnotation>);
                                this.declarations.push({
                                    structure,
                                    imports,
                                    path: normalizedPath,
                                    name: dtoClassDeclaration?.id?.name,
                                    superClass: dtoClassDeclaration.superClass as Identifier,
                                    type: DeclarationFileType.DTO,
                                } as DTOClassDeclaration);
                            }

                            break;
                        }
                        case DeclarationFileType.ENUM: {
                            const enumDeclarations: TSEnumDeclaration[] = exportNamedDeclarations
                                .filter((item) => item?.declaration?.type === 'TSEnumDeclaration')
                                .map((item) => item.declaration as TSEnumDeclaration);

                            for (const enumDeclaration of enumDeclarations) {
                                const structure: Record<string, Expression> = (enumDeclaration.members || []).reduce((result, currentMember) => {
                                    if (currentMember?.id?.type !== 'Identifier') {
                                        return result;
                                    }
                                    result[currentMember.id.name] = currentMember.initializer;
                                    return result;
                                }, {} as Record<string, Expression>);
                                this.declarations.push({
                                    path: normalizedPath,
                                    name: enumDeclaration?.id?.name,
                                    imports,
                                    type: DeclarationFileType.ENUM,
                                    structure,
                                } as EnumDeclaration);
                            }

                            break;
                        }
                        default:
                            continue;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
    }

    public abstract build(): Promise<void>;
    public abstract prePublish(): Promise<void>;
    public abstract publish(): Promise<void>;
    public abstract postPublish(): Promise<void>;
}

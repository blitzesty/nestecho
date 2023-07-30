import { SDKMaker } from '../../sdk-maker.abstract.class';

export class JavaScriptSDKMaker extends SDKMaker implements SDKMaker {
    public constructor() {
        super({
            name: 'javascript',
        });
    }

    public setCwd(): void {
        this.cwd = '/root/workspace/matrindex-api';
    }

    public async build() {}
    public async prePublish() {}
    public async publish() {}
    public async postPublish() {}
}

const a = new JavaScriptSDKMaker();
a.init();

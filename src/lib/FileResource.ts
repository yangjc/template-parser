/**
 * YJC <https://github.com/yangjc>
 */

'use strict';

import { resolve, basename, extname } from 'path';

export class FileResource {

    readonly filePath: string;
    readonly identityType?: string;
    readonly fileType: string;
    readonly fileName: string;
    readonly fileBasename: string;
    readonly isHidden: boolean;

    protected readType?: string; // 读取内容的方式

    constructor(filePaths: string[]) {
        this.filePath = resolve(...filePaths);
        this.fileBasename = basename(this.filePath);
        const t: string[] = this.fileBasename.toLowerCase().split('.');
        this.isHidden = t[0] === '';
        let headOffset: number = 0;
        if (this.isHidden || t.length < 3) {
            this.fileType = extname(this.fileBasename).substr(1);
            this.identityType = undefined;
        } else {
            this.identityType = t[0];
            this.fileType = t[t.length - 1];
            headOffset = this.identityType.length + 1;
        }
        this.fileName = this.fileBasename.substring(headOffset, this.fileBasename.length - this.fileType.length - 1);
    }

}

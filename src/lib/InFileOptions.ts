/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

export interface BuiltInOptions {
    'comment-start'?: string;
    'comment-end'?: string;
    'var-start'?: string;
    'var-end'?: string;
}

export interface Options extends BuiltInOptions {
    [name: string]: string | boolean;
}

export const optionsRegExpPattern: string = '\\.options';
export const nameRegExpChars: string = 'a-zA-Z0-9_\\.\\-';
export const lineBreaksRegExpChars: string = '\\r\\n';
export const lineBreaksRegExpPattern: string = '\\r?\\n|\\r';
export const blankRegExpChars: string = ' \\t';
export const blankRegExpPattern: string = `[${blankRegExpChars}]`;

export const builtInOptions: BuiltInOptions = {
    'comment-start': '//',
    'comment-end': '',
    'var-start': '{{',
    'var-end': '}}',
};

export function escapeDelimiter(delimiter: string): string {
    if (/\s/.test(delimiter.replace(/[ \t]+/g, ''))) {
        throw new Error(`Delimiters should not contain blank characters other than spaces and tabs.`);
    }
    return delimiter.replace(/[\-[\]{}()*+?.,\\^$|#]/g, '\\$&');
}

export function removeBlankTopLine(text: string): string {
    return text.replace(new RegExp(`^(?:${lbREP})`), '');
}

const lbStartRE: RegExp = new RegExp(`^(?:${lineBreaksRegExpPattern})`);

export function isNotStartWithLB(text: string): boolean {
    return !lbStartRE.test(text);
}


const optREP: string = optionsRegExpPattern;
const nameREC: string = nameRegExpChars;
const lbREC: string = lineBreaksRegExpChars;
const lbREP: string = lineBreaksRegExpPattern;
const blankREP: string = blankRegExpPattern;

export class InFileOptions {

    readonly options: Options = {};

    private commentStart: string;
    private commentEnd: string;
    private optionsREPattern: string;
    private optionsBlockRE: RegExp = null;
    private optionsItemRE: RegExp = new RegExp(`^([${nameREC}]+)(?:=(.*))?$`);
    private hasInFileOptions: boolean = true;
    private isOnTop: boolean = false;

    constructor(text: string, options?: BuiltInOptions) {
        this.setDefaults(options);
        this.getDelimiters(text);
        if (this.hasInFileOptions) {
            this.getBlockRE();
            this.getOptions(text);
            if (this.options['comment-start'] !== this.commentStart
                || this.options['comment-end'] !== this.commentEnd) {
                throw new Error(`Options error, comment delimiters conflicted.`);
            }
        }
    }

    private getBlockRE(): void {
        const cStartREP: string = escapeDelimiter(this.commentStart);
        const cEndREP: string = escapeDelimiter(this.commentEnd);
        this.optionsREPattern = `(?:^|${lbREP})${blankREP}*${cStartREP}${blankREP}*`
            + `${optREP}([^${nameREC}${lbREC}]+)([^${lbREC}]+)${cEndREP}${blankREP}*(?=${lbREP}|$)`;

        this.optionsBlockRE = new RegExp(
            `((?:${this.optionsREPattern})+)`,
            'g'
        );
    }

    private getDelimiters(text: string): void {
        this.commentStart = this.options['comment-start'];
        this.commentEnd = this.options['comment-end'];

        const re = new RegExp(`${optREP}([^${nameREC}${lbREC}]+)([^${lbREC}]+)`);
        let m: any = re.exec(text);
        if (!m) {
            this.hasInFileOptions = false;
            return;
        }

        const sep: string = m[1];
        const items: string[] = m[2].split(sep);
        for (let item of items) {
            if (item) {
                const m: any = this.optionsItemRE.exec(item);
                if (m && m[2] !== undefined) {
                    switch (m[1]) {
                        case 'comment-start':
                            this.commentStart = m[2];
                            break;
                        case 'comment-end':
                            this.commentEnd = m[2];
                            break;
                    }
                }
            }
        }
    }

    private getOptions(text: string): void {
        let m: any = this.optionsBlockRE.exec(text);
        if (!m) {
            return;
        }
        this.isOnTop = m.index === 0 && isNotStartWithLB(m[0]);
        const tBlock: string = m[0];
        const re = new RegExp(this.optionsREPattern, 'g');
        while (m = re.exec(tBlock)) {
            const sep: string = m[1];
            const items: string[] = m[2].split(sep);
            for (let item of items) {
                if (item) {
                    const m: any = this.optionsItemRE.exec(item);
                    if (m) {
                        this.options[m[1]] = m[2] === undefined ? true : m[2];
                    }
                }
            }
        }
    }

    private setDefaults(options: BuiltInOptions): void {
        for (let name in builtInOptions) {
            if (builtInOptions.hasOwnProperty(name)) {
                let value: string | boolean;
                if (options && options.hasOwnProperty(name)) {
                    value = options[<keyof BuiltInOptions>name];
                }
                if (typeof value === 'string' || typeof value === 'boolean') {
                    this.options[name] = value;
                } else {
                    this.options[name] = builtInOptions[<keyof BuiltInOptions>name];
                }
            }
        }
    }

    public removeOptions(text: string): string {
        if (this.optionsBlockRE) {
            text = text.replace(this.optionsBlockRE, '');
            if (this.isOnTop) {
                text = removeBlankTopLine(text);
            }
        }
        return text;
    }

}

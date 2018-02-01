/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

export interface BuiltInOptions {
    'comment-start'?: string;
    'comment-end'?: string;
    'var-start'?: string;
    'var-end'?: string;
    'ignore-head'?: string;
    'ignore-tail'?: string;
    'escape'?: string;
    'output'?: string;
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
    'ignore-head': '',
    'ignore-tail': '',
};

export function escapeForREPattern(delimiter: string): string {
    if (/\s/.test(delimiter.replace(/[ \t]+/g, ''))) {
        throw new Error(`Pattern should not contain blank characters other than spaces and tabs.`);
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
const sepCharREP: string = `[^${nameREC}${lbREC}]`;
const optStmtREP: string = `${optREP}(${sepCharREP}+)([^${lbREC}]+)`;

export class InFileOptions {

    // 声明需要在第一次解析使用的配置名
    readonly options: Options = {
        'comment-start': undefined,
        'comment-end': undefined,
        'escape': undefined,
        'ignore-head': undefined,
        'ignore-tail': undefined,
    };

    private escapeRE: RegExp = null;
    private optionsBlockRE: RegExp = null;
    private optionsLineRE: RegExp = null;
    private optionsItemRE: RegExp = new RegExp(`^([${nameREC}]+)(?:=(.*))?$`);
    private firstParsingCount: number = 0;
    private isOnTop: boolean = false;

    constructor(text: string, options?: BuiltInOptions) {
        this.initOptions(options);
        this.firstParse(text);
        if (this.firstParsingCount > 0) {
            this.getBlockRE();
            this.getOptions(text);
        }
        this.setDefaults();
        delete this.optionsLineRE;
        delete this.optionsItemRE;
    }

    private testOptionAsREPattern(optionName: string) {
        if (!this.options[optionName]) {
            return;
        }
        try {
            new RegExp(<string>this.options[optionName]);
        } catch (e) {
            e.message = `Regular expression for option "${optionName}" error.\n${e.message}`;
            throw e;
        }
    }

    private getBlockRE(): void {
        this.testOptionAsREPattern('ignore-head');
        this.testOptionAsREPattern('ignore-tail');

        const cStartREP: string = this.options['ignore-head'] + escapeForREPattern(this.options['comment-start']);
        const cEndREP: string = escapeForREPattern(this.options['comment-end']) + this.options['ignore-tail'];

        const lineREP = `(?:^|${lbREP})${blankREP}*${cStartREP}${blankREP}*`
            + `${optStmtREP}${cEndREP}${blankREP}*(?=${lbREP}|$)`;

        this.optionsLineRE = new RegExp(lineREP, 'g');
        this.optionsBlockRE = new RegExp(`((?:${lineREP})+)`);
    }

    private getEscapeRE(value: string): void {
        if (value) {
            try {
                this.escapeRE = new RegExp(`${escapeForREPattern(value)}([^${lbREC}])`, 'g');
            } catch (e) {
                e.message = `Regular expression for option "escape" error.\n${e.message}`;
                throw e;
            }
        }
        this.options['escape'] = value;
    }

    private firstParse(text: string): void {
        let m: any = new RegExp(optStmtREP).exec(text);
        if (!m) {
            return;
        }

        const sep: string = m[1];
        const items: string[] = m[2].split(sep);
        for (let item of items) {
            if (item) {
                const m: any = this.optionsItemRE.exec(item);
                if (m && m[2] !== undefined && this.options.hasOwnProperty(m[1])) {
                    this.firstParsingCount++;
                    const optionName: string = m[1];
                    const optionValue: string = m[2];
                    
                    switch (optionName) {
                        case 'escape':
                            this.getEscapeRE(optionValue);
                            break;
                        default:
                            this.options[optionName] = this.unescape(optionValue);
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
        while (m = this.optionsLineRE.exec(tBlock)) {
            const sep: string = this.unescape(m[1]);
            const items: string[] = this.unescape(m[2]).split(sep);
            for (let item of items) {
                if (item) {
                    const m: any = this.optionsItemRE.exec(item);
                    if (m) {
                        const optionName: string = m[1];
                        let optionValue: boolean | string = m[2] === undefined ? true : m[2];

                        if (optionName === 'escape') {
                            optionValue = `${this.options['escape']}${optionValue}`;
                        }

                        if (this.options.hasOwnProperty(optionName)) {
                            if (this.options[optionName] !== optionValue) {
                                throw new Error(`Option conflicted with first parsing.\n`
                                    + `First parsed count: ${this.firstParsingCount}\n`
                                    + `First parsed: ${optionName}=${this.options[optionName]}\n`
                                    + `Getting: ${optionName}=${optionValue}\n`
                                    + `Options RegExp: ${this.optionsLineRE}`);
                            }

                        } else {
                            this.options[optionName] = optionValue;
                        }
                    }
                }
            }
        }

    }

    private initOptions(options: BuiltInOptions): void {
        for (let name in this.options) {
            if (this.options.hasOwnProperty(name)) {
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

    private setDefaults(): void {
        for (let name in builtInOptions) {
            if (!this.options.hasOwnProperty(name)) {
                this.options[name] = builtInOptions[<keyof BuiltInOptions>name];
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

    // 用户可自定义的内容，都需要反转义。
    public unescape(text: string): string {
        if (this.escapeRE === null) {
            return text;
        }
        return text.replace(this.escapeRE, '$1');
    }

}

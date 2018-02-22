/**
 * YJC <https://github.com/yangjc>
 */

'use strict';

export interface BaseOptions {
    'comment-start'?: string;
    'comment-end'?: string;
    'ignore-head'?: string;
    'ignore-tail'?: string;
    'escape'?: string;
}

export interface BuiltInOptions extends BaseOptions {
    'var-start'?: string;
    'var-end'?: string;
    'no-echo'?: boolean;
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
    'escape': undefined,
    'no-echo': undefined,
};

export function isOptionValue(value: any) {
    switch (typeof value) {
        case 'boolean':
        case 'string':
            return true;
    }
    return false;
}

export function escapeForREPattern(text: string): string {
    if (/\s/.test(text.replace(/[ \t]+/g, ''))) {
        throw new Error(`Pattern should not contain blank characters other than spaces and tabs.`);
    }
    return text.replace(/[\-[\]{}()*+?.,\\^$|#]/g, '\\$&');
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

const firstLineOptions: (keyof BuiltInOptions)[] = [
    'comment-start',
    'comment-end',
    'escape',
    'ignore-head',
    'ignore-tail',
];

export class InFileOptions {

    readonly options: BuiltInOptions = {};

    private escapeRE?: RegExp;
    private optionsBlockRE?: RegExp;
    private optionsLineRE?: RegExp;
    private optionsItemRE: RegExp = new RegExp(`^([${nameREC}]+)(?:=(.*))?$`);
    private firstParsingCount: number = 0;
    private isOnTop: boolean = false;

    constructor(text: string, options: BuiltInOptions = {}) {
        this.initOptions(options);
        this.firstParse(text);
        if (this.firstParsingCount > 0) {
            this.getBlockRE();
            this.getOptions(text);
        }
        this.setOtherOptions(options);
        delete this.optionsLineRE;
        delete this.optionsItemRE;
    }

    private testOptionAsREPattern(optionName: keyof BuiltInOptions) {
        if (!this.options[optionName]) {
            return;
        }
        try {
            new RegExp(this.options[optionName] as string);
        } catch (e) {
            e.message = `Regular expression for option "${optionName}" error.\n${e.message}`;
            throw e;
        }
    }

    private getBlockRE(): void {
        this.testOptionAsREPattern('ignore-head');
        this.testOptionAsREPattern('ignore-tail');

        const cStartREP: string = this.options['ignore-head']
            + escapeForREPattern(this.options['comment-start'] as string);

        const cEndREP: string = escapeForREPattern(this.options['comment-end'] as string)
            + this.options['ignore-tail'];

        const lineREP = `(?:^|${lbREP})${blankREP}*${cStartREP}${blankREP}*`
            + `${optStmtREP}${cEndREP}${blankREP}*(?=${lbREP}|$)`;

        this.optionsLineRE = new RegExp(lineREP, 'g');
        this.optionsBlockRE = new RegExp(`((?:${lineREP})+)`);
    }

    private getEscapeRE(value: string): void {
        if (value) {
            value = value[0]; // 只取第一个字符作为转义字符

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
                m && this.firstParsingCount++;
                if (m && m[2] !== undefined && firstLineOptions.indexOf(m[1]) > -1) {
                    const optionName: keyof BuiltInOptions = m[1];
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
        let m: any = (this.optionsBlockRE as RegExp).exec(text);
        if (!m) {
            throw new Error(`Options conflicted with first parsing.`);
        }
        this.isOnTop = m.index === 0 && isNotStartWithLB(m[0]);
        const tBlock: string = m[0];
        while (m = (this.optionsLineRE as RegExp).exec(tBlock)) {
            const sep: string = this.unescape(m[1]);
            const items: string[] = this.unescape(m[2]).split(sep);
            for (let item of items) {
                if (item) {
                    const m: any = this.optionsItemRE.exec(item);
                    if (m && builtInOptions.hasOwnProperty(m[1])) {
                        const optionName: keyof BuiltInOptions = m[1];
                        let optionValue: boolean | string = m[2] === undefined ? true : m[2];

                        if (optionName === 'escape' && typeof optionValue === 'string') {
                            optionValue = optionValue[0];
                        }
                        
                        if (firstLineOptions.indexOf(optionName) > -1) {
                            if (this.options[optionName] !== optionValue) {
                                throw new Error(`Option conflicted with first parsing.\n`
                                    + `First parsed count: ${this.firstParsingCount}\n`
                                    + `First parsed: ${optionName}=${this.options[optionName]}\n`
                                    + `Getting: ${optionName}=${optionValue}\n`
                                    + `Options RegExp: ${this.optionsLineRE}`);
                            }

                        } else {
                            this.options[optionName] = optionValue as string;
                        }
                    }
                }
            }
        }

    }

    private getOptionValue(options: BuiltInOptions, name: keyof BuiltInOptions): void {
        let value: string | boolean | undefined = options && Object.prototype.hasOwnProperty.call(options, name)
            ? options[name]
            : undefined;

        if (isOptionValue(value) || isOptionValue(value = builtInOptions[name])) {
            this.options[name] = value;
        }
    }

    private initOptions(options: BuiltInOptions): void {
        for (let name of firstLineOptions) {
            if (builtInOptions.hasOwnProperty(name)) {
                this.options[name] = builtInOptions[name];
            }
        }
    }

    private setOtherOptions(options: BuiltInOptions): void {
        for (let name in builtInOptions) {
            if (builtInOptions.hasOwnProperty(name) && !Object.prototype.hasOwnProperty.call(this.options, name)) {
                this.getOptionValue(options, name as keyof BuiltInOptions);
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
        if (this.escapeRE === undefined) {
            return text;
        }
        return text.replace(this.escapeRE, '$1');
    }

}

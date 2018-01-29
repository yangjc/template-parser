/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

export interface PackActionOptions {
    indent?: string;
    lineBreaks?: string;
}

export interface PackAction {
    (options: PackActionOptions, ...inputs: any[]): string;
}

export interface PackActions {
    [name: string]: PackAction;
}

export const defaultLineBreaks = '\r\n';

export function setIndent(options: PackActionOptions, text: string): string {
    const lineBreaks: string = options.lineBreaks || defaultLineBreaks;
    if (typeof text !== 'string') {
        text = '' + text;
    }
    return text.replace(new RegExp(lineBreaks, 'g'), `${lineBreaks}${options.indent || ''}`);
}

// 不允许async函数
export const builtInActions: PackActions = {
    json: (options: PackActionOptions, ...values: any[]): string => {
        return values.map(v => JSON.stringify(v)).join('');
    },
    print: (options: PackActionOptions, ...values: any[]): string => {
        return values.join('');
    },
};

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

export const builtInActions: PackActions = {

    json: (options: PackActionOptions, value: any, replacer: any, space: string | number): string => {
        return JSON.stringify(value, replacer, space);
    },

};

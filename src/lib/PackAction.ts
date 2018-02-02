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

export interface Pack {
    [name: string]: PackAction | 'string' | 'number' | 'boolean' | Pack;
}

export const defaultLineBreaks = '\r\n';

export function setIndent(options: PackActionOptions, text: string): string {
    const lineBreaks: string = options.lineBreaks || defaultLineBreaks;
    if (typeof text !== 'string') {
        text = '' + text;
    }
    return text.replace(new RegExp(lineBreaks, 'g'), `${lineBreaks}${options.indent || ''}`);
}

export function wrapAction(fn: (...a: any[]) => any): PackAction {
    return function (options: PackActionOptions, ...args): string {
        return fn(...args);
    };
}

export function wrapPack(module: any, names?: string[]): Pack {
    const pack: Pack = {};

    names = names || Object.keys(module);
    for (let name in module) {
        switch (typeof module[name]) {
            case 'function':
                pack[name] = wrapAction(module[name]);
                break;
            case 'string':
            case 'number':
            case 'boolean':
                pack[name] = module[name];
                break;
        }
    }

    return pack;
}

export const builtInActions: PackActions = {

    json: (options: PackActionOptions, value: any, replacer: any, space: string | number): string => {
        return JSON.stringify(value, replacer, space);
    },

};

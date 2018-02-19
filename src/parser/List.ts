/**
 * YJC <https://github.com/yangjc>
 */

'use strict';

import { InFileOptions, BaseOptions } from '../lib/InFileOptions';

export interface ListOptions extends BaseOptions {
    'ignore-mark'?: string;
    'keep-blank-lines'?: boolean;
    'keep-duplicate'?: boolean;
    'no-trim'?: boolean;
}

export type List = string[];

export function getList(content: string): List {
    const options: ListOptions = new InFileOptions(content).options;
    const ignoreMark: string = options.hasOwnProperty('ignore-mark') ? (options['ignore-mark'] as string) : '#';
    const removeBlankLines: boolean = !options['keep-blank-lines'];
    const keepDuplicate: boolean = options['keep-duplicate'] === true;
    const useTrim: boolean = !options['no-trim'];

    return content.trim().split(/\r?\n|\r/).reduce((list: List, item: string): List => {
        if (ignoreMark && item.indexOf(ignoreMark) === 0) {
            return list;
        }
        if (useTrim) {
            item = item.trim();
        }
        if (removeBlankLines && !item) {
            return list;
        }
        if (keepDuplicate || list.indexOf(item) === -1) {
            list.push(item);
        }
        return list;
    }, []);
}

export function testList(result: any): boolean {
    if (!Array.isArray(result)) {
        return false;
    }
    if (result.length === 0) {
        return true;
    }
    for (let item of result) {
        if (typeof item !== 'string') {
            return false;
        }
    }
    return true;
}

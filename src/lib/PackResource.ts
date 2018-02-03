/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

export interface PackActionOptions {
    indent?: string;
    lineBreaks?: string;
}

export interface PackAction {
    (options: PackActionOptions, ...inputs: any[]): string | any;
}

export interface Pack {
    [name: string]: PackAction | 'string' | 'number' | 'boolean' | Pack;
}

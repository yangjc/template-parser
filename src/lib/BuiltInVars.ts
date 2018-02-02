/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

import * as path from 'path';
import * as url from 'url';

import { PackAction, PackActionOptions, Pack } from './PackResource';

export interface Vars {
    [varName: string]: any;
}

export function wrapAction(fn: (...a: any[]) => any): PackAction {
    return function (options: PackActionOptions, ...args): string {
        return fn(...args);
    };
}

export function wrapPack(module: any, names?: string[]): Pack {
    const pack: Pack = {};

    names = names || Object.keys(module);
    for (let name of names) {
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

export function cloneObject(target: any, source: any, toLowerName: boolean = false): any {
    for (let name in source) {
        if (source.hasOwnProperty(name)) {
            const value: any = source[name];
            if (toLowerName && typeof name === 'string') {
                name = name.toLowerCase();
            }
            switch (typeof value) {
                case 'number':
                case 'string':
                case 'boolean':
                case 'undefined':
                    target[name] = value;
                    break;
                case 'object':
                    target[name] = value ? cloneObject({}, value, toLowerName) : value;
                    break;
            }
        }
    }
    return target;
}

export class BuiltInVars implements Vars {

    readonly json: PackAction = wrapAction(JSON.stringify);

    readonly null: null = null;
    readonly undefined: undefined = undefined;
    readonly true: boolean = true;
    readonly false: boolean = false;

    readonly number = new Proxy({}, {
        get: function (target, name) {
            if (name === 'hasOwnProperty') {
                return target.hasOwnProperty = () => true;
            }
            return typeof name === 'number' ? name : (typeof name === 'string' ? Number(name) : NaN);
        },
    });

    readonly env = cloneObject({}, process.env);

    readonly process = {
        'env': cloneObject({}, process.env, true),
        'arch': process.arch,
        'platform': process.platform,
        'node-version': process.version,
        'versions': cloneObject({}, process.versions),
        'release': cloneObject({}, (<any>process).release),
    };

    readonly path = Object.assign(wrapPack(path), {
        win32: wrapPack(path.win32),
        posix: wrapPack(path.posix),
    });

    readonly url = wrapPack(url, [
        'format',
        'parse',
        'resolve',
        'domainToASCII',
        'domainToUnicode',
    ]);

    readonly Date = Object.assign(wrapPack(Date, [
        'UTC',
        'now',
        'parse',
    ]), {
        new: wrapAction((...a: any[]): Date => new Date(...a)),
    });

}

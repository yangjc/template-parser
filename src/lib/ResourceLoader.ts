/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

import { basename } from 'path';
import { FileResource } from './FileResource';
import { requireSync } from '../external/Require';
import { promisify } from 'util';
import { readFile } from 'fs';
import { getList } from '../parser/List';
import { nameRegExpChars } from './InFileOptions';
import { requestGet } from '../util/HttpClient';

interface Getters {
    [name: string]: Function;
}

export const varTypes = {
    list: 'list',
    json: 'json',
    text: 'text',
    pack: 'pack',
    get: 'get',
};

export const defaultVarType: string = varTypes.text;

export const resourceTypes = {
    http: 'http',
    file: 'file',
    node: 'node',
};

export const varTypeRegExpPattern = Object.keys(varTypes).join('|');

export function getResourceType(uri: string): string {
    if (!uri || typeof uri !== 'string') {
        return null;
    }

    if (/^\s/.test(uri)) {
        return null;
    }

    const i: number = uri.indexOf(':');
    if (i === 0) {
        return null;
    }
    if (i === 1 && !/^[a-zA-Z]$/.test(uri[0])) {
        return null;
    }
    if (i > 1) {
        // https://www.iana.org/assignments/uri-schemes/uri-schemes.xhtml
        const scheme: string = uri.substr(0, i);
        switch (scheme) {
            case 'http':
            case 'https':
                return resourceTypes.http;

            default:
                return null;
        }
    }

    return resourceTypes.file;
}

export class ResourceLoader {

    readonly resourceType: string;
    readonly uri: string;
    readonly varType: string;
    readonly name: string;

    public result: any;

    private exports: any;
    private content: string;
    private getters: Getters = {};

    constructor(uri: string, varType?: string) {
        this.resourceType = getResourceType(uri);
        switch (this.resourceType) {
            case null:
                throw new TypeError(`Not a resource URI "${uri}".`);

            case resourceTypes.file:
                const file: FileResource = new FileResource([uri]);
                if (!varType && file.identityType) {
                    varType = file.identityType;
                }
                this.name = file.fileName;
                break;

            default:
                this.name = basename(uri);
        }

        if (varType) {
            if (!varTypes.hasOwnProperty(varType)) {
                throw new TypeError(`Unknown var type "${varType}".`);
            }
        } else {
            varType = defaultVarType;
        }

        if (this.resourceType === resourceTypes.file
            && (varType === varTypes.pack || varType === varTypes.get)) {
            this.resourceType = resourceTypes.node;
        }

        this.uri = uri;
        this.varType = varType;
    }

    private async getContent(): Promise<void> {
        switch (this.resourceType) {
            case resourceTypes.node:
                this.content = '';
                this.exports = requireSync(this.uri);
                break;

            case resourceTypes.http:
                try {
                    this.content = await requestGet(this.uri);
                } catch (e) {
                    e.message = `Request "${this.uri}" error.\n${e.message}`;
                    throw e;
                }
                break;

            case resourceTypes.file:
                try {
                    this.content = await promisify(readFile)(this.uri, 'utf8');
                } catch (e) {
                    e.message = `Read file "${this.uri}" error.\n${e.message}`;
                }
                break;
            default:
                throw new Error(`Unknown resource type "${this.resourceType}".`);
        }

        if (typeof this.content !== 'string') {
            throw new TypeError(`Content should be string.`);
        }
    }

    private async parsePack(): Promise<void> {
        if (!this.hasOwnProperty('exports')) {
            throw new Error(`No exports to parse.`);
        }

        if (!this.exports || typeof this.exports !== 'object' || Array.isArray(this.exports)) {
            this.result = this.exports;
            return;
        }

        const nameRegExp = new RegExp(`^(${varTypeRegExpPattern}) ([${nameRegExpChars}]+)$`);

        this.result = {};

        for (let name in this.exports) {
            if (!this.exports.hasOwnProperty(name)) {
                continue;
            }
            const value: any = this.exports[name];
            const m: any = nameRegExp.exec(name);
            if (m && m[1] === varTypes.get) {
                if (typeof value === 'function') {
                    this.getters[m[2]] = value;
                } else {
                    throw new TypeError(`Var type "get" uses for function.`);
                }

            } else if (m && getResourceType(value)) {
                this.result[m[2]] = await new ResourceLoader(value, m[1]).getResult();
                
            } else {
                this.result[name] = typeof value === 'function' ? value.bind(this.result) : value;
            }
        }
    }

    private async parseGet(): Promise<any> {
        if (!this.hasOwnProperty('exports') || typeof this.exports !== 'function') {
            throw new TypeError(`Var type "get" uses for module which exports as function.`);
        }

        try {
            this.result = await this.exports();
        } catch (e) {
            e.message = `Parse as var type "get" error.\n${e.message}`;
            throw e;
        }
    }

    private async runGetters(): Promise<void> {
        for (let name in this.getters) {
            if (this.getters.hasOwnProperty(name)) {
                try {
                    this.result[name] = await this.getters[name].call(this.result);
                } catch (e) {
                    e.message = `Execute "get ${name}" error.\n${e.message}`;
                    throw e;
                }
            }
        }
        this.getters = null;
    }

    public async getResult(): Promise<any> {
        await this.getContent();

        switch (this.varType) {
            case varTypes.json:
                try {
                    this.result = JSON.parse(
                        this.content
                            .replace(/^\s*(?:;\s*)*(?:(?:[a-z_$][\w$]*)?\s*\()?/i, '')
                            .replace(/\)?(?:\s*;)*\s*$/, '')
                    );
                } catch (e) {
                    e.message = `Parse as json error.\n${e.message}`;
                    throw e;
                }
                break;

            case varTypes.list:
                this.result = getList(this.content);
                break;

            case varTypes.pack:
                await this.parsePack();
                break;

            case varTypes.text:
                this.result = this.content;
                break;

            case varTypes.get:
                await this.parseGet();
                break;
        }

        await this.runGetters();

        return this.result;
    }

}

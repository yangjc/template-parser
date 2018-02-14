/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

import { basename } from 'path';
import { FileResource } from './FileResource';
import { requireSync } from '../external/Require';
import { promisify } from 'util';
import { readFile, stat } from 'fs';
import { getList } from '../parser/List';
import { nameRegExpChars } from './InFileOptions';
import { requestGet, RequestCaches, RequestReturn } from '../util/HttpClient';

const rCaches: RequestCaches = {};

interface Getters {
    [name: string]: Function;
}

export const varTypes = {
    list: 'list',
    json: 'json',
    text: 'text',
    pack: 'pack',
    get: 'get',
    stat: 'stat',
};

export const defaultVarType: string = varTypes.text;

export const resourceTypes = {
    http: 'http',
    file: 'file',
    node: 'node',
};

export const valueVarTypes = {
    value: 'value',
    number: 'number',
    string: 'string',
};

export const varTypeRegExpPattern = `${Object.keys(varTypes).join('|')}|${Object.keys(valueVarTypes).join('|')}`;

export function getResourceType(uri: string): string | null {
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

    readonly resourceType: string | null;
    readonly uri: string;
    readonly varType: string;
    readonly name: string;

    private _result: any;

    private exports: any;
    private content?: string;
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

    private async readAsHttp(): Promise<void> {
        try {
            const r: RequestReturn = await requestGet(this.uri, rCaches);

            switch (this.varType) {
                case varTypes.stat:
                    this._result = r.headers;
                    break;

                default:
                    this.content = r.body;
            }

        } catch (e) {
            e.message = `Request "${this.uri}" error.\n${e.message}`;
            throw e;
        }
    }

    private async readAsFile(): Promise<void> {
        try {
            switch (this.varType) {
                case varTypes.stat:
                    this._result = await promisify(stat)(this.uri);
                    break;

                default:
                    this.content = await promisify(readFile)(this.uri, 'utf8');
            }

        } catch (e) {
            e.message = `Read file "${this.uri}" error.\n${e.message}`;
            throw e;
        }
    }

    private async getContent(): Promise<void> {
        switch (this.resourceType) {
            case resourceTypes.node:
                this.exports = requireSync(this.uri);
                break;

            case resourceTypes.http:
                await this.readAsHttp();
                break;

            case resourceTypes.file:
                await this.readAsFile();
                break;

            default:
                throw new Error(`Unknown resource type "${this.resourceType}".`);
        }
    }

    private parseJson(): void {
        try {
            this._result = JSON.parse(
                (this.content as string)
                    .replace(/^\s*(?:;\s*)*(?:(?:[a-z_$][\w$]*)?\s*\()?/i, '')
                    .replace(/\)?(?:\s*;)*\s*$/, '')
            );
        } catch (e) {
            e.message = `Parse as json error.\n${e.message}`;
            throw e;
        }
    }

    private async parsePack(): Promise<void> {
        if (!this.hasOwnProperty('exports')) {
            throw new Error(`No pack exports to parse.`);
        }

        if (!this.exports || typeof this.exports !== 'object' || Array.isArray(this.exports)) {
            this._result = this.exports;
            return;
        }

        const nameRegExp = new RegExp(`^(${varTypeRegExpPattern}) ([${nameRegExpChars}]+)$`);

        this._result = {};

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
                this._result[m[2]] = await new ResourceLoader(value, m[1]).getResult();
                
            } else {
                this._result[name] = typeof value === 'function' ? value.bind(this._result) : value;
            }
        }
    }

    private async parseGet(): Promise<any> {
        if (!this.hasOwnProperty('exports') || typeof this.exports !== 'function') {
            throw new TypeError(`Var type "get" uses for module which exports as function.`);
        }

        try {
            this._result = await this.exports();
        } catch (e) {
            e.message = `Parse as var type "get" error.\n${e.message}`;
            throw e;
        }
    }

    private async executeGetters(): Promise<void> {
        for (let name in this.getters) {
            if (this.getters.hasOwnProperty(name)) {
                try {
                    this._result[name] = await this.getters[name].call(this._result);
                } catch (e) {
                    e.message = `Execute "get ${name}" error.\n${e.message}`;
                    throw e;
                }
            }
        }
    }

    private async processVarType(): Promise<void> {
        if (this.hasOwnProperty('_result')) {
            return;
        }

        switch (this.varType) {
            case varTypes.json:
                this.parseJson();
                break;

            case varTypes.list:
                this._result = getList(this.content as string);
                break;

            case varTypes.pack:
                await this.parsePack();
                break;

            case varTypes.text:
                this._result = this.content;
                break;

            case varTypes.get:
                await this.parseGet();
                break;
        }
    }

    private clear(): void {
        delete this.content;
        delete this.exports;
        delete this.getters;
    }

    public async getResult(): Promise<any> {
        await this.getContent();
        await this.processVarType();
        await this.executeGetters();

        this.clear();

        return this._result;
    }

    public get result(): any {
        return this._result;
    }

}

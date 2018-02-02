/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

import { resolve, dirname } from 'path';
import { promisify } from 'util';
import { stat, readFile, writeFile } from 'fs';

import * as path from 'path';
import * as url from 'url';

import {
    ResourceLoader, resourceTypes, getResourceType, getValueType, getValue,
    varTypeRegExpPattern as varTypeREP
} from './ResourceLoader';
import { PackAction, PackActionOptions, builtInActions, setIndent, wrapPack } from './PackAction';
import {
    BuiltInOptions, InFileOptions, escapeForREPattern, removeBlankTopLine, isNotStartWithLB,
    nameRegExpChars as nameREC, lineBreaksRegExpChars as lbREC,
    blankRegExpPattern as blankREP, lineBreaksRegExpPattern as lbREP, optionsRegExpPattern as optREP
} from './InFileOptions';
import { requireSync } from '../external/Require';


export interface Vars {
    [varName: string]: any;
}

export interface Options extends BuiltInOptions {
    'remove-statements'?: boolean;
    'vars'?: Vars;
}

interface VarValue {
    expression: string;
    value: string;
}

interface VarsReplacement {
    text: string;
    expression: string;
    echoIndex: number;
    lineIndex: number;
    placeholder: string;
}

interface EchoBlockInfo {
    lines: number;
    vars: (string[])[];
}

interface ActionWithArgs {
    actionName?: string;
    action?: PackAction;
    args: any[];
}

export interface Info {
    var: string[];
    echo: EchoBlockInfo[];
}

export interface InfoError extends Error {
    desc: string;
}

export function readByNames(object: any, names: string[], index: number = 0): any {
    const name: string = names[index];
    if (!object.hasOwnProperty(name)) {
        return undefined;
    }
    const value: any = object[name];
    if (index === names.length - 1) {
        return value;
    }
    return value ? readByNames(value, names, index + 1) : undefined;
}

export function lowerObjectName(target: any, source: any): any {
    for (let name in source) {
        if (source.hasOwnProperty(name)) {
            const value: any = source[name];
            if (typeof name === 'string') {
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
                    target[name] = value ? lowerObjectName({}, value) : value;
                    break;
            }
        }
    }
    return target;
}

export class TemplateParser {

    readonly filePath: string;
    readonly placeholderSign: string = `${Date.now()}${Math.random().toString().substr(1)}`;

    public options: Options;
    public info: Info = {
        var: [],
        echo: [],
    };

    private errors: InfoError[] = [];
    private cStartREP: string;
    private cEndREP: string;
    private vStartREP: string;
    private vEndREP: string;

    private inFileOptions: InFileOptions;
    private fileDir: string;
    private content: string = null;
    private echoOptions: PackActionOptions[] = [];
    private vars: Vars = {
        null: null,
        undefined: undefined,
        true: true,
        false: false,
        number: new Proxy({}, {
            get: function (target, name) {
                if (name === 'hasOwnProperty') {
                    return target.hasOwnProperty = () => true;
                }
                return typeof name === 'number' ? name : (typeof name === 'string' ? Number(name) : NaN);
            },
        }),
        env: lowerObjectName({}, process.env),
        process: {
            'env': process.env,
            'arch': process.arch,
            'platform': process.platform,
            'node-version': process.version,
            'versions': process.versions,
            'release': (<any>process).release,
        },
        path: Object.assign({
            win32: wrapPack(path.win32),
            posix: wrapPack(path.posix),
        }, wrapPack(path)),
        url: wrapPack(url, [
            'format',
            'parse',
            'resolve',
            'domainToASCII',
            'domainToUnicode',
        ]),
        options: {},
    };
    private varsReplacements: VarsReplacement[] = [];
    
    constructor(filePath: string, options?: Options) {
        this.filePath = resolve(filePath);
        this.options = Object.assign({}, options);
        Object.assign(this.vars, this.options.vars);
        delete this.options.vars;
    }

    private getPlaceholder(index: number): string {
        return `~~~t-p-updating:${this.placeholderSign}#${index}~~~`;
    }

    private getVarStmtRE(): RegExp {
        // var var-type var-name = uri
        return new RegExp(
            `(?:^|${lbREP})${blankREP}*${this.cStartREP}${blankREP}*`
            + `var${blankREP}+(?:(${varTypeREP})${blankREP}+)?([${nameREC}]+)${blankREP}*=([^${lbREC}]+)`
            + `${this.cEndREP}${blankREP}*(?=${lbREP}|$)`,
            'g'
        );
    }

    private async getURIValue(uri: string): Promise<string> {
        const reg: RegExp = this.getAccessVarRE();
        let uriValue: string = '';
        let m: any;
        let i: number = 0;
        while (m = reg.exec(uri)) {
            const v: VarValue = await this.getVarValue(m[0], m[1], {indent: '', lineBreaks: '', });
            uriValue = `${uriValue}${uri.substring(i, m.index)}${v.value}`;
            i = m.index + m[0].length;
        }
        if (i > 0) {
            return `${uriValue}${uri.substr(i)}`;
        }
        return uri;
    }

    private async getVars(): Promise<void> {
        const regVars = this.getVarStmtRE();
        let m: any;
        while (m = regVars.exec(this.content)) {
            let varType: string = m[1];
            const varName: string = m[2];
            let uri: string = this.inFileOptions.unescape(m[3].trim());

            uri = await this.getURIValue(uri);

            let resourceType: string = getValueType(varType);
            
            if (resourceType) {
                try {
                    this.vars[varName] = getValue(varType, uri);
                } catch (e) {
                    resourceType = 'error';
                    e.desc = `Get value "${varType} ${uri}" error.\nFrom: ${m[0]}`;
                    this.errors.push(e);
                }

            } else if (resourceType = getResourceType(uri)) {
                switch (resourceType) {
                    case resourceTypes.file:
                    case resourceTypes.node:
                        uri = resolve(this.fileDir, uri);
                        break;
                }

                try {
                    const r = new ResourceLoader(uri, varType);
                    varType = r.varType;
                    this.vars[varName] = await r.getResult();
                    resourceType = r.resourceType;

                } catch (e) {
                    resourceType = 'error';
                    e.desc = `Load resource "${uri}" error.\nFrom: ${m[0]}`;
                    this.errors.push(e);
                }
            }

            this.info.var.push(`(${resourceType || 'ignored'}) ${varType} ${varName} = ${uri}`);
        }
    }

    private readVar(varText: string): any {
        const names: string[] = varText.split(/\s*:\s*/);
        if (!this.vars.hasOwnProperty(names[0])) {
            return varText;
        }
        const value: any = readByNames(this.vars, names, 0);
        return value === undefined ? '' : value;
    }

    private getActionWithArgs(varsText: string, offset: number, previousValue?: any): ActionWithArgs {
        const vars: string[] = varsText.split(new RegExp(`${blankREP}+`));
        const args: any[] = [];
        let usingPreValue: boolean = false;
        for (let i: number = offset, l: number = vars.length; i < l; i++) {
            if (vars[i] === ':') {
                usingPreValue = true;
                args.push(previousValue);
            } else {
                args.push(this.readVar(vars[i]));
            }

            if (offset === 0) {
                return {args};
            }
        }

        const actionName = vars[0];
        if (!usingPreValue) {
            args.push(previousValue);
        }

        return {
            actionName,
            action: builtInActions.hasOwnProperty(actionName)
                ? builtInActions[actionName]
                : this.readVar(actionName),
            args,
        };
    }

    private async getVarValue(varText: string, expression: string, options: PackActionOptions): Promise<VarValue> {
        const actions: string[] = expression.split(/\s*\|\s*/);

        let a: ActionWithArgs = this.getActionWithArgs(actions[0], 0);
        let value: any = a.args[0];

        const aLen: number = actions.length;
        if (aLen > 1) {
            for (let i: number = 1; i < aLen; i++) {
                a = this.getActionWithArgs(actions[i], 1, value);

                if (typeof a.action !== 'function') {
                    throw new Error(`Action "${a.actionName}" in ${varText} should be function.`);
                }

                try {
                    value = await a.action(options, ...a.args);
                } catch (e) {
                    e.message = `Execute action "${a.actionName}" in ${varText} Error.\n${e.message}`;
                    throw e;
                }
            }
        }

        return {
            expression: `${actions.join(' | ').replace(/\s+/, ' ')}`,
            value: value === undefined ? '' : setIndent(options, value),
        }
    }

    private getAccessVarRE(): RegExp {
        const varKeyREP: string = `(?::|[${nameREC}]+(?::[${nameREC}]+)*)`;
        const varsKeyREP: string = `${varKeyREP}(?:${blankREP}+${varKeyREP})*`;
        // {{ var0:key0:key1 var2 | var:action-name }}
        return new RegExp(
            `${this.vStartREP}${blankREP}*`
            + `((?:${varsKeyREP})?(?:${blankREP}*\\|${blankREP}*${varsKeyREP})*)`
            + `${blankREP}*${this.vEndREP}`,
            'g'
        );
    }

    private echoVars(text: string, echoIndex: number): string {
        const varsInfo: string[] = [];
        const lineIndex: number = this.info.echo[echoIndex].vars.length;
        this.info.echo[echoIndex].vars.push(varsInfo);
        return text.replace(this.getAccessVarRE(), ($0, $1) => {
            const index: number = this.varsReplacements.length;
            const placeholder: string = this.getPlaceholder(index);
            this.varsReplacements.push({
                text: $0,
                expression: $1,
                echoIndex,
                lineIndex,
                placeholder,
            });
            return placeholder;
        });
    }

    private async updateVarsReplacements(): Promise<void> {
        for (let item of this.varsReplacements) {
            const v: VarValue = await this.getVarValue(item.text, item.expression, this.echoOptions[item.echoIndex]);
            this.info.echo[item.echoIndex].vars[item.lineIndex].push(
                `(${v.value.length}) ${v.expression}`
            );
            this.content = this.content.replace(item.placeholder, v.value);
        }
    }

    private getEchoBlockRE(): RegExp {
        // echo ...
        // echo-end
        return new RegExp(
            `((?:`
            +   `(?:^|${lbREP})(${blankREP}*)${this.cStartREP}${blankREP}*`
            +   `echo${blankREP}[^${lbREC}]*${this.cEndREP}${blankREP}*(?=${lbREP}|$)`
            + `)+)`
            + `([\\s\\S]*?)`
            + `(`
            +   `(${lbREP})${blankREP}*${this.cStartREP}${blankREP}*`
            +   `echo-end${blankREP}*${this.cEndREP}${blankREP}*(?=${lbREP}|$)`
            + `)`,
            'g'
        );
    }

    private updateEcho(): void {
        this.content = this.content.replace(this.getEchoBlockRE(), ($0, $1, $2, $3, $4, $5) => {
            const tVarLines: string = $1;
            const indent: string = $2;
            const tEnd: string = $4;
            const lineBreaks: string = $5;
            const index: number = this.info.echo.length;
            const echoInfo: EchoBlockInfo = {
                lines: 0,
                vars: [],
            };
            this.info.echo.push(echoInfo);
            this.echoOptions.push({
                indent,
                lineBreaks,
            });

            // echo ...
            const regLine = new RegExp(
                `(?:^|${lbREP})${blankREP}*${this.cStartREP}${blankREP}*`
                + `echo${blankREP}([^${lbREC}]*)${this.cEndREP}${blankREP}*(?=${lbREP}|$)`,
                'g'
            );
            let m: any;
            let lines: string = '';
            while (m = regLine.exec(tVarLines)) {
                echoInfo.lines++;
                lines += `${lineBreaks}${indent}${this.echoVars(m[1], index)}`;
            }

            return `${tVarLines}${lines}${tEnd}`;
        });
    }

    private getOptions(): void {
        this.inFileOptions = new InFileOptions(this.content, this.options);
        Object.assign(this.options, this.inFileOptions.options);

        this.cStartREP = this.options['ignore-head'] + escapeForREPattern(this.options['comment-start']);
        this.cEndREP = escapeForREPattern(this.options['comment-end']) + this.options['ignore-tail'];
        
        this.vStartREP = escapeForREPattern(this.options['var-start']);
        this.vEndREP = escapeForREPattern(this.options['var-end']);
    }

    private async testFilePath(): Promise<void> {
        const s = await promisify(stat)(this.filePath);
        if (!s.isFile()) {
            throw new Error(`Not file "${this.filePath}".`);
        }

        this.fileDir = dirname(this.filePath);
    }

    private async getOutputFilePath(): Promise<void> {
        if (typeof this.options.output === 'string' && this.options.output) {
            this.options.output = this.inFileOptions.options.hasOwnProperty('output')
                ? resolve(this.fileDir, this.options.output)
                : resolve(this.options.output);
            this.inFileOptions.options.output = this.options.output;

            if (this.options.output.toLowerCase() === this.filePath.toLowerCase()) {
                throw new Error(`Output can't override source file.`);
            }

            let s: any;
            try {
                s = await promisify(stat)(this.options.output);
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    throw e;
                }
            }
            if (s && !s.isFile()) {
                throw new Error(`Output "${this.options.output}" exists but is not a file.`);
            }

            if (typeof this.options['remove-statements'] !== 'boolean') {
                this.options['remove-statements'] = true;
            }

        } else {
            this.options.output = this.inFileOptions.options.output = this.filePath;
        }
    }

    private removeTemplateStatements(): void {
        if (this.options['remove-statements'] !== true) {
            return;
        }

        this.content = this.inFileOptions.removeOptions(this.content);

        let m: any;

        m = this.getVarStmtRE().exec(this.content);
        this.content = this.content.replace(this.getVarStmtRE(), '');
        if (m && m.index === 0 && isNotStartWithLB(m[0])) {
            this.content = removeBlankTopLine(this.content);
        }

        m = this.getEchoBlockRE().exec(this.content);
        this.content = this.content.replace(this.getEchoBlockRE(), '$3');
        if (m && m.index === 0 && isNotStartWithLB(m[0])) {
            this.content = removeBlankTopLine(this.content);
        }
    }

    async parse(): Promise<string> {
        await this.testFilePath();
        this.content = await promisify(readFile)(this.filePath, 'utf8');
        this.getOptions();
        await this.getOutputFilePath();

        Object.assign(this.vars.options, this.inFileOptions.options);

        await this.getVars();
        await this.updateEcho();
        await this.updateVarsReplacements();

        this.removeTemplateStatements();
        
        await promisify(writeFile)(this.options.output, this.content, 'utf8');

        return this.options.output;
    }

    printError(): number {
        let i: number = 0;
        for (let e of this.errors) {
            console.log(`[ERROR ${++i}] ${e.desc}\n${e.stack}`);
        }
        return this.errors.length;
    }

}

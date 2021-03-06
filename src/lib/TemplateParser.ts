/**
 * YJC <https://github.com/yangjc>
 */

'use strict';

import { resolve, dirname } from 'path';
import { promisify } from 'util';
import { stat, readFile, writeFile } from 'fs';
import { createHash } from 'crypto';
import { fileHash } from '@yjc/util/file-hash';

import {
    ResourceLoader, resourceTypes, valueVarTypes, getResourceType,
    varTypeRegExpPattern as varTypeREP,
    varTypes
} from './ResourceLoader';
import { PackAction, PackActionOptions } from './PackResource';
import {
    BuiltInOptions, InFileOptions, escapeForREPattern, removeBlankTopLine, isNotStartWithLB,
    nameRegExpChars as nameREC, lineBreaksRegExpChars as lbREC,
    blankRegExpPattern as blankREP, lineBreaksRegExpPattern as lbREP
} from './InFileOptions';
import { Vars, BuiltInVars, hasVarKey } from './BuiltInVars';


export interface Options extends BuiltInOptions {
    'input': string;
    'output'?: string;
    'keep-statements'?: boolean;
    'vars'?: Vars;
}

interface VarInfo {
    varType: string;
    resourceType: string | null;
}

interface VarValue {
    expression: string;
    value: string | any;
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

interface FunctionalVarInfo {
    varType: string;
    example: string;
}

export interface Info {
    var: string[];
    echo: EchoBlockInfo[];
}

export const functionalVarsInfo: {[varName: string]: FunctionalVarInfo} = {
    '.output': {
        varType: 'string',
        example: 'var fn .output = output-file-path',
    },
    '.ignore': {
        varType: 'value',
        example: 'var fn .ignore = true',
    },
};

const NO_ARG: Symbol = Symbol();

function setIndent(options: PackActionOptions, text: string): string {
    const lineBreaks: string = options.lineBreaks || '';
    if (typeof text !== 'string') {
        text = '' + text;
    }
    return text.replace(new RegExp(lineBreaks, 'g'), `${lineBreaks}${options.indent || ''}`);
}

export class TemplateParser {

    readonly filePath: string;
    readonly placeholderSign: string = `${Date.now()}${Math.random().toString().substr(1)}`;

    public options: Options;
    public info: Info = {
        var: [],
        echo: [],
    };

    private warning: string[] = [];
    private cStartREP: string = '';
    private cEndREP: string = '';
    private vStartREP: string = '';
    private vEndREP: string = '';

    private inFileOptions?: InFileOptions;
    private fileDir: string = '';
    private content: string = '';
    private echoOptions: PackActionOptions[] = [];
    private vars: Vars;
    private varsReplacements: VarsReplacement[] = [];
    private hasDeclaredOutput: boolean = false;
    
    constructor(options: Options) {
        this.filePath = resolve(options.input);
        this.options = Object.assign({}, options);
        this.vars = Object.assign({}, this.options.vars);

        delete this.options.vars;
    }

    private getPlaceholder(index: number): string {
        return `~~~t-p-updating:${this.placeholderSign}#${index}~~~`;
    }

    private getVarStmtRE(): RegExp {
        // var var-type var-name = uri
        return new RegExp(
            `(?:^|${lbREP})${blankREP}*${this.cStartREP}${blankREP}*`
            + `var${blankREP}+(?:(${varTypeREP})${blankREP}+)?([${nameREC}]+)${blankREP}*(=|~)([^${lbREC}]+)`
            + `${this.cEndREP}${blankREP}*(?=${lbREP}|$)`,
            'g'
        );
    }

    private async getURIText(uri: string): Promise<string> {
        const reg: RegExp = this.getAccessVarRE();
        let uriValue: string = '';
        let m: any;
        let i: number = 0;
        while (m = reg.exec(uri)) {
            const v: VarValue = await this.getVarValue(m[0], m[1], {indent: '', lineBreaks: '', }, true);
            uriValue = `${uriValue}${uri.substring(i, m.index)}${v.value}`;
            i = m.index + m[0].length;
        }
        if (i > 0) {
            return `${uriValue}${uri.substr(i)}`;
        }
        return uri;
    }

    private async getValueURI(uri: string): Promise<any> {
        const m: any = this.getAccessVarRE().exec(`${this.options['var-start']}${uri}${this.options['var-end']}`);
        if (!m) {
            throw new Error(`Var-Type value should be a variable expression.`);
        }
        const v: VarValue = await this.getVarValue(m[0], m[1], {indent: '', lineBreaks: '', }, false);
        return v.value;
    }

    private async getOneVar(varType: string, varName: string, uri: string): Promise<VarInfo> {
        let resourceType: string | null;

        if (functionalVarsInfo.hasOwnProperty(varName)) {
            if (varType !== varTypes.fn) {
                throw new Error(`"${varName}" is a functional variable,`
                    + ` should use like "${functionalVarsInfo[varName].example}".`);
            }
            varType = functionalVarsInfo[varName].varType;
        }

        if (varType === valueVarTypes.value) {
            this.vars[varName] = await this.getValueURI(uri);
            return { varType, resourceType: valueVarTypes.value };
        }

        try {
            uri = await this.getURIText(uri);
        } catch (e) {
            e.message = `Get vars for URI text error.\n${e.message}`;
            throw e;
        }

        if (varType === valueVarTypes.number) {
            this.vars[varName] = Number(uri);
            return { varType, resourceType: valueVarTypes.value };
        }

        if (varType === valueVarTypes.string) {
            this.vars[varName] = uri;
            return { varType, resourceType: valueVarTypes.value };
        }

        if (resourceType = getResourceType(uri)) {
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
                e.message = `Load resource "${uri}" error.\n${e.message}`;
                throw e;
            }
        }

        return { varType, resourceType };
    }

    private async getVars(): Promise<void> {
        const regVars = this.getVarStmtRE();
        let m: any;
        while (m = regVars.exec(this.content)) {
            const varType: string = m[1];
            const varName: string = m[2];
            const operator: string = m[3];
            const uri: string = (this.inFileOptions as InFileOptions).unescape(m[4].trim());

            let varInfo: VarInfo;

            try {
                varInfo = await this.getOneVar(varType, varName, uri);
            } catch (e) {
                varInfo = {
                    varType,
                    resourceType: 'error',
                }
                e.message = `Get var "${varInfo.varType} ${varName}" error.\nFrom: ${m[0]}\n${e.message}`;
                
                if (operator === '=') {
                    throw e;
                } else {
                    this.warning.push(e.stack);
                }
            }

            this.info.var.push(
                `(${varInfo.resourceType || 'ignored'}) ${varInfo.varType || '?'} ${varName} = ${uri}`
            );
        }
    }

    private readByVarKeys(object: any, keys: string[], index: number = 0): any {
        let key: string = keys[index];

        if (index > 0 && key.substr(0, 2) === '..') {
            const n: string = key.substr(2);
            if (hasVarKey(this.vars, n)) {
                const v: any = this.vars[n];
                switch (typeof v) {
                    case 'string':
                    case 'number':
                        hasVarKey(object, v) && (key = v);
                        break;
                }
            }
        }

        if (!hasVarKey(object, key)) {
            return undefined;
        }

        const value: any = object[key];
        if (index === keys.length - 1) {
            return value;
        }

        switch (typeof value) {
            case 'object':
            case 'function':
                return this.readByVarKeys(value, keys, index + 1);
        }

        return undefined;
    }

    private readVar(varText: string): any {
        return this.readByVarKeys(this.vars, varText.split(/\s*:\s*/), 0);
    }

    private getActionWithArgs(varsText: string, offset: number, previousValue?: any): ActionWithArgs {
        const vars: string[] = varsText.split(new RegExp(`${blankREP}+`));
        const args: any[] = [];
        let usingPreValue: boolean = false;
        for (let i: number = offset, l: number = vars.length; i < l; i++) {
            if (vars[i] === ':') {
                usingPreValue = true;
                previousValue !== NO_ARG && args.push(previousValue);
            } else {
                args.push(vars[i] ? this.readVar(vars[i]) : NO_ARG);
            }

            if (offset === 0) {
                return {args};
            }
        }

        const actionName = vars[0];
        if (!usingPreValue && previousValue !== NO_ARG) {
            args.push(previousValue);
        }

        return {
            actionName,
            action: this.readVar(actionName),
            args,
        };
    }

    private async getVarValue(varText: string, expression: string, options: PackActionOptions, toString: boolean)
    : Promise<VarValue> {
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
            value: toString ? (value === undefined ? '' : setIndent(options, value)) : value,
        }
    }

    private getAccessVarRE(): RegExp {
        const varKeyREP: string = `(?::|[${nameREC}]+(?::[${nameREC}]*)*)`;
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
        if (this.options['no-echo'] === true) {
            return;
        }

        for (let item of this.varsReplacements) {
            const v: VarValue = await this.getVarValue(
                item.text, item.expression, this.echoOptions[item.echoIndex], true
            );
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
            +   `echo(?:${blankREP}[^${lbREC}]*)?${this.cEndREP}${blankREP}*(?=${lbREP}|$)`
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

            if (this.options['no-echo'] === true) {
                return `${tVarLines}${tEnd}`;
            }

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
                + `echo(?:${blankREP}([^${lbREC}]*))?${this.cEndREP}${blankREP}*(?=${lbREP}|$)`,
                'g'
            );
            let m: any;
            let lines: string = '';
            while (m = regLine.exec(tVarLines)) {
                echoInfo.lines++;
                lines += `${lineBreaks}${indent}${this.echoVars(m[1] || '', index)}`;
            }

            return `${tVarLines}${lines}${tEnd}`;
        });
    }

    private async testFilePath(): Promise<void> {
        const s = await promisify(stat)(this.filePath);
        if (!s.isFile()) {
            throw new Error(`Not file "${this.filePath}".`);
        }

        this.fileDir = dirname(this.filePath);
    }

    private getOptions(): void {
        this.inFileOptions = new InFileOptions(this.content, this.options);
        Object.assign(this.options, this.inFileOptions.options);

        this.cStartREP = this.options['ignore-head'] + escapeForREPattern(this.options['comment-start'] as string);
        this.cEndREP = escapeForREPattern(this.options['comment-end'] as string) + this.options['ignore-tail'];
        
        this.vStartREP = escapeForREPattern(this.options['var-start'] as string);
        this.vEndREP = escapeForREPattern(this.options['var-end'] as string);

        if (typeof this.options.output === 'string' && this.options.output) {
            this.hasDeclaredOutput = true;
            this.options.output = resolve(this.options.output);
        } else {
            this.options.output = this.filePath;
        }
    }

    private async getOutputFilePath(): Promise<void> {
        if (hasVarKey(this.vars, '.output')) {
            if (typeof this.vars['.output'] === 'string' && this.vars['.output']) {
                this.hasDeclaredOutput = true;
                this.options.output = resolve(this.fileDir, this.vars['.output']);
            } else {
                this.warning.push(`Ignoring functional var ".output".`);
            }
        }

        const output: string = this.options.output as string;

        if (this.hasDeclaredOutput) {
            if (output.toLowerCase() === this.filePath.toLowerCase()) {
                throw new Error(`Output can't override source file.`);
            }

            let s: any;
            try {
                s = await promisify(stat)(output);
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    throw e;
                }
            }
            if (s && !s.isFile()) {
                throw new Error(`Output "${output}" exists but is not a file.`);
            }

        } else {
            this.options['keep-statements'] = true;
        }
    }

    private removeTemplateStatements(): void {
        if (this.options['keep-statements']) {
            return;
        }

        this.content = (this.inFileOptions as InFileOptions).removeOptions(this.content);

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

    private async output(output: string): Promise<number> {
        const hash = createHash('sha512');
        hash.update(this.content);
        try {
            if (hash.digest('hex') === await fileHash(output, 'sha512')) {
                return 0;
            }
        } catch (e) {
            if (e.code !== 'ENOENT') {
                this.warning.push(`Compare output hash error.\n${e.stack}`);
            }
        }

        await promisify(writeFile)(output, this.content, 'utf8');

        return 1;
    }

    async parse(): Promise<string> {
        await this.testFilePath();

        this.content = await promisify(readFile)(this.filePath, 'utf8');
        this.getOptions();

        this.vars = new BuiltInVars((this.inFileOptions as InFileOptions).options, this.vars);
        this.vars.options.input = this.filePath;
        this.vars.options.output = this.options.output;

        await this.getVars();
        await this.updateEcho();
        await this.updateVarsReplacements();

        if (this.vars['.ignore'] === true) {
            return `Ignored, do nothing.`;
        }

        await this.getOutputFilePath();
        this.removeTemplateStatements();

        return (await this.output(this.options.output as string)) === 0
            ? 'Same output exists, do nothing.'
            : 'Output written.';
    }

    printError(): number {
        let i: number = 0;
        for (let e of this.warning) {
            console.log(`[WARNING ${++i}] ${e}`);
        }
        return this.warning.length;
    }

}

/**
 * YJC <yangjiecong@live.com>
 */

/* Example

// .options comment-start=// comment-end=
// .options var-start={{ var-end=}}

// var list a = http://
// var b = ./list.xxx.txt
// var c = ./pack.xxx.js
// var text d = http://
// var json e = http://
// var x = ./pack.xxx.js

// echo one value {{a}} {{c:varName}}
// echo use one action {{b|x:bAction}}
// echo multiple values to one action {{a b c:valueName|x:outAction}}
// echo multiple values to actions chain {{a b|x:outAction|x:mAction}}
// echo {{a b}} same as {{a}}{{b}}
// echo-end

 */

'use strict';

import { resolve, dirname } from 'path';
import { promisify } from 'util';
import { stat, readFile, writeFile } from 'fs';

import {
    ResourceLoader, getResourceType, resourceTypes,
    varTypeRegExpPattern as varTypeREP
} from './ResourceLoader';
import { PackAction, PackActionOptions, builtInActions, setIndent } from './PackAction';
import {
    BuiltInOptions, InFileOptions, escapeDelimiter, removeBlankTopLine, isNotStartWithLB,
    nameRegExpChars as nameREC, lineBreaksRegExpChars as lbREC,
    blankRegExpPattern as blankREP, lineBreaksRegExpPattern as lbREP, optionsRegExpPattern as optREP
} from './InFileOptions';
import { requireSync } from '../external/Require';


export interface Vars {
    [varName: string]: any;
}

export interface Options extends BuiltInOptions {
    output?: string;
    vars?: Vars;
}

interface VarsReplacement {
    actions: string;
    inputs: any[];
    echoIndex: number;
    lineIndex: number;
    inlineIndex: number;
    placeholder: string;
    text: string;
}

interface EchoBlockInfo {
    lines: number;
    vars: (string[])[];
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
    private outputFilePath: string = '';
    private content: string = null;
    private echoOptions: PackActionOptions[] = [];
    private vars: Vars = {};
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

    private getVarRE(): RegExp {
        // var var-type var-name = uri
        return new RegExp(
            `(?:^|${lbREP})${blankREP}*${this.cStartREP}${blankREP}*`
            + `var${blankREP}+(?:(${varTypeREP})${blankREP}+)?([${nameREC}]+)${blankREP}*=([^${lbREC}]+)`
            + `${this.cEndREP}${blankREP}*(?=${lbREP}|$)`,
            'g'
        );
    }

    private async getVars(): Promise<void> {
        const regVars = this.getVarRE();
        let m: any;
        while (m = regVars.exec(this.content)) {
            let varType: string = m[1];
            const varName: string = m[2];
            let uri: string = m[3].trim();
            let resourceType: string = getResourceType(uri);
            if (resourceType) {
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

    private readVar(varNames: string): any {
        return readByNames(this.vars, varNames.split(/\s*:\s*/), 0);
    }

    private readVars(varsNames: string): any[] {
        return varsNames.split(new RegExp(`${blankREP}+`)).map((names: string) => {
            const value: any = this.readVar(names);
            return value === undefined ? names : value;
        });
    }

    private echoVars(text: string, echoIndex: number): string {
        const rVarKey = `[${nameREC}]+(?::[${nameREC}]+)*`;
        const rAction = `(?:${blankREP}*\\|${blankREP}*${rVarKey})*`;
        // {{ var0:key0:key1 var2 | var:action-name }}
        const reg = new RegExp(
            `${this.vStartREP}${blankREP}*`
            + `(${rVarKey}(?:${blankREP}+${rVarKey})*)?(${rAction})`
            + `${blankREP}*${this.vEndREP}`,
            'g'
        );
        const varsInfo: string[] = [];
        const lineIndex: number = this.info.echo[echoIndex].vars.length;
        this.info.echo[echoIndex].vars.push(varsInfo);
        return text.replace(reg, ($0, $1, $2) => {
            const varsNames: string = $1 || '';
            const actions: string = ($2 && $2.replace(/^\s*\|\s*/, '')) || 'print';
            const inputs: any[] = this.readVars(varsNames);
            const inlineIndex: number = varsInfo.length;
            varsInfo.push(
                `${varsNames} | ${actions.replace(/\s*\|\s*/, ' | ')}`.replace(/\s+/, ' ')
            );

            const index: number = this.varsReplacements.length;
            const placeholder: string = this.getPlaceholder(index);
            this.varsReplacements.push({
                actions,
                inputs,
                echoIndex,
                lineIndex,
                inlineIndex,
                placeholder,
                text: $0,
            });

            return placeholder;
        });
    }

    private async updateVarsReplacements(): Promise<void> {
        for (let item of this.varsReplacements) {
            const inputs: any[] = item.inputs;
            const actions: string[] = item.actions.split(/\s*\|\s*/);
            const options: PackActionOptions = this.echoOptions[item.echoIndex];
            let isFirst: boolean = true;
            let value: any;

            for (let i = 0; i < inputs.length; i++) {
                if (typeof inputs[i] === 'function') {
                    inputs[i] = await inputs[i]();
                }
            }

            for (let actionName of actions) {
                const action: any = builtInActions.hasOwnProperty(actionName)
                    ? builtInActions[actionName]
                    : this.readVar(actionName);

                if (typeof action === 'function') {
                    if (isFirst) {
                        value = await (<PackAction>action)(options, ...inputs);
                    } else {
                        value = await (<PackAction>action)(options, value);
                    }
                    
                } else {
                    throw new Error(`Action "${actionName}" using in "${item.text}" should be function.`);
                }
                isFirst = false;
            }

            value = value ? setIndent(options, value) : '';
            this.info.echo[item.echoIndex].vars[item.lineIndex][item.inlineIndex]
                = `(${value.length}) ${this.info.echo[item.echoIndex].vars[item.lineIndex][item.inlineIndex]}`;
            this.content = this.content.replace(item.placeholder, value);
        }
    }

    private getEchoRE(): RegExp {
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
        this.content = this.content.replace(this.getEchoRE(), ($0, $1, $2, $3, $4, $5) => {
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

        this.cStartREP = escapeDelimiter(this.options['comment-start']);
        this.cEndREP = escapeDelimiter(this.options['comment-end']);
        this.vStartREP = escapeDelimiter(this.options['var-start']);
        this.vEndREP = escapeDelimiter(this.options['var-end']);
    }

    private async statFilePath(): Promise<void> {
        const s = await promisify(stat)(this.filePath);
        if (!s.isFile()) {
            throw new Error(`Not file "${this.filePath}".`);
        }

        this.fileDir = dirname(this.filePath);
    }

    private async getOutputFilePath(): Promise<void> {
        if (typeof this.options.output === 'string' && this.options.output) {
            this.outputFilePath = this.inFileOptions.options.hasOwnProperty('output')
                ? resolve(this.fileDir, this.options.output)
                : resolve(this.options.output);

            if (this.outputFilePath.toLowerCase() === this.filePath.toLowerCase()) {
                throw new Error(`Output can't override source file.`);
            }

            let s: any;
            try {
                s = await promisify(stat)(this.outputFilePath);
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    throw e;
                }
            }
            if (s && !s.isFile()) {
                throw new Error(`Output "${this.outputFilePath}" exists but is not a file.`);
            }
        }

    }

    private removeTemplateStatements(): void {
        this.content = this.inFileOptions.removeOptions(this.content);

        let m: any;

        m = this.getVarRE().exec(this.content);
        this.content = this.content.replace(this.getVarRE(), '');
        if (m && m.index === 0 && isNotStartWithLB(m[0])) {
            this.content = removeBlankTopLine(this.content);
        }

        m = this.getEchoRE().exec(this.content);
        this.content = this.content.replace(this.getEchoRE(), '$3');
        if (m && m.index === 0 && isNotStartWithLB(m[0])) {
            this.content = removeBlankTopLine(this.content);
        }
    }

    async parse(): Promise<string> {
        await this.statFilePath();
        this.content = await promisify(readFile)(this.filePath, 'utf8');
        this.getOptions();
        
        await this.getOutputFilePath();
        await this.getVars();
        await this.updateEcho();
        await this.updateVarsReplacements();

        let output: string;
        if (this.outputFilePath) {
            this.removeTemplateStatements();
            output = this.outputFilePath;
        } else {
            output = this.filePath;
        }
        
        await promisify(writeFile)(output, this.content, 'utf8');
        return output;
    }

    printError(): number {
        let i: number = 0;
        for (let e of this.errors) {
            console.log(`[ERROR ${++i}] ${e.desc}\n${e.stack}`);
        }
        return this.errors.length;
    }

}

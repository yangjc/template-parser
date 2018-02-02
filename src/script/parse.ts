/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

import { resolve } from 'path';
import * as minimist from 'minimist';
import { TemplateParser, Options } from '../lib/TemplateParser';

(async () => {
    const argv: minimist.ParsedArgs = minimist(process.argv.slice(2));
    let file: string = argv._[0];
    if (!file) {
        return console.log(
            `Usage
    node parse.js file-path [--%s=] [--%s=] [--%s=] [--%s=] [--%s=] [--%s]`,
            'comment-start',
            'comment-end',
            'var-start',
            'var-end',
            'output',
            'keep-statements',
        );
    }

    file = resolve(process.cwd(), file);
    const options: Options = {
        'comment-start': argv['comment-start'],
        'comment-end': argv['comment-end'],
        'var-start': argv['var-start'],
        'var-end': argv['var-end'],
        'output': argv['output'],
        'keep-statements': argv['keep-statements'],
    };
    // options.commentStart = '//\t';
    // options.commentEnd = '';
    console.log(`\ninput: ${file}\n\ncli options: ${JSON.stringify(options, null, 2)}`);

    const parser = new TemplateParser(file, options);
    let parseError: Error;
    let outputFile: string;
    try {
        outputFile = await parser.parse();
    } catch (e) {
        parseError = e;
    }
    console.log(`\noptions: ${JSON.stringify(parser.options, null, 2)}`);
    console.log(`\ninfo: ${JSON.stringify(parser.info, null, 2)}`);
    parser.printError();
    if (parseError) {
        console.log(`\nparse error:\n`);
        console.error(parseError);
    } else {
        console.log(`\noutput: ${outputFile}`);
    }
})().catch(console.error);

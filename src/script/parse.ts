/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

import { resolve } from 'path';
import * as minimist from 'minimist';
import { TemplateParser, Options } from '../lib/TemplateParser';

(async () => {
    const argv: minimist.ParsedArgs = minimist(process.argv.slice(2));
    const file: string = argv._[0];
    if (!file) {
        return console.log(
            `Usage
    node parse.js file-path [--%s=] [--%s] [--%s=] [--%s=]`,
            'output',
            'keep-statements',
            'comment-start',
            'comment-end'
        );
    }

    const options: Options = {
        'input': resolve(process.cwd(), file),
        'comment-start': argv['comment-start'],
        'comment-end': argv['comment-end'],
        'output': argv['output'],
        'keep-statements': argv['keep-statements'],
    };
    // options.commentStart = '//\t';
    // options.commentEnd = '';
    console.log(`\ncli options: ${JSON.stringify(options, null, 2)}`);

    const parser = new TemplateParser(options);
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
        console.error(`\nparse error:\n\n${parseError.message}\n`);
        console.error(parseError);
    } else {
        console.log(`\noutput: ${outputFile}`);
    }
})().catch(console.error);

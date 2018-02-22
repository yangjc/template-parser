/**
 * YJC <https://github.com/yangjc>
 */

'use strict';

import { resolve } from 'path';
import * as minimist from 'minimist';
import { TemplateParser, Options } from '../lib/TemplateParser';

export { TemplateParser };

process.mainModule && process.mainModule.filename === __filename && (async () => {
    const { _, ...argv } = minimist(process.argv.slice(2));
    const file: string = _[0];

    if (!file) {
        console.log(
            `Usage
    node parse.js file-path [--%s=] [--%s] [--%s=] [--%s=]`,
            'output',
            'keep-statements',
            'comment-start',
            'comment-end'
        );
        process.exit(1);
        return;
    }

    const options: Options = Object.assign({
        'input': resolve(process.cwd(), file),
    }, argv);
    // options.commentStart = '//\t';
    // options.commentEnd = '';
    console.log(`\ncli options: ${JSON.stringify(options, null, 2)}`);

    const parser = new TemplateParser(options);
    let parseError: Error | undefined;
    let message: string | undefined;
    try {
        message = await parser.parse();
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
        console.log(`\nmessage: ${message}`);
    }

    process.exit(parseError ? 2 : 0);
    
})().catch(e => {
    console.error(e);
    process.exit(3);
});

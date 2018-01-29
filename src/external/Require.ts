/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

export const requireSync = require;

export const webpackExternals: any[] = [
    function (context: string, request: string, callback: (...a: any[]) => void): void {
        if (/\/Require$/.test(request)) {
            console.log(context);
            return callback(null, '{requireSync: require}');
        }
        callback();
    }
];

/**
 * YJC <yangjiecong@live.com>
 */

'use strict';

import { URL } from 'url';
import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';

export function requestGet(url: string, cache?: any): Promise<string> {
    if (cache && cache.hasOwnProperty(url)) {
        return Promise.resolve(cache[url]);
    }

    let request: typeof httpGet;
    const u: URL = new URL(url);
    switch (u.protocol) {
        case 'http:':
            request = httpGet;
            break;
        case 'https:':
            request = httpsGet;
            break;
        default:
            throw new Error(`Unsupported protocol "${u.protocol}" in "${url}".`);
    }

    return new Promise((resolve, reject) => {
        request(url, res => {
            if (res.statusCode !== 200) {
                // consume response data to free up memory
                res.resume();
                return reject(new Error(`Request Failed, Status Code: ${res.statusCode}`));
            }

            res.setEncoding('utf8');
            let rawData: string = '';
            res.on('data', chunk => {
                rawData += chunk;
            });
            res.on('error', reject);
            res.on('end', () => {
                if (cache) {
                    cache[url] = rawData;
                }
                resolve(rawData);
            });
        }).on('error', reject);
    });
}

// [var-type var-name] = resource-uri
exports['list hosts'] = `${process.env['SystemRoot']}\\System32\\Drivers\\etc\\hosts`;
exports['text html'] = 'https://raw.githubusercontent.com/yangjc/yangjc.github.io/master/index.html';
exports['json package'] = 'https://raw.githubusercontent.com/yangjc/server-k/master/package.json';
exports.config = {host: '127.0.0.1', port: 80};
exports.numbers = [233, 666];

exports.showSth = function() {
    return `${this.config.host}:${this.config.port}\n${this.numbers}`;
};
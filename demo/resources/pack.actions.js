exports.printList = function(o, input) {
    return input.join(o.lineBreaks);
};
exports.addLineNumber = function(o, input) {
    let i = 1;
    return `${i} ${input.replace(new RegExp(o.lineBreaks, 'g'), ($0) => `${$0}${++i} `)}`;
};
exports.likeLadder = function(o, ...inputs) {
    let i = 0;
    return inputs.reduce((t, input) => {
        return input.reduce((t, item) => `${t}${' '.repeat(i++)}${item}${o.lineBreaks}`, t);
    }, '');
};
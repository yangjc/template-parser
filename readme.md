# template-parser

A template parser for any type of file.

Write the *template statements* in contents where can be ignored.\
Template parser will replace all variables.\
*Template statements* will be kept if updating file itself, but will be deleted if writing to another file.

All options, like *comment start/end marks*, or *variable start/end marks*, can be customized.

## Install

    npm i @yjc/template-parser
    cd @yjc/template-parser && npm run-script build

## Usage

In CLI:

    npm run-script parse file-path [--comment-start=] [--comment-end=] [--var-start=] [--var-end=] [--output=]

## Template Language Syntax

Examples:

    ##[ .options comment-start=##[ comment-end=]## ]##
    
    ##[ var var-actions = resource-uri ]##
    ##[ var var-obj = resource-uri ]##
    
    ##[ echo some text ]##
    ##[ echo-end ]##

    ##[ echo line one {{ var-name }} {{ var-obj:key0 }} ]##
    ##[ echo More lines ]##
    ##[ echo-end ]##

Some rules:

1. All lines with *template statements* must be wrapped by *comment start/end marks*.
1. A *template statement* should be written inside one line, no real contents around.

Don't use like:

    /* .options comment-start=/* comment-end=*/ /**/
    /* var a = xxx.txt */ 'Some real content...';

### Tokens

* *comment start/end marks*
* *variable start/end marks*
* `var`
* `echo`
* `.options`

### var statement

*Var statement* define variables.

    ##[ var var-type var-name = resource-uri ]##

Variable value comes from local file or http/https url.\
Var-Type tells how to parse resource.

### echo statements

*Echo statements* print lines with variables.

    ##[ echo line]##
    ##[ echo ]##
    ##[ echo line after an empty line]##
    Real content will be written from here,
    util "echo-end".
    ##[ echo-end ]##

Some rules:

1. Blank character after `echo` is required.
1. No empty lines between `##[ echo ]##` lines.

In this case, `##[ echo a line]##` will be ignored:

    ##[ echo a line]##

    ##[ echo another line]##
    ##[ echo-end ]##

### Variables

Variables in *echo statements* will be replace by their values.\
Variables are wrapped by *variable marks*.

    ##[ echo line one {{ var-name }} {{ obj:key0 }} ]##
    ##[ echo More lines {{ obj:key-of-obj:key-of-key-of-obj | actions:action0 | actions:action1 }} ]##
    ##[ echo Multiple variables to action {{ obj:key1 obj:key2 obj:key3 | actions:action2 }} ]##
    ##[ echo-end ]##

Some rules:

1. Characters allowed in name are: `a-z` `A-Z` `0-9` `_` `.` `-`, no blanks.
1. Use `:` to get property of variable, NOT `.`, because `.` is allowed in name.
1. No blanks around `:`.
1. Use `|` to call actions (functions), similar as piping in Linux.
1. Multiple variables allowed before **first** `|`.
1. If variable before first `|` is a function, it will be executed and pass return to next action.
1. Default action is `print`, means `.toString()`.
1. Type of first action: `(options: ActionOptions, ...inputs: any[]) => string`.
1. Type of other actions: `(options: ActionOptions, input: string) => string`.

### options statement

    ##[ .options name=value name1=value1 ]##
    ##[ .options::name2=value2::other=::boolean-option]##

1. Characters allowed in options name are same as variable name.
1. Characters between `.options` and first name is separator, can be customized.
1. All characters allowed in separator but characters in name.
1. No blanks around name and `=`.
1. If an option has not `=` after it's name, it is a boolean option, and assigned with `true`.

## Details

### Resource URI

* `http` or `https` url.
* Local file path (related to current file path).

### Local File Resource Name

File name rule: `var-type.file-name.file-type`.

### Var-Type

* `list` Parse plain text, return array of echo line.
* `json` Using `JSON.parse()`.
* `text` Return plain text.
* `pack` Return Node.js module.
* `get`  Execute function and using it's return.

`http`/`https` resources use `text` by default, and `pack`/`get` is not available.\
For Local file resource, all types are available.
If var-type not declared, get var-type from file name, otherwise use `text`.

#### Pack Type

Declare var-type:

    exports[`${varType} ${varName}`] = "resource-uri";

Declare `get` type:

    exports[`get ${varName}`] = function () {};

Using context in action:

    exports.someValue = 233;
    exports.someAction = function (options, ...inputs) {
        return this.someValue * this.someValue;
    };

Processing Logic:

1. If var-type declared, load resource and assigns to result, var-type will be removed from name.
1. Context of actions is bind to parsed result.
1. `get` type will be executed at last, means result context is available.

Check `demo/pack.*.js` for examples.

### Built-in Actions

* `json` Output using `JSON.stringify()`.

### ActionOptions

* `indent` Blanks in front of line.
* `lineBreaks` Line breaks characters.

### Built-in Options

* `comment-start` Default: `//`.
* `comment-end` Default: (empty string).
* `var-start` Default: `{{`.
* `var-end` Default: `}}`.

#### Other Options

* `output` Path of output file. 

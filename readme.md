# template-parser

A template parser for any type of file.

Write the *template statements* in contents where can be ignored, like comments.\
Template parser will replace all variables in *Statements*.\
*Statements* will be kept if updating file itself, and will be removed if writing to another file.

All options, like *comment delimiters*, or *variable delimiters*, can be customized.

## Install

    npm i @yjc/template-parser
    cd @yjc/template-parser && npm run-script build

## Usage

In CLI:

    npm run-script parse file-path [--output=] [--keep-statements] [--comment-start=] [--comment-end=]

## Template Language Syntax

Examples:

    // var var-name = resource-uri
    // var var-obj = resource-uri
    
    // echo line one {{ var-name }} {{ var-obj:key }}
    // echo More lines
    // echo-end

Some rules:

1. All lines with *template statements* must be wrapped by *comment delimiters*.
1. A *template statement* includes a whole line.

Don't use like:

    'Some real content...'; // var a-var = resource-uri

### Delimiters

* *comment delimiters*
* *variable delimiters*

### Tokens

* `var`
* `echo`
* `echo-end`
* `.options`

### Operators

* `=` `~` Assigning value to a variable.
* `:` Accessing property value of a variable, or return value from previous action.
* `|` Calling action (function), like piping.

### Statements

* *var statement*
* *echo statement*
* *echo-end statement*
* *options statement*

### var statement

*var statement* reads value, resource data or pack module, and assigns to a variable name.

The following examples are using `##[` and `]##` as *comment delimiters*,
in order to show the end of statements clearly.

    ##[ var var-type var-name = resource-uri ]##
    ##[ var text a-var ~ ignoring-read-error ]

*Var-Type* tells how to parse resource. *Var-Type* is optional.

Use `~` instead of `=` if you want to ignore reading error, otherwise any error while reading will break the program.

### echo statement, echo-end statement

Continuous *echo statements* print lines with variables.\
*echo-end statement* tells the end of replacement block.

    ##[ echo line]##
    ##[ echo ]##
    ##[ echo line after an empty line]##
    Real content will be written from here,
    until "echo-end" statement.

    ##[ echo-end ]##

In this case, "line 3" will be rewritten, because "line 3" is separated by blank line (not continuous anymore):

    ##[ echo line 1: echo statements beginning]##
    ##[ echo line 2: OK, continuous echo statement]##

    ##[ echo line 3: this line will be rewritten]##
    ##[ echo-end ]##

### Variable Expression

Variables in *echo statement* or *resource uri* will be replace by their values.\
Variables are wrapped by *variable delimiters*.

    ##[ var string a = Path: {{ process:env:path }} {{ another-var }} ]##
    ##[ var string key = {{ string-from-a-variable }}]##
    ##[ var value e = process:env ]

    ##[ echo line one {{ var-name }} {{ obj:..key }} ]##
    ##[ echo More lines {{ obj:key0:key1 | pack:action0 | pack:action1 }} ]##
    ##[ echo Multiple variables to action {{ obj:key | pack:action2 : obj:key2 obj:key3 }} ]##
    ##[ echo-end ]##

Some rules:

1. Characters allowed in name are: `a-z` `A-Z` `0-9` `_` `.` `-`, no blanks.
1. Use `:` to get property of variable, NOT `.`, because `.` is allowed in name. No blanks around `:`.
1. Multiple variables are separated by blanks.
1. The statement after each `|` is an action calling.
The first variable is the action (function), all arguments following.
Use a single `:` to access the return value of previous action.
1. The statement before first `|` means the action of "return the first variable, and ignore others".
1. Use `..` before a key to access variable as a property name.

### options statement

    ##[ .options comment-start=##[ comment-end=]## ]##
    ##[ .options::name=value::other=::boolean-option]##

Some rules:

1. Characters allowed in options name are same as variable name.
1. Characters between `.options` and first name is separator, can be customized.
1. All characters allowed in separator but characters in name.
1. No blanks around name and `=`.
1. If an option has not `=` after it's name, it is a boolean option, and assigned with `true`.

## Details

### Resource URI

* `http` or `https` url.
* Local file path (related to current file path).
* A value.

### Local File Resource Name

File name rule: `var-type.file-name.file-type`.

### Var-Type

* `list` Parse plain text, return array of each line.
* `json` Using `JSON.parse()`.
* `text` Return plain text.
* `pack` Return Node.js module.
* `get` Execute function and using it's return.
* `stat` Return http/https response headers, or [file stat](https://nodejs.org/api/fs.html#fs_class_fs_stats).
* `value` Variable expression without delimiters.
* `number` Will be converted to number.
* `string` Same as what you write.

`http`/`https` resources using `text` by default, and `pack`/`get` is not available.\
For Local file resource, all types are available.

If *var-type* not declared, get *var-type* from file name, otherwise use `text`.

#### Pack Type

Declare *var-type*:

    exports[`${varType} ${varName}`] = "resource-uri";

Declare `get` type:

    exports[`get ${varName}`] = function () {};

Using context in action:

    exports.someValue = 233;
    exports.someAction = function (options, ...inputs) {
        return this.someValue * this.someValue;
    };

Processing Logic:

1. If *var-type* declared, loads resource and assigns to `result[varName]`,
*var-type* will be removed from property name.
1. Context of actions is bind to parsed `result`.
1. `get` type will be executed at last, means `result` context is available.

Check `demo/resources/pack.*.js` for examples.

### Built-in Variables

* `options` In file options, `options:input` `options:output`.
* `number:*` Any number.
* `string:*` String of a name.
* [`json`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify)
* `null` `undefined` `true` `false`
* [`path`](https://nodejs.org/api/path.html)
* [`url`](https://nodejs.org/api/url.html)
 `url:format` `url:parse` `url:resolve` `url:domainToASCII` `url:domainToUnicode`
* [`env`](https://nodejs.org/api/process.html#process_process_env)
* [`process:env`(with lowercase names)](https://nodejs.org/api/process.html#process_process_env)
 [`process:arch`](https://nodejs.org/api/process.html#process_process_arch)
 [`process:platform`](https://nodejs.org/api/process.html#process_process_platform)
 [`process:node-version`](https://nodejs.org/api/process.html#process_process_version)
 [`process:versions`](https://nodejs.org/api/process.html#process_process_versions)
 [`process:release`](https://nodejs.org/api/process.html#process_process_release)
* [`Date:new`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)
 [`Date:parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse)
 [`Date:UTC`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/UTC)
 [`Date:now`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now)

### Functional Variables

* `.output` Declare output file.
* `.ignore` If `true`, do nothing.

### Actions

Type of an action: `(options: ActionOptions, ...inputs: any[]) => any`.

#### ActionOptions

* `indent` Blanks in front of line.
* `lineBreaks` Line breaks characters.

### First Line Options

The following options must be written in the first line of *options statements*.

* `comment-start` Default: `//`. The delimiter for comment start.
* `comment-end` Default: (empty string). The delimiter for comment end.
* `escape` Default: (undefined). Escaping character. If defined, this option must be written first.
* `ignore-head` Default: (empty string).
Regular expression for ignoring some characters in the head of *statement* line.
* `ignore-tail` Default: (empty string).
Regular expression for ignoring some characters at the tail of *statement* line.

### Other Options

* `var-start` Default: `{{`. The delimiter for variable start.
* `var-end` Default: `}}`. The delimiter for variable end.

## TODO

* Support calling local command as action.

<!--- Reference#1 https://en.wikipedia.org/wiki/Comparison_of_programming_languages_(syntax) --->

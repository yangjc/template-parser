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

    npm run-script parse file-path [--comment-start=] [--comment-end=] [--var-start=] [--var-end=] [--output=]

## Template Language Syntax

Examples:

    // var var-name = resource-uri
    // var var-obj = resource-uri
    
    // echo some text
    // echo-end

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

* `=` Assigning resource to a variable.
* `:` Accessing property value of a variable, or return value from previous action.
* `|` Calling action (function), like piping.

### Statements

* *var statement*
* *echo statement*
* *echo-end statement*
* *options statement*

### var statement

*var statement* define variables.

Notice, the following examples are using `##[` and `]##` as *comment delimiters*,
in order to show the end of statements clearly.

    ##[ var var-type var-name = resource-uri ]##

Variable value comes from a resource or a value.\
*Var-Type* tells how to parse resource. *Var-Type* is optional.

### echo statement, echo-end statement

Continuous *echo statements* print lines with variables.\
*echo-end statement* tells the end of replacement block.

    ##[ echo line]##
    ##[ echo ]##
    ##[ echo line after an empty line]##
    Real content will be written from here,
    until "echo-end" statement.

    ##[ echo-end ]##

Some rules:

1. Blank character after `echo` is required.
1. No empty lines between *echo statements*.

In this case, "line 3" will be rewritten:

    ##[ echo line 1: echo statements beginning]##
    ##[ echo line 2: OK, continuous echo statement]##

    ##[ echo line 3: this line will be rewritten]##
    ##[ echo-end ]##

### Variables

Variables in *echo statement* will be replace by their values.\
Variables are wrapped by *variable delimiters*.

    ##[ echo line one {{ var-name }} {{ obj:key0 }} ]##
    ##[ echo More lines {{ obj:key-of-obj:key-of-key-of-obj | actions:action0 | actions:action1 }} ]##
    ##[ echo Multiple variables to action {{ obj:key | actions:action2 : obj:key2 obj:key3 }} ]##
    ##[ echo-end ]##

Some rules:

1. Characters allowed in name are: `a-z` `A-Z` `0-9` `_` `.` `-`, no blanks.
1. Use `:` to get property of variable, NOT `.`, because `.` is allowed in name. No blanks around `:`.
1. Multiple variables are separated by blanks.
1. The statement after each `|` is an action calling.
The first variable is the action (function), all arguments following.
Use a single `:` to access the return value of previous action.
1. The statement before first `|` means the action of "return the first variable, and ignore others".

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
* `stat` Return http/https response headers, or file stat.
* `value` `null`,`undefined`,`true`,`false`.
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

### Actions

Type of an action: `(options: ActionOptions, ...inputs: any[]) => any`.

#### ActionOptions

* `indent` Blanks in front of line.
* `lineBreaks` Line breaks characters.

#### Built-in Actions

* `json` Output using `JSON.stringify()`.

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
* `output` Default: (undefined). Path of output file.

## TODO

* Support calling local command as action.

<!--- Reference#1 https://en.wikipedia.org/wiki/Comparison_of_programming_languages_(syntax) --->

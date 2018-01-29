# template-parser

A template parser for any type of file.

Use the template language in contents of file which can be ignored.
Update a file, replace all variables.
Template statements will be kept if update file itself, but will be deleted if output to another file.

All options can be written inside file.

## Template Language Syntax

Examples:

    ##[ .options comment-start=##[ comment-end=]## ]##
    
    ##[ var var-type var-name = resource-uri ]##
    ##[ var var-actions = resource-uri ]##
    ##[ var var-obj = resource-uri ]##
    
    ##[ echo some-text ]##
    ##[ echo-end ]##

    ##[ echo line one {{ var-name }} {{ var-obj:key0 }} ]##
    ##[ echo More lines {{ var-obj:key-of-var:key-of-key-of-var | var-actions:action0 | var-actions:action2 }} ]##
    ##[ echo Multiple variables to action {{ var-obj:key1 var-obj:key2 var-obj:key3 | var-actions:action3 }} ]##
    ##[ echo-end ]##

All template statements should be written inside one line. Don't use like:

    /* .options comment-start=/* comment-end=*/ /**/
    /* var a = xxx.txt */ 'Some real content...'

### In File Options

`.options name=value name1=value1`

1. Within one line.
1. Start with `.options`.
1. Characters allowed in name are: `a-z` `A-Z` `0-9` `_` `.` `-`, no blanks.
1. Characters between `.options` and first name is separator, can be customized.
1. All characters allowed in separator but characters in name.
1. No blanks around name and `=`.

`.options -`

1. Write this in front to override conflicted content.

### Built-in Options

* `comment-start` Default: `//`
* `comment-end` Default: ``(Blank)
* `var-start` Default: `{{`
* `var-end` Default: `}}`

### Variables

1. Characters allowed in name are same as options name.
1. Use `:` to get property of variable, NOT `.`, because `.` is allowed in name.
1. No blanks around `:`.
1. Use `|` to call actions (function), similar as piping in Linux.
1. Multiple variables allowed before *first* `|`.
1. If variable before first `|` is a function, it will be executed and pass return to action.
1. Default action is `print`, means `.toString()`.
1. Type of first action: `(options: ActionOptions, ...inputs: any[]) => string`.
1. Type of other actions: `(options: ActionOptions, input: string) => string`.

#### Action-Options

* `indent` Blanks in front of line.
* `lineBreaks` Line breaks characters.

#### Var-Type

* `list` Return array of strings.
* `json` Using `JSON.parse()`.
* `text` Return plain text.
* `pack` Return Node.js module.
* `get`  Execute function and using it's return.

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

1. If var-type declared, get resource and assigns to result, var-type will be removed from name.
1. Context of actions in exports is bind to parsed result.
1. `get` type will be executed at last, means result context is available.

Check `demo/pack.*.js` for examples.

#### Built-in Actions

* `json` Output using `JSON.stringify()`.

## Resource URI

* `http` or `https` url.
* Local file path (related to current file path).

## Local File Resource Name

File name rule: `var-type.file-name.file-type`.

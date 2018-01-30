/* .options comment-start=/* comment-end=*/ /**/
/* .options var-start=<{ var-end=}> */
/* .options output=sample-bad-cases.output.js */
/* var a-var = resource-uri */ 'Some real content...';
/* var json b-var = ../resources/callback-data.js */
/*echo var b = <{ b-var | json }>;*/
/*echo-end */

var s = `
/*echo line 1*/

/*echo line 2 (gone)*/

/*echo-end*/
`;
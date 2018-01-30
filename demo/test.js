/* .options comment-start=/* comment-end=*/ /**/
/* .options var-start=<{ var-end=}> */
/* .options output=test.output.js */
/* var a-var = resource-uri */ 'Some real content...';
/* var json b-var = callback-data.js */
/*echo var b = <{ b-var | json }>;*/
/*echo-end */

var s = `
/*echo line 1*/

/*echo line 2 (gone)*/

/*echo-end*/
`;
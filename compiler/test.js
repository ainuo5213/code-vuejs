import { compile } from "./compiler.js";
const template = "<div><p>Vuejs</p><p>Template</p></div>";
const ast = compile(template);
console.log(ast);

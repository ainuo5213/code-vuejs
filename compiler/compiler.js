import {
  transformToJsAST,
  transformTemplateToAST,
  TypeAST,
} from "./transformer.js";

export function compile(template) {
  const ast = transformTemplateToAST(template);
  transformToJsAST(ast);
  const code = generateCode(ast.jsNode);
  return code;
}

function generateCode(node) {
  const context = {
    code: "", // 存储最终生成的代码
    push(code) {
      // 通过push完成代码的拼接
      context.code += code;
    },
    currentIndent: 0, // 当前代码缩进级别
    newline() {
      context.code += "\n" + `  `.repeat(context.currentIndent); // 新换一行时拼接一个换行符，然后再接两个空格 * currentIndent
    },
    indent() {
      context.currentIndent++; // 用来缩进，换行
      context.newline();
    },
    deIndent() {
      context.currentIndent--; // 取消缩进，换行
      context.newline();
    },
  };

  // 调用genNode生成代码
  genNode(node, context);

  // 返回最终生成的代码
  return context.code;
}

function genNode(node, context) {
  switch (node.type) {
    case TypeAST.FunctionDecl:
      genFunctionDecl(node, context);
      break;
    case TypeAST.ReturnStatement:
      genReturnStatement(node, context);
      break;
    case TypeAST.CallExpression:
      genCallExpression(node, context);
      break;
    case TypeAST.StringLiteral:
      genStringLiteral(node, context);
      break;
    case TypeAST.ArrayExpression:
      genArrayExpression(node, context);
      break;
  }
}

// 生成函数声明
// function render(xxx,xxx) { xxx }
function genFunctionDecl(node, context) {
  const { push, indent, deIndent } = context;
  push(`function ${node.id.name}`);
  push(`(`);
  genNodeList(node.params, context);
  push(`)`);
  push(`{`);
  indent();
  node.body.forEach((n) => genNode(n, context));
  deIndent();
  push(`}`);
}

// 生成return
// return
function genReturnStatement(node, context) {
  const { push } = context;
  push(`return `);
  genNode(node.return, context);
}

// 生成字符串字面量
// xxx
function genStringLiteral(node, context) {
  const { push } = context;
  // 对于字符串节点，只需拼接node.value
  push(`'${node.value}'`);
}

// 生成函数调用
// h(xxx,xxx)
function genCallExpression(node, context) {
  const { push } = context;
  const { callee, arguments: args } = node;
  push(`${callee}(`);
  genNodeList(args, context);
  push(")");
}

// [xxx,xxx]
function genArrayExpression(node, context) {
  const { push } = context;
  push("[");
  console.log(node)
  genNodeList(node.elements, context);
  push("]");
}

// 生成参数子节点
// xxx,xxx
function genNodeList(nodes, context) {
  const { push } = context;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    genNode(node, context);
    // 除开最后面的参数，之前的每一个参数拼接一个,
    if (i < nodes.length - 1) {
      push(",");
    }
  }
}

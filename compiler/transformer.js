import { TokenType, tokenzie } from "./parser.js";

const ElmentType = {
  Root: "Root",
  Element: "Element",
  Text: "Text",
};

export const TypeAST = {
  StringLiteral: "StringLiteral",
  ArrayExpression: "ArrayExpression",
  CallExpression: "CallExpression",
  FunctionDecl: "FunctionDecl",
  Identifier: "Identifier",
  ReturnStatement: "ReturnStatement",
};

// 将token转换为AST
export function transformTemplateToAST(str) {
  const tokens = tokenzie(str);
  // AST语法树
  const root = {
    type: ElmentType.Root,
    children: [],
  };
  const elementStack = [root];
  while (tokens.length) {
    // 由于生成token的时候是顺序读取的，这里前一个结点可能是后一个节点的父节点，所以这里用栈来存储，遇到tagEnd就弹出，遇到tag就添加children
    const parent = elementStack[elementStack.length - 1];
    const token = tokens[0];
    switch (token.type) {
      case TokenType.tag:
        // token类型是tag，说明是一个元素节点，构建一个元素节点，并添加到上一个节点的children，推入element栈
        const elementNode = {
          type: ElmentType.Element,
          tag: token.name,
          children: [],
        };
        parent.children.push(elementNode);
        elementStack.push(elementNode);
        break;
      case TokenType.text:
        // token类型是text，说明是一个文本节点，构建一个文本节点，并推入上一个节点的children
        const textNode = {
          type: ElmentType.Text,
          content: token.content,
        };
        parent.children.push(textNode);
        break;
      case TokenType.tagEnd:
        // token类型是tagEnd，说明标签结束了，需要将element栈栈顶弹出
        elementStack.pop();
        break;
    }
    tokens.shift();
  }

  return root;
}

// 深度遍历AST，做一些节点操作
export function traverseNode(ast, context) {
  context.currentNode = ast;
  // 对AST进行深度遍历
  const currentNode = ast;
  // 退出节点阶段的回调函数数组，因为递归的存在，我们对父节点的处理必须等到子节点递归完成，所以这里设置一个父节点执行完之后的回调
  // 在子节点处理完成之后，立即执行该回调，保证该节点的子节点一定被处理完了
  const exitFns = [];
  const transforms = context.nodeTransforms;
  for (let i = 0; i < transforms.length; i++) {
    const transform = transforms[i];
    const onExit = transform(currentNode, context); // 对节点做转换
    if (onExit) {
      exitFns.push(onExit);
    }
    // 任何操作都有可能移除节点，所以这里遇到该节点被移除就直接返回
    if (!context.currentNode) {
      return;
    }
  }
  const children = currentNode.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      context.parent = context.currentNode; // 设置父节点
      context.childIndex = i; // 子节点当前的序号
      const child = children[i];
      traverseNode(child, context); // 递归
    }
  }

  // 依次执行父节点transform的回调，所以越晚执行的转换函数其回调越早执行
  let i = exitFns.length;
  while (i--) {
    exitFns[i]();
  }
}

// 将ast转换为jsAST
export function transformToJsAST(ast) {
  const context = {
    currentNode: null,
    childIndex: 0,
    parent: null,
    removeNode() {
      if (context.parent) {
        context.parent.children.splice(context.childIndex, 1);
        context.currentNode = null;
      }
    },
    // 用于替换节点的函数，接收新的节点作为参数
    replaceNode(node) {
      // 找到当前节点在父节点的children的位置，进行节点替换
      context.parent.children[context.childIndex] = node;
      // 由于当前节点已经被新节点替换，这里需要把当前节点更新为新节点
      context.currentNode = node;
    },
    nodeTransforms: [transformText, transformElement, transformRoot],
  };
  traverseNode(ast, context);
}

// 创建文本表达式
function createStringLiteral(value) {
  return {
    type: TypeAST.StringLiteral,
    value,
  };
}

// 创建命名表达式
function createIdentifier(name) {
  return {
    type: TypeAST.Identifier,
    name,
  };
}

// 创建数组表达式
function createArrayExpression(elements) {
  return {
    type: TypeAST.ArrayExpression,
    elements,
  };
}

// 创建函数调用表达式
function createCallExpression(callee, args) {
  return {
    type: TypeAST.CallExpression,
    arguments: args,
    callee,
  };
}

// 转换文本节点
function transformText(node, context) {
  if (node.type !== ElmentType.Text) {
    return;
  }

  node.jsNode = createStringLiteral(node.content);
}

// 转换标签节点
function transformElement(node) {
  return () => {
    // 在回调函数处理node，这样可以保证其内部的子节点全部都被处理了，即都有jsNode这个属性
    if (node.type !== ElmentType.Element) {
      return;
    }
    // 创建h函数调用，h函数第一个是标签名(h时vue的生成vnode的函数)
    const callExpression = createCallExpression("h", [
      createStringLiteral(node.tag),
    ]);

    // 处理h函数的参数
    node.children.length === 1
      ? callExpression.arguments.push(node.children[0].jsNode)
      : callExpression.arguments.push(
          createArrayExpression(node.children.map((r) => r.jsNode))
        );
    // 挂载到当前节点的jsNode上
    node.jsNode = callExpression;
  };
}

function transformRoot(node) {
  return () => {
    if (node.type !== ElmentType.Root) {
      return;
    }
    // node是根节点，根节点的第一个子节点就是模板的根节点，暂时不考虑模板存在多个根节点的情况
    const vnodeJSAST = node.children[0].jsNode;
    // 创建render函数的声明语句节点，将vnodeJSAST作为render函数体的返回语句
    node.jsNode = {
      type: TypeAST.FunctionDecl,
      id: createIdentifier("render"),
      params: [],
      body: [
        {
          type: TypeAST.ReturnStatement,
          return: vnodeJSAST,
        },
      ],
    };
  };
}

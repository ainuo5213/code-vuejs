// 状态表
const TextModes = {
  // 在DATA模式下，浏览器解析器遇到字符<时，会切换到标签开始状态，该模式下，解析器能够拆解标签元素。
  // 当解析器遇到&，会切换到字符引用状态，该模式下能够处理HTML字符实体
  DATA: "DATA",
  // RCDATA模式下，浏览器解析器遇到<不会再切换回标签开始状态
  // 在该模式下遇到字符/时，则进入结束标签状态，否则会将字符<当作普通字符处理
  // 由此可知，该状态下解析器不能识别标签元素，这也说明了浏览器解析textarea和title时会忽略内部标签的解析
  // 该模式下，浏览器仍然能够解析HTML字符实体
  RCDATA: "RCDATA",
  // 该模式下的工作方式和RCDATA类似，不同点在于，再RAWTEXT模式下，解析器不再支持解析HTML实体字符
  RAWTEXT: "RAWTEXT",
  // 该模式再RAWTEXT基础上更进一步，会将所有字符都当作普通字符处理，直到遇到CDATA的结束标志
  CDATA: "CDATA",
};
// 这里简单设计一个字符引用表(取自vue3源码)
import namedChararacterReferences from "./namedChar.js";

const CCR_REPLACEMENTS = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

function parse(str) {
  const context = {
    source: str, // source即模板内容，用于解析期间消费
    mode: TextModes.DATA, // 解析器所处的模式，初始模式是DATA模式
    advanceBy(num) {
      // 消费指定长度的字符串
      context.source = context.source.slice(num);
    },
    advanceSpaces() {
      // 匹配空白字符串，然后消费
      const match = /^[\t\r\n\f ]+/.exec(context.source);
      if (match) {
        context.advanceBy(match[0].length);
      }
    },
  };
  const nodes = parseChildren(context, []);
  return {
    type: "Root",
    children: nodes,
  };
}

function parseChildren(context, ancestors) {
  let nodes = [];
  const { mode, advanceSpaces } = context;
  // 每次运行前清除空白字符
  advanceSpaces();
  // 开启while循环，如果没有结束，一直循环下去
  while (!isEnd(context, ancestors)) {
    let node;
    // 只有DATA和RCDATA支持对插值节点的解析
    if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
      // 只有DATA模式才支持标签节点的解析
      if (mode === TextModes.DATA && context.source[0] === "<") {
        if (context.source[1] === "!") {
          if (context.source.startsWith("<!--")) {
            // 解析注释
            node = parseComment(context);
          } else if (context.source.startsWith("<![CDATA[")) {
            // 解析CDATA
            node = parseCDATA(context);
          }
        } else if (context.source[1] === "/") {
          // 由于解析子节点会开启新的状态机，在新的状态机中会将结束标签处理掉
          // 如果此时遇到了结束标签标志，则认为该结束标签没有对应的开始标签，抛出错误
          console.error("出错了");
          continue;
        } else if (/[a-z]/i.test(context.source[1])) {
          // 解析标签
          node = parseElement(context, ancestors);
        }
      } else if (context.source.startsWith("{{")) {
        // 解析插值
        node = parseInterpolation(context);
      }
    }

    // 上一轮下来都没有节点被解析，解析为文本
    if (!node) {
      node = parseText(context);
    }

    nodes.push(node);
  }
  return nodes;
}

function parseCDATA(context) {
  context.advanceBy("<![CDATA[".length); // 消费CDATA开始字符
  let endIndex = context.source.indexOf("]]>"); // 寻找CDATA结束标志
  if (endIndex === -1) {
    endIndex = context.source.length;
  }

  let content = context.source.slice(0, endIndex); // CDATA之间的所有内容将会识别为普通文本
  return {
    type: "CDATA",
    content,
  };
}

function parseText(context) {
  let endIndex = context.source.length; // endIndex默认为字符串长度
  const ltIndex = context.source.indexOf("<"); // 寻找<位置
  const delimiterIndex = context.source.indexOf("{{"); // 寻找定界符{{的位置
  // ltIndex存在，且小于字符串长度，则endIndex为ltIndex
  if (ltIndex > -1 && ltIndex <= endIndex) {
    endIndex = ltIndex;
  }

  // delimiterIndex存在且小于endIndex，则endIndex为delimiterIndex
  if (delimiterIndex > -1 && delimiterIndex < endIndex) {
    endIndex = delimiterIndex;
  }

  // 取得content
  const content = context.source.slice(0, endIndex);

  // 消费content长度的字符串
  context.advanceBy(content.length);

  return {
    type: "Text",
    content: decodeHtml(content),
  };
}

// 第一个参数是要解码的字符串
// 第二个参数代表文本内容是否作为属性值
function decodeHtml(rawText, asAttr = false) {
  let offset = 0;
  const end = rawText.length;
  let decodedText = ""; // 最终解码的字符串
  let maxCRNameLength = 0; // 引用表中实体名称的最大长度

  // 消费指定长度的字符串
  function advance(length) {
    offset += length;
    rawText = rawText.slice(length);
  }

  while (offset < end) {
    // 匹配字符引用的开始部分；
    // 有三种情况：head[0]='&'、head[0]='&#'、head[0]='&#x'
    const head = /&(?:#x?)?/i.exec(rawText);
    // 如果没有匹配
    if (!head) {
      // 计算剩余内容长度
      const remaining = end - offset;
      // 将剩余内容追加到decodedText
      decodedText += rawText.slice(0, remaining);
      // 消费剩余内容长度的字符
      advance(remaining);
      break;
    }

    // 如果找到了字符引用，截取&之前的字符，追加到decoidedText
    decodedText += rawText.slice(0, head.index);
    // 消费字符&之前的内容
    advance(head.index);

    // 如果匹配到的head第一个字符是&，说明是命名字符引用，否则为数字字符引用
    if (head[0] === "&") {
      let name = "";
      let value;
      // 如果match到了&，且下一个字符是ASCII字母或数字，需要进一步查找字符引用表
      if (/[0-9a-z]/i.test(rawText[1])) {
        // 找出字符引用表中名称最长的字符长度
        if (!maxCRNameLength) {
          maxCRNameLength = Object.keys(namedChararacterReferences).reduce(
            (max, name) => Math.max(max, name.length),
            0
          );
        }

        // 从当前文本进行截取指定长度的字符串，尝试去字符引用表中查找对应的项
        for (let length = maxCRNameLength; !value && length > 0; --length) {
          name = rawText.substr(1, length);
          value = namedChararacterReferences[name];
        }

        // 如果找到了，看他有没有以;结尾
        if (value) {
          const semi = name.endsWith(";");
          // 如果没有以;结尾且解码的文本作为属性值，并且最后一个字符是=、ASCII字母或数字
          // 由于历史原因，将字符&和实体名称name一起作为普通文本
          if (
            asAttr &&
            !semi &&
            /[=a-z0-9]/i.test(rawText[name.length + 1] || "")
          ) {
            decodedText += "&" + name;
            advance(1 + name.length);
          } else {
            // 其他情况，正常拼接其值到decodedText，并消费name长度的字符串
            decodedText += value;
            advance(1 + name.length);
          }
        } else {
          // 如果没找到，则直接拼接&和name作为普通文本到decodedText，并消费
          decodedText += "&" + name;
          advance(1 + name.length);
        }
      } else {
        // 如果match到了&，但是下一个字符不是ASCII字母或数字，则将字符&作为普通文本
        decodedText += "&";
        advance(1);
      }
    } else {
      // 如果匹配到的head以&#x或&#开头，说明是数字字符引用，而数字字符引用分为10进制和16进制
      // 根据进制不同，匹配的正则也不同
      const hex = head[0] === "&#x";
      const pattern = hex ? /^&#x([0-9a-f]+);?/i : /^&#([0-9]+);?/i;
      const body = pattern.exec(rawText);

      // 如果能匹配上对应的进制
      if (body) {
        // 通过parseInt拿到其十进制的码点，通过码点拿到对应的字符
        const codePoint = parseInt(bdoy[1], hex ? 16 : 10);
        // 检查得到的码点合法性
        if (codePoint === 0) {
          // 如果码点值为0x00，替换为0xfffd
          codePoint = 0xfffd;
        } else if (codePoint > 0x10ffff) {
          // 如果码点值超过了Unicode最大值，替换为0xfffd
          codePoint = 0xfffd;
        } else if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
          // 如果码点值处于代理对范围内，替换为0xfffd
          codePoint = 0xfffd;
        } else if (
          (codePoint >= 0xfdd0 && codePoint <= 0xfdef) ||
          (codePoint & 0xfffe) === 0xfffe
        ) {
          // 如果码点值处于noncharacter范围内，啥都不处理
        } else if (
          (codePoint >= 0x01 && codePoint <= 0x08) ||
          codePoint === 0x0b ||
          (codePoint >= 0x0d && codePoint <= 0x1f) ||
          (codePoint >= 0x7f && codePoint <= 0x9f)
        ) {
          // 如果码点值在控制字符集范围（[0x01, 0x1f]+[0x7f, 0x9f]）内
          // 去掉ASCII空白字符：0x09（TAB），0x0A（LF）、0x0C（FF）、0x0D（CR）
          // 去CCR_REPLACEMENTS寻找替换的码点，如果找不到则使用原码点
          codePoint = CCR_REPLACEMENTS[codePoint] || codePoint;
        }
        const char = String.fromCodePoint(codePoint);
        decodedText += char;
        advance(body[0].length); // 消费匹配到的body长度
      } else {
        // 如果没有匹配到数字字符引用，则不进行解码操作，只是追加head[0]到decodedText，并消费head[0]
        decodedText += head[0];
        advance(head[0].length);
      }
    }
  }
  return decodedText;
}

function parseInterpolation(context) {
  const { advanceBy } = context;
  advanceBy("{{".length); // 消费插值表达式开头的{{
  let closeIndex = context.source.indexOf("}}");
  if (closeIndex < 0) {
    console.error("插值缺少结束界定符");
  }
  // 从开始到插值结束界定符之间的内容作为content
  const content = context.source.slice(0, closeIndex);
  advanceBy(content.length); // 消费内容长度
  advanceBy("}}".length); // 消费插值结束界定符
  return {
    type: "Interpolation",
    // 插值节点的类型是一个表达式节点
    content: {
      type: "Expression",
      content: decodeHtml(content), // 对插值表达式的内容做一次解码，其结果作为真正的内容返回
    },
  };
}

function parseComment(context) {
  const { advanceBy } = context;
  advanceBy("<!--".length);
  let closeIndex = context.source.indexOf("-->");
  const content = context.source.slice(0, closeIndex);
  advanceBy(content.length);
  advanceBy("-->".length);
  return {
    type: "Comment",
    content,
  };
}

function parseElement(context, ancestors) {
  const element = parseTag(context); // 解析开始标签
  // 标签是一个自闭合标签，直接返回
  if (element.isSelfClosing) {
    return element;
  }

  // 如果tag是textarea和title的话，切换到RCDATA模式
  if (element.tag === "textarea" || element.tag === "title") {
    context.mode = TextModes.RCDATA;
  } else if (/style|xmp|iframe|noembed|noframes|noscript/.test(element.tag)) {
    // 切换到RAWTEXT模式
    context.mode = TextModes.RAWTEXT;
  } else {
    // 其他切换到DATA模式
    context.mode === TextModes.DATA;
  }

  ancestors.push(element);
  element.children = parseChildren(context, ancestors); // 解析子节点
  ancestors.pop(); // 遍历完了子节点，将当前节点从祖先节点弹出

  // 解析完子节点之后，如果当前字符串以element.tag作为结束标签，则认为已结束。否则认为没有与之对应的闭合标签
  if (context.source.startsWith(`</${element.tag}>`)) {
    parseTag(context, "end");
  } else {
    console.error(`${element.tag}标签缺少闭合标签`);
  }
  return element;
}

function parseTag(context, type = "start") {
  const { advanceBy, advanceSpaces } = context;
  const match =
    type === "start"
      ? /^<([a-z][^\t\r\n\f />]*)/i.exec(context.source) // 匹配开始标签
      : /^<\/([a-z][^\t\r\n\f />]*)/i.exec(context.source); // 匹配结束标签
  // 消费匹配组的第一个（exec能匹配的话，第一个是能匹配的字符串，之后是捕获组）的长度
  const tag = match[1];
  advanceBy(match[0].length);
  advanceSpaces(); // 消费空白字符串
  const props = parseAttribute(context);
  const isSelfClosing = context.source.startsWith("/"); // 是否是自闭合标签，如果是的话则消费两个字符串(/>)，否则只消费一个(>)
  advanceBy(isSelfClosing ? 2 : 1);
  return {
    type: "Element",
    tag,
    props: props,
    children: [],
    isSelfClosing,
  };
}

function parseAttribute(context) {
  const { advanceBy, advanceSpaces } = context;
  const props = [];
  // 开启while循环，只要没遇到结束标志，就一直运行
  while (!context.source.startsWith(">") && !context.source.startsWith("/>")) {
    // 解析指令和属性
    // 读取属性名
    const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source);
    const name = match[0];
    advanceBy(name.length);
    advanceSpaces();
    advanceBy(1); // 消费等号
    advanceSpaces(); // 消费等号和属性值之间的空白字符串
    let value = "";
    const quote = context.source[0];
    const isQuote = quote === '"' || quote === "'";
    if (isQuote) {
      advanceBy(1); // 消费开始引号
      const endQuoteIndex = context.source.indexOf(quote); // 在字符串里去找结束引号
      if (endQuoteIndex > -1) {
        // 找到了结束引号，得到中间的属性值
        value = context.source.slice(0, endQuoteIndex);
        advanceBy(value.length); // 消费属性值
        advanceBy(1); // 消费结束引号
      } else {
        console.error("缺少引号");
      }
    } else {
      // 如果属性值没有被引号引用，那么到结束前的下一个空白字符之前的内容作为其属性值
      const match = /^[^\t\r\n\f >]+/.exec(context.source);
      value = match[0];
      advanceBy(value.length);
    }
    advanceSpaces(); // 消费完属性值之后，消费属性值后的空白组付出按

    // 添加props
    props.push({
      type: "Attribute",
      name,
      value,
    });
  }
  return props;
}

function isEnd(context, ancestors) {
  // 模板解析完毕=>结束
  if (!context.source) {
    return true;
  }

  // 将其所有祖先与该字符出做对比，只要当前字符串以其父节点结束标签开头，那么就算结束
  for (let i = ancestors.length - 1; i >= 0; --i) {
    const ancestor = ancestors[i];
    if (context.source.startsWith(`</${ancestor.tag}>`)) {
      return true;
    }
  }

  return false;
}

const ast = parse(
  '<div :id="dynamicId" @click="handler" v-on:mousedown="onMouseDown" v-show="display"> {{baz}} </div>'
);
console.log(ast);

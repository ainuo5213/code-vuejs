const state = {
  initial: 1, // 初始状态
  tagOpen: 2, // 标签开始状态
  tagName: 3, // 标签名称状态
  text: 4, // 文本状态
  tagEnd: 5, // 结束标签状态
  tagEndName: 6, // 结束标签名称状态
};

function isChar(char) {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

export const TokenType = {
  tag: "tag",
  text: "text",
  tagEnd: "tagEnd",
};

// 通过有限状态自动机，对字符串进行词法分析得到token
export function tokenzie(str) {
  let currentState = state.initial;
  const chars = [];
  const tokens = [];
  while (str) {
    const char = str[0];
    // example: <p>vue</p>：
    /**
     * 读取<: tagOpen
     * 读取p: tagName
     * 读取>: initial   tokens = [{ type: 'tag', name: 'p' }]
     *
     * 读取v: text
     * 读取u: text
     * 读取e: text
     * 读取<: tagOpen   tokens = [{ type: 'tag', name: 'p' }, { type: 'text', content: 'vue' }]
     *
     * 读取/: tagEnd
     * 读取p: tagEndName
     * 读取>: initial   tokens = [{ type: 'tag', name: 'p' }, { type: 'text', content: 'vue' }, { type: 'tagEnd', name: 'p' }]
     */
    switch (currentState) {
      case state.initial:
        if (char === "<") {
          currentState = state.tagOpen; // 遇到 < ，进入标签开启状态
          str = str.slice(1); // 消费该字符串
        } else if (isChar(char)) {
          currentState = state.text; // 遇到字母，推入chars，进入文本状态
          chars.push(char);
          str = str.slice(1);
        }
        break;
      case state.tagOpen:
        // 当前是标签打开阶段（读取到了<）
        if (isChar(char)) {
          currentState = state.tagName; // 读取到了字母，此时进入标签名字状态
          chars.push(char);
          str = str.slice(1);
        } else if (char === "/") {
          currentState = state.tagEnd; // 读取到了/，进入标签结束状态
          str = str.slice(1);
        }
        break;
      case state.tagName:
        if (isChar(char)) {
          // 当前是标签名字状态，读取到了字母，说明还是标签名字状态，不用转换状态
          chars.push(char);
          str = str.slice(1);
        } else if (char === ">") {
          // 读取到了>，标志着读取完了标签，需要重置状态到初始状态
          currentState = state.initial;
          // 推入一个token
          tokens.push({
            type: TokenType.tag,
            name: chars.join(""),
          });
          chars.length = 0; // 重置chars的length
          str = str.slice(1);
        }
        break;
      case state.text:
        // 当前是文本状态，如果还读取到了文本，则推入chars，不用转换状态
        if (isChar(char)) {
          chars.push(char);
          str = str.slice(1);
        } else if (char == "<") {
          // 如果读取到了<，则进入标签展开阶段
          currentState = state.tagOpen;
          // 推入一个token为文本
          tokens.push({
            type: TokenType.text,
            content: chars.join(""),
          });
          chars.length = 0;
          str = str.slice(1);
        }
        break;
      case state.tagEnd:
        // 当前是标签结束阶段（之前读取到了/），读取到了文本，进入结束标签名状态
        if (isChar(char)) {
          currentState = state.tagEndName;
          chars.push(char);
          str = str.slice(1);
        }
        break;
      case state.tagEndName:
        // 结束标签名状态读取到了文本，继续读取，不用转换状态
        if (isChar(char)) {
          chars.push(char);
          str = str.slice(1);
        } else if (char === ">") {
          // 如果读取到了>，重置为初始状态
          currentState = state.initial;
          tokens.push({
            type: TokenType.tagEnd,
            name: chars.join(""),
          });
          chars.length = 0;
          str = str.slice(1);
        }
        break;
    }
  }

  return tokens;
}

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/safe-identifier@0.4.2/node_modules/safe-identifier/reserved.js
var require_reserved = __commonJS({
  "node_modules/.pnpm/safe-identifier@0.4.2/node_modules/safe-identifier/reserved.js"(exports, module) {
    var ES3 = {
      break: true,
      continue: true,
      delete: true,
      else: true,
      for: true,
      function: true,
      if: true,
      in: true,
      new: true,
      return: true,
      this: true,
      typeof: true,
      var: true,
      void: true,
      while: true,
      with: true,
      case: true,
      catch: true,
      default: true,
      do: true,
      finally: true,
      instanceof: true,
      switch: true,
      throw: true,
      try: true
    };
    var ESnext = {
      await: true,
      debugger: true,
      class: true,
      enum: true,
      extends: true,
      super: true,
      const: true,
      export: true,
      import: true,
      null: true,
      true: true,
      false: true,
      implements: true,
      let: true,
      private: true,
      public: true,
      yield: true,
      interface: true,
      package: true,
      protected: true,
      static: true
    };
    module.exports = { ES3, ESnext };
  }
});

// node_modules/.pnpm/safe-identifier@0.4.2/node_modules/safe-identifier/index.mjs
var import_reserved = __toESM(require_reserved(), 1);
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; ++i) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
function identifier(key, unique) {
  if (unique)
    key += " " + hashCode(key).toString(36);
  const id = key.trim().replace(/\W+/g, "_");
  return import_reserved.default.ES3[id] || import_reserved.default.ESnext[id] || /^\d/.test(id) ? "_" + id : id;
}

// src/core.ts
function fail(msg, n) {
  throw new Error(`${msg}${n ? ` @ (${n.startPosition.row + 1}, ${n.startPosition.column + 1})` : ""}`);
}
function assert(v, msg, n) {
  if (!v) {
    fail(`assertion failed: ${msg}`, n);
  }
}
var DISCOVERED = "<discovered>";
function scan(sfc) {
  const state = {
    extraScript: "",
    scan: {},
    importNodes: [],
    hooks: {},
    props: {},
    propDefaultNodes: {},
    refs: {},
    computeds: {},
    using: {},
    nonRefs: /* @__PURE__ */ new Set(),
    methods: {},
    watchers: {}
  };
  const { scan: scan2 } = state;
  scan2.lines = sfc.split("\n");
  for (let i = 0; i < scan2.lines.length; i++) {
    const line = scan2.lines[i];
    if (line.match(/<script/)) {
      scan2.scriptStartIdx = i;
      if (line.match(/setup/)) {
        scan2.scriptStartIdx = void 0;
        break;
      }
      if (line.match(/lang="ts"/) || line.match(/lang='ts'/)) {
        scan2.scriptTs = true;
      }
    } else if (line.match(/<\/script/)) {
      scan2.scriptEndIdx = i;
    } else if (line.match(/<template/)) {
      scan2.templateStartIdx = i;
      if (line.match(/lang="pug"/) || line.match(/lang='pug'/)) {
        scan2.templatePug = true;
      }
    } else if (line.match(/<\/template/)) {
      scan2.templateEndIdx = i;
    }
  }
  if (scan2.scriptStartIdx != null && scan2.scriptEndIdx) {
    scan2.script = scan2.lines.slice(scan2.scriptStartIdx + 1, scan2.scriptEndIdx).join("\n");
  }
  return state;
}
function assertNoErrorSyntaxNode(n) {
  if (!n) {
    return;
  }
  if (n.type === "ERROR") {
    fail("syntax error", n);
  }
  for (const c of n.children || []) {
    assertNoErrorSyntaxNode(c);
  }
}
function transform(state, parser) {
  const {
    lines,
    script,
    scriptStartIdx,
    scriptEndIdx,
    templateStartIdx,
    templateEndIdx,
    templatePug
  } = state.scan;
  assert(script, "no options api script scanned");
  const tree = state.tree = parser.parse(script);
  assertNoErrorSyntaxNode(tree.rootNode);
  for (const n of tree.rootNode.children) {
    if (n.type === "import_statement") {
      state.importNodes.push(n);
    } else if (n.type === "export_statement") {
      if (maybeHandleDefaultExport(state, n)) {
        continue;
      }
    } else {
      state.extraScript += `${n.text}
`;
    }
  }
  let importSection = "";
  const vueImportsUsed = [];
  if (state.hooks.onBeforeMount) {
    vueImportsUsed.push("onBeforeMount");
  }
  if (state.hooks.onMounted) {
    vueImportsUsed.push("onMounted");
  }
  if (state.using.$attrs) {
    vueImportsUsed.push("useAttrs");
  }
  if (Object.keys(state.computeds).length) {
    vueImportsUsed.push("computed");
  }
  if (state.using.nextTick) {
    vueImportsUsed.push("nextTick");
  }
  if (Object.keys(state.refs).length) {
    vueImportsUsed.push("ref");
  }
  if (state.using.$slots) {
    vueImportsUsed.push("useSlots");
  }
  if (vueImportsUsed.length) {
    for (const importNode of state.importNodes) {
      if (importNode.text.match(/'vue'/) || importNode.text.match(/"vue"/)) {
        fail("editing existing vue import not supported yet");
      }
    }
    importSection += `import { ${vueImportsUsed.join(", ")} } from "vue"
`;
  }
  const vueRouterImportsUsed = [];
  if (state.using.$router) {
    vueRouterImportsUsed.push("useRouter");
  }
  if (state.using.$route) {
    vueRouterImportsUsed.push("useRoute");
  }
  if (vueRouterImportsUsed.length) {
    for (const importNode of state.importNodes) {
      if (importNode.text.match(/'vue-router'/) || importNode.text.match(/"vue-router"/)) {
        fail("editing existing vue-router import not supported yet");
      }
    }
    importSection += `import { ${vueRouterImportsUsed.join(", ")} } from "vue-router"
`;
  }
  for (const importNode of state.importNodes) {
    importSection += `${importNode.text}
`;
  }
  let propsSection = "";
  if (Object.keys(state.props).length) {
    if (state.using.props) {
      propsSection += "const props = ";
    }
    if (Object.keys(state.propDefaultNodes).length) {
      propsSection += `withDefaults(`;
    }
    propsSection += `defineProps<{
`;
    for (const k in state.props) {
      propsSection += `  ${k}?: ${state.props[k]}
`;
    }
    propsSection += `}>()`;
    if (Object.keys(state.propDefaultNodes).length) {
      propsSection += `, {
`;
      for (const k in state.propDefaultNodes) {
        propsSection += `  ${k}: ${state.propDefaultNodes[k]},
`;
      }
      propsSection += `})`;
    }
    propsSection += "\n";
  }
  let injectionsSection = "";
  if (state.using.$attrs) {
    injectionsSection += "const $attrs = useAttrs()\n";
  }
  if (state.using.$route) {
    injectionsSection += "const $route = useRoute()\n";
  }
  if (state.using.$router) {
    injectionsSection += "const $router = useRouter()\n";
  }
  if (state.using.$slots) {
    injectionsSection += "const $slots = useSlots()\n";
  }
  if (state.nonRefs.size) {
    injectionsSection += `const $this = {}
`;
  }
  let emitsSection = "";
  assert(!((state.emitsNode ? 1 : 0) ^ (state.using.$emit ? 1 : 0)), "specifies emits but doesn't or vice versa");
  if (state.using.$emit) {
    emitsSection += "const $emit = ";
  }
  if (state.emitsNode) {
    emitsSection += `defineEmits(${state.emitsNode.text})
`;
  }
  let refsSection = "";
  let template;
  if (state.using.$el) {
    refsSection += "const $el = ref<HTMLElement | undefined>()\n";
    if (templateStartIdx != null) {
      template = lines.slice(templateStartIdx + 1, templateEndIdx).join("\n");
      if (templatePug) {
        const templateLines = template.split("\n");
        let zeroIndentIdx;
        for (let i = 0; i < templateLines.length; i++) {
          const line = templateLines[i];
          if (line.startsWith("//")) {
            continue;
          }
          const lineSpaces = linePrefixSpaces(line);
          if (!lineSpaces) {
            assert(zeroIndentIdx == null, "multiple zero-space indents found in pug template");
            zeroIndentIdx = i;
          }
        }
        assert(zeroIndentIdx != null, "no zero-space indent found in pug template");
        const zeroIndentLine = templateLines[zeroIndentIdx];
        if (zeroIndentLine.startsWith(".") || zeroIndentLine.startsWith("#") || zeroIndentLine.match(/^[a-z]+([.#(\s]|$)/)) {
          let newLine;
          let idx = zeroIndentLine.indexOf("(");
          const zeroIndentChars = zeroIndentLine.split("");
          if (idx >= 0) {
            const suffix = zeroIndentLine[idx + 1] && zeroIndentLine[idx + 1] !== ")" ? " " : "";
            zeroIndentChars.splice(idx + 1, 0, `ref="$el"${suffix}`);
            newLine = zeroIndentChars.join("");
          } else {
            idx = zeroIndentLine.indexOf(" ");
            if (idx >= 0) {
              zeroIndentChars.splice(idx + 1, 0, `(ref="$el")`);
              newLine = zeroIndentChars.join("");
            } else {
              idx = zeroIndentLine.length;
              newLine = zeroIndentLine + `(ref="$el")`;
            }
          }
          templateLines[zeroIndentIdx] = newLine;
          template = templateLines.join("\n");
        } else {
          fail("cannot edit pug template to suport $el");
        }
      } else {
        fail("cannot edit non-pug template to suport $el");
      }
    }
  }
  for (const k in state.refs) {
    refsSection += `const ${k} = ref(${state.refs[k]})
`;
  }
  let hooksSection = "";
  if (state.hooks.onBeforeMount) {
    hooksSection += `onBeforeMount(${state.hooks.onBeforeMount})
`;
  }
  if (state.hooks.onMounted) {
    hooksSection += `onMounted(${state.hooks.onMounted})
`;
  }
  let computedsSection = "";
  for (const k in state.computeds) {
    computedsSection += `const ${k} = computed(${state.computeds[k]})
`;
  }
  let watchersSection = "";
  for (const k in state.watchers) {
    const watcher = state.watchers[k];
    watchersSection += `const ${k} = watch(${watcher.handler}`;
    if (watcher.deep || watcher.immediate) {
      watchersSection += `, {
`;
      if (watcher.deep) {
        watchersSection += `  deep: ${watcher.deep},
`;
      }
      if (watcher.immediate) {
        watchersSection += `  immediate: ${watcher.immediate},
`;
      }
      watchersSection += `}`;
    }
    watchersSection += `)
`;
  }
  let methodsSection = "";
  for (const k in state.methods) {
    methodsSection += `${state.methods[k]}
`;
  }
  const scriptSections = [
    importSection,
    propsSection,
    injectionsSection,
    emitsSection,
    refsSection,
    hooksSection,
    computedsSection,
    watchersSection,
    methodsSection
  ].filter(Boolean);
  const newScript = scriptSections.join("\n") + state.extraScript.trimEnd();
  let transformedSections = [];
  if (template) {
    if (templateStartIdx < scriptStartIdx) {
      transformedSections.push(...lines.slice(0, templateStartIdx + 1));
      transformedSections.push(template);
      transformedSections.push(...lines.slice(templateEndIdx, scriptStartIdx));
      transformedSections.push(`<script setup lang="ts">
${newScript}
<\/script>`);
      transformedSections.push(...lines.slice(scriptEndIdx + 1, lines.length));
    } else {
      transformedSections.push(...lines.slice(0, scriptStartIdx));
      transformedSections.push(`<script setup lang="ts">
${newScript}
<\/script>`);
      transformedSections.push(...lines.slice(scriptEndIdx + 1, templateStartIdx + 1));
      transformedSections.push(template);
      transformedSections.push(...lines.slice(templateEndIdx, lines.length));
    }
  } else {
    transformedSections.push(...lines.slice(0, scriptStartIdx));
    transformedSections.push(`<script setup lang="ts">
${newScript}
<\/script>`);
    transformedSections.push(...lines.slice(scriptEndIdx + 1, lines.length));
  }
  state.transformed = transformedSections.join("\n");
  return state;
}
function linePrefixSpaces(line) {
  const md = line.match(/^(\s*)/);
  return (md == null ? void 0 : md[1].length) || 0;
}
function reindent(s, minIndentSpaces) {
  const lines = s.split("\n");
  let minLineSpaces = Infinity;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const lineSpaces = linePrefixSpaces(line);
    if (lineSpaces < minLineSpaces) {
      minLineSpaces = lineSpaces;
    }
  }
  const spaceIndentChange = minIndentSpaces - minLineSpaces;
  const ret = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (spaceIndentChange > 0) {
      ret.push(" ".repeat(spaceIndentChange) + line);
    } else {
      ret.push(line.slice(-spaceIndentChange));
    }
  }
  return ret.join("\n");
}
function propTypeIdentifierToType(s) {
  switch (s) {
    case "Array":
      return "any[]";
    case "Boolean":
      return "boolean";
    case "Number":
      return "number";
    case "String":
      return "string";
    default:
      throw new Error(`unhandled prop type identifier: ${s}`);
  }
}
function handleArray(n, onElement) {
  for (const c of n.children) {
    switch (c.type) {
      case "[":
      case ",":
      case "]":
        break;
      default:
        onElement(c);
    }
  }
}
function handlePropType(n) {
  let ret;
  if ((n == null ? void 0 : n.type) === "array") {
    const types = [];
    handleArray(n, (c) => {
      types.push(propTypeIdentifierToType(c.text));
    });
    ret = types.join(" | ");
  } else if ((n == null ? void 0 : n.type) === "identifier") {
    ret = propTypeIdentifierToType(n.text);
  } else {
    fail(`prop value type not array or identifier: ${n == null ? void 0 : n.text}`, n);
  }
  return ret;
}
function handleProps(state, o, transformPass = true) {
  handleObject(o, {
    onKeyValue(propName, n) {
      switch (n.type) {
        case "identifier":
          state.props[propName] = handlePropType(n);
          break;
        case "object":
          if (n.text === "{}") {
            state.props[propName] = "any";
            break;
          }
          handleObject(n, {
            onKeyValue(key, n2) {
              switch (key) {
                case "default":
                  state.propDefaultNodes[propName] = n2.text;
                  break;
                case "type":
                  state.props[propName] = handlePropType(n2);
                  break;
                default:
                  fail(`prop attribute not handled: ${key}`, n2);
              }
            },
            onMethod(meth, async, args, block) {
              assert(meth === "default", `prop attribute method not named default: ${meth}`, n);
              assert(args.text === "()", `prop attribute method default has unexpected args: ${args.text}`, args);
              state.propDefaultNodes[propName] = `() => ${reindent(block.text, 2)}`;
            }
          });
          break;
        default:
          fail(`prop value not identifier or object: ${n.children[2].type}`, n.children[2]);
      }
    },
    onMethod(meth, async, args, block) {
      fail(`unexpected prop method: ${meth}`, o);
    }
  });
}
function bfs(n, onNode) {
  const q = [n];
  while (q.length) {
    const c = q.shift();
    onNode(c);
    q.push(...c.children);
  }
}
function transformNode(state, n) {
  const replacements = [];
  const handleThisKey = (name, startIndex, endIndex, textNode) => {
    const pushReplacement = (value) => {
      replacements.push({
        startIndex: startIndex - n.startIndex,
        endIndex: endIndex - n.startIndex,
        value
      });
    };
    if (name === "$nextTick") {
      state.using.nextTick = true;
      pushReplacement("nextTick");
      return;
    }
    if (name === "$el") {
      state.using.$el = true;
      pushReplacement("$el.value");
      return;
    }
    if (["$emit", "$slots", "$attrs", "$router", "$route"].includes(name)) {
      state.using[name] = true;
      pushReplacement(name);
      return;
    }
    assert(!name.startsWith("$"), `config needed to determine how to replace global property: ${name}`, textNode);
    assert(name === identifier(name), `unsafe identifier not supported: ${name}`, textNode);
    if (state.props[name]) {
      state.using.props = true;
      pushReplacement(`props.${name}`);
      return;
    }
    if (state.computeds[name] || state.refs[name]) {
      pushReplacement(`${name}.value`);
      return;
    }
    if (state.methods[name]) {
      pushReplacement(name);
      return;
    }
    state.nonRefs.add(name);
    pushReplacement(`this.${name}`);
    return `$this.${name}`;
  };
  bfs(n, (c) => {
    if (c.type === "this") {
      const c1 = c.nextSibling;
      const c2 = c1 == null ? void 0 : c1.nextSibling;
      const c3 = c2 == null ? void 0 : c2.nextSibling;
      if ((c1 == null ? void 0 : c1.type) === ".") {
        assert(c2, "expected sibling after this.", c1);
        assert(c2.type === "property_identifier", "expected property_identifier after `this.`");
        handleThisKey(c2.text, c.startIndex, c2.endIndex, c2);
      } else if ((c1 == null ? void 0 : c1.type) === "[" && c2.type === "string" && (c3 == null ? void 0 : c3.type) === "]") {
        handleThisKey(c2.text.slice(1, c2.text.length - 1), c.startIndex, c3.endIndex, c2);
      } else {
        fail("unsupported this attribute while transforming", c.parent);
      }
    }
  });
  const sortedReplacements = replacements.sort((a, b) => a.startIndex - b.startIndex);
  let ret = "";
  let idx = 0;
  for (let i = 0; i < sortedReplacements.length; i++) {
    const r = sortedReplacements[i];
    ret += n.text.substring(idx, r.startIndex) + r.value;
    idx = r.endIndex;
  }
  ret += n.text.substring(idx);
  return ret;
}
function handleComputeds(state, n, transformPass = true) {
  handleObject(n, {
    onKeyValue(key, n2) {
      fail(`computed non-method key unexpected: ${key}`, n2);
    },
    onMethod(meth, async, args, block) {
      assert(!async, "computed async method unexpected", block);
      if (transformPass) {
        const computedString = transformNode(state, block);
        assert(args.text === "()", `computed method has unexpected args: ${args.text}`, args);
        state.computeds[meth] = `() => ${reindent(computedString, 0)}`;
      } else {
        state.computeds[meth] = DISCOVERED;
      }
    }
  });
}
function handleMethods(state, n, transformPass = true) {
  handleObject(n, {
    onKeyValue(key, n2) {
      fail(`methods has non-method: ${key}`, n2);
    },
    onMethod(meth, async, args, block) {
      if (transformPass) {
        state.methods[meth] = `${async ? "async " : ""}function ${meth}${args.text} ${reindent(transformNode(state, block), 0)}`;
      } else {
        state.methods[meth] = DISCOVERED;
      }
    }
  });
}
function handleWatchers(state, n, transformPass = true) {
  if (!transformPass) {
    return;
  }
  handleObject(n, {
    onKeyValue(key, n2) {
      switch (n2.type) {
        case "object":
          const watch = {};
          handleObject(n2, {
            onKeyValue(key2, n3) {
              switch (key2) {
                case "deep":
                  watch.deep = n3.text;
                  break;
                case "handler":
                  watch.handler = n3.text;
                  break;
                case "immediate":
                  watch.immediate = n3.text;
                  break;
                default:
                  fail(`unexpected watch value attribute: ${key2}`, n3);
              }
            },
            onMethod(meth, async, args, block) {
              watch.handler = `${async ? "async " : ""}${args.text} => ${reindent(transformNode(state, block), 0)}`;
            }
          });
          state.watchers[key] = watch;
          break;
        default:
          fail(`unexpected watch value type (not method or object): ${n2.type}`, n2);
      }
    },
    onMethod(meth, async, args, block) {
      const watch = {};
      watch.handler = `${async ? "async " : ""}${args.text} => ${reindent(transformNode(state, block), 0)}`;
      state.watchers[meth] = watch;
    }
  });
}
function handleDefaultExportKeyValue(state, key, n, transformPass = true) {
  switch (key) {
    case "components":
      break;
    case "computed":
      handleComputeds(state, n, transformPass);
      break;
    case "emits":
      assert(n.type === "array", `expected emits to be an array: ${n.type}`, n);
      state.emitsNode = n;
      break;
    case "methods":
      handleMethods(state, n, transformPass);
      break;
    case "name":
      break;
    case "props":
      assert(n.type === "object", `expected props to be an object: ${n.type}`, n);
      handleProps(state, n, transformPass);
      break;
    case "watch":
      handleWatchers(state, n, transformPass);
      break;
    default:
      fail(`export default key not supported: ${key}`, n);
  }
}
function handleDataMethod(state, n, transformPass = true) {
  var _a;
  for (const c of n.children) {
    switch (c.type) {
      case "{":
      case "}":
      case "comment":
        break;
      case "return_statement":
        if (((_a = c.children[1]) == null ? void 0 : _a.type) === "object") {
          handleObject(c.children[1], {
            onKeyValue(key, n2) {
              if (transformPass) {
                state.refs[key] = transformNode(state, n2);
              } else {
                state.refs[key] = "<observed>";
              }
            },
            onMethod(meth, async, args, block) {
              fail(`data() return object method key not supported: ${meth}`, block);
            }
          });
          break;
        }
      default:
        fail("complex data() not supported", c);
    }
  }
}
function handleDefaultExportMethod(state, meth, async, args, block, transformPass = true) {
  switch (meth) {
    case "data":
      handleDataMethod(state, block, transformPass);
      break;
    case "created":
      if (transformPass) {
        assert(args.text === "()", `created hook method has unexpected args: ${args.text}`, args);
        state.hooks.onBeforeMount = `${async ? "async " : ""}() => ${reindent(transformNode(state, block), 0)}`;
      }
      break;
    case "mounted":
      if (transformPass) {
        assert(args.text === "()", `mounted hook method has unexpected args: ${args.text}`, args);
        state.hooks.onMounted = `${async ? "async " : ""}() => ${reindent(transformNode(state, block), 0)}`;
      }
      break;
    default:
      fail(`export default key not supported: ${meth}`, block);
  }
}
function handleObject(object, hooks) {
  var _a, _b, _c, _d;
  for (const c of object.children) {
    if (c.type === "pair") {
      assert(((_a = c.children[0]) == null ? void 0 : _a.type) === "property_identifier", `pair[0] not property_identifer: ${c.children[0].type}`, c.children[0]);
      assert(((_b = c.children[1]) == null ? void 0 : _b.type) === ":", `pair[1] not ":": ${c.children[1].type}`, c.children[1]);
      assert(c.children[2], "pair has no 3nd child", c);
      (_c = hooks.onKeyValue) == null ? void 0 : _c.call(hooks, c.children[0].text, c.children[2]);
    } else if (c.type === "method_definition") {
      let meth;
      let async = false;
      let args;
      let block;
      for (const n of c.children) {
        switch (n.type) {
          case "async":
            async = true;
            break;
          case "property_identifier":
            meth = n.text;
            break;
          case "statement_block":
            block = n;
            break;
          case "formal_parameters":
            args = n;
            break;
          default:
            fail(`unhandled method_definition structure, found: ${n.type}`, n);
        }
      }
      assert(meth && args && block, "did not find required nodes for method_definition", c);
      (_d = hooks.onMethod) == null ? void 0 : _d.call(hooks, meth, async, args, block);
    } else if (c.type === "comment") {
    } else if (c.type === "{" || c.type === "," || c.type === "}") {
    } else {
      fail(`unexpected node found while parsing object: ${c.type}`, c);
    }
  }
}
function maybeHandleDefaultExport(state, n) {
  let defaultExport = false;
  for (const c1 of n.children) {
    if (c1.text === "default") {
      defaultExport = true;
    }
    if (defaultExport && c1.type === "object") {
      let transformPass = false;
      handleObject(c1, {
        onKeyValue: (key, n2) => handleDefaultExportKeyValue(state, key, n2, transformPass),
        onMethod: (meth, async, args, block) => handleDefaultExportMethod(state, meth, async, args, block, transformPass)
      });
      transformPass = true;
      handleObject(c1, {
        onKeyValue: (key, n2) => handleDefaultExportKeyValue(state, key, n2, transformPass),
        onMethod: (meth, async, args, block) => handleDefaultExportMethod(state, meth, async, args, block, transformPass)
      });
    }
  }
  return defaultExport;
}
export {
  scan,
  transform
};

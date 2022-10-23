import assert from "assert"
import fs from "fs"
import path from "path"
import Parser, { SyntaxNode } from "tree-sitter"
import { typescript } from "tree-sitter-typescript"
import javascript from "tree-sitter-javascript"

type WatchConfig = {
  handler?: string
  deep?: string
  immediate?: string
}

type State = {
  importNodes: SyntaxNode[]
  emitsNode?: SyntaxNode // ArrayNode
  hooks: {
    onBeforeMount?: string
    onMounted?: string
  }
  props: Record<string, string>
  propDefaultNodes: Record<string, string>
  refs: Record<string, string>
  computeds: Record<string, string>
  methods: Record<string, string>
  watchers: Record<string, WatchConfig>
  using: {
    $attrs?: boolean
    $el?: boolean
    $emit?: boolean
    $route?: boolean
    $router?: boolean
    $slots?: boolean
    nextTick?: boolean
    props?: boolean
  }
  nonRefs: Set<string>
  transformed?: string
}

function transform(vuePath: string): State {
  const state: State = {
    importNodes: [],
    hooks: {},
    props: {},
    propDefaultNodes: {},
    refs: {},
    computeds: {},
    using: {},
    nonRefs: new Set(),
    methods: {},
  }

  const data = fs.readFileSync(vuePath, "utf8")
  const lines = data.split("\n")

  let scriptStartIdx: number | undefined
  let scriptEndIdx: number | undefined
  let ts = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.match(/<script/)) {
      scriptStartIdx = i
      if (line.match(/setup/)) {
        scriptStartIdx = undefined
      }
      if (line.match(/lang="ts"/)) {
        ts = true
      }
    } else if (line.match(/<\/script/)) {
      scriptEndIdx = i
    }
  }

  if (scriptStartIdx == null || !scriptEndIdx) {
    console.log("script section start and end not found")
    return state
  }

  // XXX handle if js is after start tag or before end tag but no one does this
  const code = lines.slice(scriptStartIdx + 1, scriptEndIdx).join("\n")

  const parser = new Parser()
  if (ts) {
    parser.setLanguage(typescript)
  } else {
    parser.setLanguage(javascript)
  }

  const tree = parser.parse(code)
  // write out everything that is not the export statement node
  for (const c0 of tree.rootNode.children) {
    if (c0.type === "import_statement") {
      state.importNodes.push(c0)
    } else if (c0.type === "export_statement") {
      if (maybeHandleDefaultExport(state, c0)) {
        continue
      }
    }
  }

  console.log("------")
  console.log()

  let importSection = ""
  const vueImportsUsed: string[] = []
  if (state.hooks.onBeforeMount) {
    vueImportsUsed.push("onBeforeMount")
  }
  if (state.hooks.onMounted) {
    vueImportsUsed.push("onMounted")
  }
  if (state.using.$attrs) {
    vueImportsUsed.push("useAttrs")
  }
  if (Object.keys(state.computeds).length) {
    vueImportsUsed.push("computed")
  }
  if (state.using.nextTick) {
    vueImportsUsed.push("nextTick")
  }
  if (Object.keys(state.refs).length) {
    vueImportsUsed.push("ref")
  }
  if (state.using.$slots) {
    vueImportsUsed.push("useSlots")
  }
  if (vueImportsUsed.length) {
    for (const importNode of state.importNodes) {
      if (importNode.text.match(/'vue'/) || importNode.text.match(/"vue"/)) {
        assert(false, "editing vue import not supported yet") // TODO
      }
    }
    // TODO check how other imports are written (quotes)
    importSection += `import { ${vueImportsUsed.join(', ')} } from "vue"\n`
  }
  const vueRouterImportsUsed: string[] = []
  if (state.using.$router) {
    vueRouterImportsUsed.push("useRouter")
  }
  if (state.using.$route) {
    vueRouterImportsUsed.push("useRoute")
  }
  if (vueRouterImportsUsed.length) {
    for (const importNode of state.importNodes) {
      if (importNode.text.match(/'vue-router'/) || importNode.text.match(/"vue-router"/)) {
        assert(false, "editing vue-router import not supported yet") // TODO
      }
    }
    // TODO check how other imports are written (quotes)
    importSection += `import { ${vueRouterImportsUsed.join(', ')} } from "vue-router"\n`
  }
  for (const importNode of state.importNodes) {
    // TODO look if we already have a vue import and then add whichever features we use
    importSection += `${importNode.text}\n`
  }

  let propsSection = ""
  if (Object.keys(state.props).length) {
    if (state.using.props) {
      propsSection += "const props = "
    }
    if (Object.keys(state.propDefaultNodes).length) {
      propsSection += `withDefaults(`
    }
    propsSection += `defineProps<{\n`
    for (const k in state.props) {
      propsSection += `  ${k}: ${state.props[k]}\n`
    }
    propsSection += `}>()`
    if (Object.keys(state.propDefaultNodes).length) {
      propsSection += `, {\n`
      for (const k in state.propDefaultNodes) {
        propsSection += `  ${k}: ${state.propDefaultNodes[k]},\n`
      }
      propsSection += `})`
    }
    propsSection += "\n"
  }

  let injectionsSection = ""
  if (state.using.$attrs) {
    injectionsSection += "const $attrs = useAttrs()\n"
  }
  if (state.using.$route) {
    injectionsSection += "const $route = useRoute()\n"
  }
  if (state.using.$router) {
    injectionsSection += "const $router = useRouter()\n"
  }
  if (state.using.$slots) {
    injectionsSection += "const $slots = useSlots()\n"
  }
  if (state.nonRefs.size) {
    injectionsSection += `const $this = {}\n`
  }

  let emitsSection = ""
  assert(!((state.emitsNode ? 1 : 0) ^ (state.using.$emit ? 1 : 0)))
  if (state.using.$emit) {
    emitsSection += "const $emit = "
  }
  if (state.emitsNode) {
    emitsSection += `defineEmits(${state.emitsNode.text})\n`
  }

  let refsSection = ""
  if (state.using.$el) {
    // TODO need to rewrite the template root (can we check if there is not a single root?? -- need pug tree-sitter)
    refsSection += "const $el = ref<HTMLElement | undefined>()\n"
  }
  if (Object.keys(state.refs).length) {
    for (const k in state.refs) {
      refsSection += `const ${k} = ref(${state.refs[k]})\n`
    }
  }

  let hooksSection = ""
  if (state.hooks.onBeforeMount) {
    hooksSection += `onBeforeMount(${state.hooks.onBeforeMount})\n`
  }
  if (state.hooks.onMounted) {
    hooksSection += `onMounted(${state.hooks.onMounted})\n`
  }

  let computedsSection = ""
  if (Object.keys(state.computeds).length) {
    for (const k in state.computeds) {
      computedsSection += `const ${k} = computed(${state.computeds[k]})\n`
    }
  }

  let watchersSection = ""
  // TODO

  let methodsSection = ""
  for (const k in state.methods) {
    methodsSection += `${state.methods[k]}\n`
  }

  const sections = [
    importSection,
    propsSection,
    injectionsSection,
    emitsSection,
    refsSection,
    hooksSection,
    computedsSection,
    watchersSection,
    methodsSection,
  ].filter(Boolean)

  state.transformed = `<script setup lang="ts">\n${sections.join("\n")}</script>`

  console.log(state.transformed)

  return state
}

// just relative -- find smallest indent and then normalize it to numSpaces
// TODO assumes space indent
function reindent(s: string, minIndentSpaces: number) {
  const lines = s.split("\n")
  let minLineSpaces = Infinity
  // assumes first line is inline (not indented)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const md = line.match(/^(\s*)/)
    let lineSpaces = (md?.[1].length || 0)
    if (lineSpaces < minLineSpaces) {
      minLineSpaces = lineSpaces
    }
  }
  const spaceIndentChange = minIndentSpaces - minLineSpaces
  const ret: string[] = [lines[0]]
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (spaceIndentChange > 0) {
      ret.push(" ".repeat(spaceIndentChange) + line)
    } else {
      ret.push(line.slice(-spaceIndentChange))
    }
  }
  return ret.join("\n")
}

function propTypeIdentifierToType(s: string) {
  switch (s) {
    case "Array":
      return "any[]"
    case "Boolean":
      return "boolean"
    case "Number":
      return "number"
    case "String":
      return "string"
    default:
      throw new Error(`unhandled prop type identifier: ${s}`)
  }
}

function handleArray(n: SyntaxNode, onElement: (n: SyntaxNode) => void) {
  for (const c of n.children) {
    switch (c.type) {
      case "[":
      case ",":
      case "]":
        break
      default:
        onElement(c)
    }
  }
}

function handlePropType(n?: SyntaxNode): string {
  let ret: string
  if (n?.type === "array") {
    const types: string[] = []
    handleArray(n, (c: SyntaxNode) => {
      // TODO check what kind of node (assumes identifier)
      types.push(propTypeIdentifierToType(c.text))
    })
    ret = types.join(" | ")
  } else if (n?.type === "identifier") {
    ret = propTypeIdentifierToType(n.text)
  } else {
    assert(false, n?.text)
  }
  // TODO tag these to be touched up after
  // if (ret.match(/any/)) {
  //   ret += " // TODO fix any"
  // }
  return ret
}

function handleProps(state: State, o: SyntaxNode, transformPass = true) { // ObjectNode
  handleObject(o, {
    onKeyValue(propName: string, n: SyntaxNode) {
      switch (n.type) {
        case "identifier":
          // same as { type: ____ } value
          state.props[propName] = handlePropType(n)
          break
        case "object":
          if (n.text === "{}") {
            state.props[propName] = "any" // TODO tag to be fixed
            break
          }
          handleObject(n, {
            onKeyValue(key: string, n: SyntaxNode) {
              switch (key) {
                case "default":
                  state.propDefaultNodes[propName] = n.text
                  break
                case "type":
                  state.props[propName] = handlePropType(n) // TODO do not assume this node is identifier
                  break
                default:
                  assert(false, key)
              }
            },
            onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
              assert(meth === "default", meth)
              assert(args.text === "()")
              state.propDefaultNodes[propName] = `() => ${reindent(block.text, 2)}`
            },
          })
          break
        default:
          assert(false, n.children[2].type)
      }
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      assert(false, meth)
    },
  })
}

function transformBlock(state: State, s: string) {
  return s.replace(/this\.[$\w]+/g, (match) => {
    const name = match.slice(5)
    if (name === "$nextTick") {
      state.using.nextTick = true
      return "nextTick"
    }
    // XXX should warn about this usage and fix...
    if (name === "$el") {
      state.using.$el = true
      return "$el.value"
    }
    if (["$emit", "$slots", "$attrs", "$router", "$route"].includes(name)) {
      state.using[name] = true
      return name
    }
    // TODO need to supply a config of how to get prototype -- eg:
    // this.$sentry -> {$sentry: 'inject("$sentry")'}, etc.
    assert(!name.startsWith("$"), `config needed to determine how to replace global property: ${name}`)
    if (state.props[name]) {
      state.using.props = true
      return `props.${name}`
    } 
    if (state.computeds[name] || state.refs[name]) {
      return `${name}.value`
    }
    if (state.methods[name]) {
      return name
    }
    state.nonRefs.add(name)
    return `$this.${name}`
  })
}

function handleComputeds(state: State, n: SyntaxNode, transformPass = true) {
  handleObject(n, {
    onKeyValue(key: string, n: SyntaxNode) {
      assert(false, key)
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      assert(!async)
      if (transformPass) {
        const computedString = transformBlock(state, block.text)
        assert(args.text === "()")
        state.computeds[meth] = `() => ${reindent(computedString, 0)}`
      } else {
        state.computeds[meth] = "<discovered>"
      }
    },
  })
}

function handleMethods(state: State, n: SyntaxNode, transformPass = true) {
  handleObject(n, {
    onKeyValue(key: string, n: SyntaxNode) {
      assert(false, key)
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      if (transformPass) {
        state.methods[meth] = `${async ? 'async ' : ''}function ${meth}${args.text} ${reindent(transformBlock(state, block.text), 0)}`
      } else {
        state.methods[meth] = "<discovered>"
      }
    },
  })
}

function handleWatchers(state: State, n: SyntaxNode, transformPass = true) {
  if (!transformPass) {
    // cannot refer to watchers so need to discover them
    return
  }
  handleObject(n, {
    onKeyValue(key: string, n: SyntaxNode) {
      // TODO lots of different cases here
      switch (n.type) {
        case "object":
          const watch: WatchConfig = {}
          handleObject(n, {
            onKeyValue(key: string, n: SyntaxNode) {
              switch (key) {
                case "deep":
                  watch.deep = n.text
                  break
                case "handler":
                  watch.handler = n.text
                  break
                case "immediate":
                  watch.immediate = n.text
                  break
                default:
                  assert(false, key)
              }
            },
          })
          break
        default:
          assert(false, n.type)
      }
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      assert(false, meth)
    },
  })
}

function handleDefaultExportKeyValue(state: State, key: string, n: SyntaxNode, transformPass = true) {
  switch (key) {
    case "components":
      // we don't need this now! but we should do better and remove/rewrite imports to use components.d.ts
      break
    case "computed":
      handleComputeds(state, n, transformPass)
      break
    case "emits":
      // property_identifier : array
      assert(n.type === "array", n.type)
      state.emitsNode = n
      break
    case "methods":
      handleMethods(state, n, transformPass)
      break
    case "name":
      // do nothing with this...
      break
    case "props":
      assert(n.type === "object", n.type)
      handleProps(state, n, transformPass)
      break
    case "watch":
      handleWatchers(state, n, transformPass)
      break
    default:
      assert(false, key)
  }
}

function handleDataMethod(state: State, n: SyntaxNode, transformPass = true) {
  for (const c of n.children) {
    // TODO work to support preamble
    // data() {
    //   console.log("random side-effect")
    //   return {
    //     a: "hi",
    //   }
    // }
    // should ideally become
    // const a = ref<string>()
    // ;(() => {
    //   console.log("random side-effect")
    //   a.value = "hi"
    // })
    if (c.type === "return_statement") {
      assert(c.children[0].type === "return")
      assert(c.children[1].type === "object")
      handleObject(c.children[1], {
        onKeyValue(key: string, n: SyntaxNode) {
          if (transformPass) {
            state.refs[key] = transformBlock(state, n.text) // XXX reindent?
          } else {
            state.refs[key] = "<observed>"
          }
        },
        onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
          assert(false, meth)
        },
      })
    }
  }
}

function handleDefaultExportMethod(state: State, meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode, transformPass = true) {
  switch (meth) {
    case "data":
      handleDataMethod(state, block, transformPass)
      break
    case "created":
      if (transformPass) {
        assert(args.text === "()")
        state.hooks.onBeforeMount = `${async ? 'async ' : ''}() => ${reindent(transformBlock(state, block.text), 0)}`
      }
      break
    case "mounted":
      if (transformPass) {
        assert(args.text === "()")
        state.hooks.onMounted = `${async ? 'async ' : ''}() => ${reindent(transformBlock(state, block.text), 0)}`
      }
      break
    default:
      // TODO other hooks destroyed, mounted, etc.
      assert(false, meth)
  }
}

type HandleObjectHooks = {
  onKeyValue?: (key: string, n: SyntaxNode) => void
  onMethod?: (meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) => void
}

function handleObject(object: SyntaxNode, hooks: HandleObjectHooks) { // ObjectNode
  for (const c of object.children) {
    if (c.type === "pair") {
      assert(c.children[0]?.type === "property_identifier", c.children[0].type)
      assert(c.children[1]?.type === ":", c.children[1].type)
      assert(c.children[2])
      hooks.onKeyValue?.(c.children[0].text, c.children[2])
    } else if (c.type === "method_definition") {
      let meth: string | undefined
      let async = false
      let args: SyntaxNode | undefined
      let block: SyntaxNode | undefined
      for (const n of c.children) {
        switch (n.type) {
          case "async":
            async = true
            break
          case "property_identifier":
            meth = n.text
            break
          case "statement_block":
            block = n
            break
          case "formal_parameters":
            args = n
            break
          default:
            assert(false, n.type)
        }
      }
      assert(meth && args && block) 
      hooks.onMethod?.(meth, async, args, block)
    } else if (c.type === "comment") {
      // TODO preserve these -- onComment
    } else if (c.type === "{" || c.type === "," || c.type === "}") {
      // do nothing
    } else {
      assert(false, c.text)
    }
  }
}

function maybeHandleDefaultExport(state: State, n: SyntaxNode): boolean {
  let defaultExport = false
  for (const c1 of n.children) {
    if (c1.text === "default") {
      defaultExport = true
    }
    if (defaultExport && c1.type === "object") {
      // handle the default export here
      let transformPass = false
      handleObject(c1, {
        onKeyValue: (key: string, n: SyntaxNode) => handleDefaultExportKeyValue(state, key, n, transformPass),
        onMethod: (meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) => 
          handleDefaultExportMethod(state, meth, async, args, block, transformPass),
      })
      transformPass = true
      handleObject(c1, {
        onKeyValue: (key: string, n: SyntaxNode) => handleDefaultExportKeyValue(state, key, n, transformPass),
        onMethod: (meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) => 
          handleDefaultExportMethod(state, meth, async, args, block, transformPass),
      })
    }
  }
  return defaultExport
}

transform(path.resolve(process.argv[2]))
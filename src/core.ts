import type { SyntaxNode, Tree } from "tree-sitter"

// don't use stdlib so can be used in browser env
function assert(v: any, msg: string) {
  if (!v) {
    throw new Error(`assertion failed: ${msg}`)
  }
}

const DISCOVERED = "<discovered>"

type Language = any // TODO
type Parser = {
  setLanguage(lang: Language): void
  parse(str: string): Tree
}

type WatchConfig = {
  handler?: string
  deep?: string
  immediate?: string
}

type ScanState = {
  lines?: string[]
  scriptStartIdx?: number
  scriptEndIdx?: number
  scriptTs?: boolean
  script?: string
  templateStartIdx?: number
  templateEndIdx?: number
  templatePug?: boolean
}

export type State = {
  scan: ScanState
  // parse
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

export function scan(sfc: string): State {
  const state: State = {
    scan: {},
    importNodes: [],
    hooks: {},
    props: {},
    propDefaultNodes: {},
    refs: {},
    computeds: {},
    using: {},
    nonRefs: new Set(),
    methods: {},
    watchers: {},
  }
  const { scan } = state

  scan.lines = sfc.split("\n")

  // XXX ensure these aren't strings inside sfc sections... 
  // do a proper parse or maintain which part of sfc we are in
  for (let i = 0; i < scan.lines.length; i++) {
    const line = scan.lines[i]
    if (line.match(/<script/)) {
      scan.scriptStartIdx = i
      if (line.match(/setup/)) {
        scan.scriptStartIdx = undefined
        break
      }
      if (line.match(/lang="ts"/) || line.match(/lang='ts'/)) {
        scan.scriptTs = true
      }
    } else if (line.match(/<\/script/)) {
      scan.scriptEndIdx = i
    } else if (line.match(/<template/)) {
      scan.templateStartIdx = i
      // XXX support other template langs
      if (line.match(/lang="pug"/) || line.match(/lang='pug'/)) {
        scan.templatePug = true
      }
    } else if (line.match(/<\/template/)) {
      scan.templateEndIdx = i
    }
  }

  if (scan.scriptStartIdx != null && scan.scriptEndIdx) {
    // XXX handle if js is after start tag or before end tag but no one does this
    scan.script = scan.lines.slice(scan.scriptStartIdx + 1, scan.scriptEndIdx).join("\n")
  }

  return state
}

export function transform(state: State, parser: Parser) {
  const {
    lines,
    script,
    scriptStartIdx,
    scriptEndIdx,
    templateStartIdx,
    templateEndIdx,
    templatePug,
  } = state.scan

  assert(script, "no options api script scanned")
  const tree = parser.parse(script)

  for (const n of tree.rootNode.children) {
    if (n.type === "import_statement") {
      state.importNodes.push(n)
    } else if (n.type === "export_statement") {
      if (maybeHandleDefaultExport(state, n)) {
        continue
      }
    } else {
      assert(false, `need to write out non import/export statement: ${n.type}`)
    }
  }

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
        assert(false, "editing existing vue import not supported yet") // TODO
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
        assert(false, "editing existing vue-router import not supported yet") // TODO
      }
    }
    // TODO check how other imports are written (quotes)
    importSection += `import { ${vueRouterImportsUsed.join(', ')} } from "vue-router"\n`
  }
  for (const importNode of state.importNodes) {
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
      // TODO maybe not optional prop required attribute right?
      propsSection += `  ${k}?: ${state.props[k]}\n`
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
  assert(!((state.emitsNode ? 1 : 0) ^ (state.using.$emit ? 1 : 0)), "specifies emits but doesn't or vice versa")
  if (state.using.$emit) {
    emitsSection += "const $emit = "
  }
  if (state.emitsNode) {
    emitsSection += `defineEmits(${state.emitsNode.text})\n`
  }

  let refsSection = ""
  let template: string | undefined
  if (state.using.$el) {
    refsSection += "const $el = ref<HTMLElement | undefined>()\n"
    if (templateStartIdx != null) {
      // XXX handle if template is after start tag or before end tag but no one does this
      template = lines.slice(templateStartIdx + 1, templateEndIdx).join("\n")
      // TODO find the first tag and rewrite it such that we inject the attribute ref="$el"
      // if we do not find one root node we should error and fail
      if (templatePug) {
        const templateLines = template.split("\n")
        // if multiple non-comment lines have 0 indent we have a problem
        // if only 0 indent line is not an html tag we have a problem
        let zeroIndentIdx: number | undefined
        for (let i = 0; i < templateLines.length; i++) {
          const line = templateLines[i]
          if (line.startsWith("//")) {
            continue
          }
          const lineSpaces = linePrefixSpaces(line)
          if (!lineSpaces) {
            assert(zeroIndentIdx == null, "multiple zero-space indents found in pug template")
            zeroIndentIdx = i
          }
        }
        assert(zeroIndentIdx != null, "no zero-space indent found in pug template")
        // can be .some-class, #some-id, div
        const zeroIndentLine = templateLines[zeroIndentIdx]
        // html tag should just be all lower case
        if (zeroIndentLine.startsWith(".") || zeroIndentLine.startsWith("#") || zeroIndentLine.match(/^[a-z]+([.#(\s]|$)/)) {
          let newLine: string
          let idx = zeroIndentLine.indexOf("(")
          const zeroIndentChars = zeroIndentLine.split("")
          if (idx >= 0) {
            const suffix = (zeroIndentLine[idx + 1] && zeroIndentLine[idx + 1] !== ")") ? " " : ""
            zeroIndentChars.splice(idx + 1, 0, `ref="$el"${suffix}`)
            newLine = zeroIndentChars.join("")
          } else {
            idx = zeroIndentLine.indexOf(" ")
            if (idx >= 0) {
              zeroIndentChars.splice(idx + 1, 0, `(ref="$el")`)
              newLine = zeroIndentChars.join("")
            } else {
              idx = zeroIndentLine.length
              newLine = zeroIndentLine + `(ref="$el")`
            }
          }
          templateLines[zeroIndentIdx] = newLine
          template = templateLines.join("\n")
        } else {
          assert(false, "cannot edit pug template to suport $el")
        }
      } else {
        // probably need tree-sitter html?
        assert(false, "cannot edit non-pug template to suport $el")
      }
    }
  } else {
    state.scan.templateStartIdx = undefined // no transformation needed so simplifies the output gen
  }
  for (const k in state.refs) {
    refsSection += `const ${k} = ref(${state.refs[k]})\n`
  }

  let hooksSection = ""
  if (state.hooks.onBeforeMount) {
    hooksSection += `onBeforeMount(${state.hooks.onBeforeMount})\n`
  }
  if (state.hooks.onMounted) {
    hooksSection += `onMounted(${state.hooks.onMounted})\n`
  }

  let computedsSection = ""
  for (const k in state.computeds) {
    computedsSection += `const ${k} = computed(${state.computeds[k]})\n`
  }

  let watchersSection = ""
  for (const k in state.watchers) {
    const watcher = state.watchers[k]
    watchersSection += `const ${k} = watch(${watcher.handler}`
    if (watcher.deep || watcher.immediate) {
      watchersSection += `, {\n`
      if (watcher.deep) {
        watchersSection += `  deep: ${watcher.deep},\n`
      }
      if (watcher.immediate) {
        watchersSection += `  immediate: ${watcher.immediate},\n`
      }
      watchersSection += `}`
    }
    watchersSection += `)\n`
  }

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

  // this can be simplified...
  let transformedSections: string[] = []
  if (templateStartIdx != null) {
    assert(template, "template not found but needed")
    if (templateStartIdx < scriptStartIdx) {
      transformedSections.push(...lines.slice(0, templateStartIdx + 1))
      transformedSections.push(template)
      transformedSections.push(...lines.slice(templateEndIdx, scriptStartIdx))
      transformedSections.push(`<script setup lang="ts">\n${sections.join("\n")}</script>`)
      transformedSections.push(...lines.slice(scriptEndIdx + 1, lines.length))
    } else {
      transformedSections.push(...lines.slice(0, scriptStartIdx))
      transformedSections.push(`<script setup lang="ts">\n${sections.join("\n")}</script>`)
      transformedSections.push(...lines.slice(scriptEndIdx, templateStartIdx + 1))
      transformedSections.push(template)
      transformedSections.push(...lines.slice(templateEndIdx, lines.length))
    }
  } else {
    transformedSections.push(...lines.slice(0, scriptStartIdx))
    transformedSections.push(`<script setup lang="ts">\n${sections.join("\n")}</script>`)
    transformedSections.push(...lines.slice(scriptEndIdx, lines.length))
  }

  state.transformed = transformedSections.join("\n")

  return state
}

function linePrefixSpaces(line: string): number {
  const md = line.match(/^(\s*)/)
  return (md?.[1].length || 0)
}

// just relative -- find smallest indent and then normalize it
// TODO assumes space indent
function reindent(s: string, minIndentSpaces: number) {
  const lines = s.split("\n")
  let minLineSpaces = Infinity
  // TODO assumes first line is inline (not indented)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const lineSpaces = linePrefixSpaces(line)
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
    assert(false, `prop value type not array or identifier: ${n?.text}`)
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
                  assert(false, `prop attribute not handled: ${key}`)
              }
            },
            onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
              assert(meth === "default", `prop attribute method not named default: ${meth}`)
              assert(args.text === "()", `prop attribute method default has unexpected args: ${args.text}`)
              state.propDefaultNodes[propName] = `() => ${reindent(block.text, 2)}`
            },
          })
          break
        default:
          assert(false, `prop value not identifier or object: ${n.children[2].type}`)
      }
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      assert(false, `unexpected prop method: ${meth}`)
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
      assert(false, `computed non-method key unexpected: ${key}`)
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      assert(!async, "computed async method unexpected")
      if (transformPass) {
        const computedString = transformBlock(state, block.text)
        assert(args.text === "()", `computed method has unexpected args: ${args.text}`)
        state.computeds[meth] = `() => ${reindent(computedString, 0)}`
      } else {
        state.computeds[meth] = DISCOVERED
      }
    },
  })
}

function handleMethods(state: State, n: SyntaxNode, transformPass = true) {
  handleObject(n, {
    onKeyValue(key: string, n: SyntaxNode) {
      assert(false, `methods has non-method: ${key}`)
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      if (transformPass) {
        state.methods[meth] = `${async ? 'async ' : ''}function ${meth}${args.text} ${reindent(transformBlock(state, block.text), 0)}`
      } else {
        state.methods[meth] = DISCOVERED
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
                  assert(false, `unexpected watch value attribute: ${key}`)
              }
            },
            onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
              watch.handler = `${async ? 'async ' : ''}${args.text} => ${reindent(transformBlock(state, block.text), 0)}`
            },
          })
          state.watchers[key] = watch
          break
        default:
          assert(false, `unexpected watch value type (not method or object): ${n.type}`)
      }
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      const watch: WatchConfig = {}
      watch.handler = `${async ? 'async ' : ''}${args.text} => ${reindent(transformBlock(state, block.text), 0)}`
      state.watchers[meth] = watch
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
      assert(n.type === "array", `expected emits to be an array: ${n.type}`)
      state.emitsNode = n
      break
    case "methods":
      handleMethods(state, n, transformPass)
      break
    case "name":
      // do nothing with this...
      break
    case "props":
      assert(n.type === "object", `expected props to be an object: ${n.type}`)
      handleProps(state, n, transformPass)
      break
    case "watch":
      handleWatchers(state, n, transformPass)
      break
    default:
      assert(false, `export default key not supported: ${key}`)
  }
}

function handleDataMethod(state: State, n: SyntaxNode, transformPass = true) {
  for (const c of n.children) {
    // TODO work to support preamble
    // data() {
    //   // unsupported
    //   // (1) preamble: console.log("random side-effect")
    //   // (2) complex structure: const ret = {}; ret.yo = "hi"; return ret
    //   // -> if any of these cases come up, using.$data and set it to reactive and just rewrite to $data.yo
    // }
    // should ideally become
    // const a = ref<string>()
    // const $data = reactive(() => {
    //   console.log("random side-effect")
    //   const ret = {}; ret.yo = "hi"; return ret
    // })()
    // TODO $data.test (and in template need to rewrite too!!!) UGH
    if (c.type === "return_statement") {
      // if matches this, just do the simple version
      assert(c.children[1].type === "object", "only simple data() object return supported")
      handleObject(c.children[1], {
        onKeyValue(key: string, n: SyntaxNode) {
          if (transformPass) {
            state.refs[key] = transformBlock(state, n.text) // XXX reindent?
          } else {
            state.refs[key] = "<observed>"
          }
        },
        onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
          assert(false, `data() return object method key not supported: ${meth}`)
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
        assert(args.text === "()", `created hook method has unexpected args: ${args.text}`)
        state.hooks.onBeforeMount = `${async ? 'async ' : ''}() => ${reindent(transformBlock(state, block.text), 0)}`
      }
      break
    case "mounted":
      if (transformPass) {
        assert(args.text === "()", `mounted hook method has unexpected args: ${args.text}`)
        state.hooks.onMounted = `${async ? 'async ' : ''}() => ${reindent(transformBlock(state, block.text), 0)}`
      }
      break
    default:
      // TODO other hooks destroyed, etc.
      assert(false, `export default key not supported: ${meth}`)
  }
}

type HandleObjectHooks = {
  onKeyValue?: (key: string, n: SyntaxNode) => void
  onMethod?: (meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) => void
}

function handleObject(object: SyntaxNode, hooks: HandleObjectHooks) { // ObjectNode
  for (const c of object.children) {
    if (c.type === "pair") {
      assert(c.children[0]?.type === "property_identifier", `pair[0] not property_identifer: ${c.children[0].type}`)
      assert(c.children[1]?.type === ":", `pair[1] not ":": ${c.children[1].type}`)
      assert(c.children[2], "pair has no 3nd child")
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
            assert(false, `unhandled method_definition structure, found: ${n.type}`)
        }
      }
      assert(meth && args && block, "did not find required nodes for method_definition") 
      hooks.onMethod?.(meth, async, args, block)
    } else if (c.type === "comment") {
      // TODO preserve these -- onComment
    } else if (c.type === "{" || c.type === "," || c.type === "}") {
      // do nothing
    } else {
      assert(false, `unexpected node found while parsing object: ${c.type}`)
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
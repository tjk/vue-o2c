import type { SyntaxNode, Tree } from "tree-sitter"
import { identifier } from "safe-identifier"

function fail(msg: string, n?: SyntaxNode): never {
  // TODO need class or something along state so we can add scriptStartIdx to row value
  throw new Error(`${msg}${n ? ` @ (${n.startPosition.row + 1}, ${n.startPosition.column + 1})` : ""}`)
}

// https://stackoverflow.com/a/73561238/387413
type Falsy = null | undefined | false | 0 | -0 | 0n | ''
type Truthy<T> = T extends Falsy ? never : T

// don't use stdlib so can be used in browser env
function assert<T>(v: T, msg: string, n?: SyntaxNode): asserts v is Truthy<T> {
  if (!v) {
    fail(`assertion failed: ${msg}`, n)
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

// XXX merge user provided one into state.config
export type Config = {
  useSemis?: boolean
  useDoubleQuotes?: boolean // otherwise use singles
}

export type State = {
  scan: ScanState
  tree?: Tree
  config: Config
  // memoized
  semi: string
  quote: string
  // parse
  extraScript: string
  importNodes: SyntaxNode[]
  hooks: { // XXX what should be under `using` vs not?
    beforeCreate?: string
    created?: string
    beforeMount?: string
    mounted?: string
    beforeUpdate?: string
    updated?: string
    beforeDestroy?: string
    destroyed?: string
    errorCaptured?: string
  }
  props: Record<string, string>
  propDefaultNodes: Record<string, string>
  refs: Record<string, string>
  computeds: Record<string, string>
  methods: Record<string, string>
  watchers: Record<string, WatchConfig> // key is source callback body
  filters: Record<string, string>
  directives: Record<string, string>
  using: {
    $attrs?: boolean
    $el?: boolean
    $emit?: boolean
    $route?: boolean
    $router?: boolean
    $slots?: boolean
    nextTick?: boolean
    props?: boolean
    emits: Set<string>
    provides: Set<string>
    injects: Set<string>
  }
  nonRefs: Set<string>
  transformed?: string
}

export function scan(sfc: string): State {
  const state: State = {
    extraScript: "",
    scan: {},
    config: {},
    // memo
    quote: "'",
    semi: "",
    // ---
    importNodes: [],
    hooks: {},
    props: {},
    propDefaultNodes: {},
    refs: {},
    computeds: {},
    using: {
      emits: new Set(),
      provides: new Set(),
      injects: new Set(),
    },
    nonRefs: new Set(),
    methods: {},
    watchers: {},
    filters: {},
    directives: {},
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

function importString(state: State, pkg: string, imports: Set<string>) {
  const importsString = `{ ${Array.from(imports).join(', ')} }`
  return `import ${importsString} from ${state.quote}${pkg}${state.quote}${state.semi}\n`
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
  if (!lines) {
    throw new Error("no lines scanned")
  }
  const tree = state.tree = parser.parse(script)

  let singleQuotes = 0
  let doubleQuotes = 0
  bfs(tree.rootNode, (n: SyntaxNode) => {
    if (n.type === "ERROR") {
      fail("syntax error", n)
    }
    if (!("useSemis" in state.config) && n.type === ";") {
      state.config.useSemis = true
    }
    if (n.type === "string") {
      if (n.text[0] === "'") {
        singleQuotes++
      } else if (n.text[0] === '"') {
        doubleQuotes++
      }
    }
  })
  if (!("useDoubleQuotes" in state.config) && doubleQuotes > singleQuotes) {
    state.config.useDoubleQuotes = true
  }

  // set the memoized values
  if (state.config.useDoubleQuotes) {
    state.quote = '"'
  }
  if (state.config.useSemis) {
    state.semi = ";"
  }

  for (const n of tree.rootNode.children) {
    if (n.type === "import_statement") {
      state.importNodes.push(n)
    } else if (n.type === "export_statement") {
      if (maybeHandleDefaultExport(state, n)) {
        continue
      }
    } else {
      state.extraScript += `${n.text}\n`
    }
  }

  const vueImportsUsed = new Set<string>()
  if (Object.keys(state.computeds).length) {
    vueImportsUsed.add("computed")
  }
  if (state.using.injects.size) {
    vueImportsUsed.add("inject")
  }
  if (state.using.nextTick) {
    vueImportsUsed.add("nextTick")
  }
  if (state.hooks.beforeMount) {
    vueImportsUsed.add("onBeforeMount")
  }
  if (state.hooks.beforeDestroy) {
    vueImportsUsed.add("onBeforeUnmount")
  }
  if (state.hooks.beforeUpdate) {
    vueImportsUsed.add("onBeforeUpdate")
  }
  if (state.hooks.errorCaptured) {
    vueImportsUsed.add("onErrorCaptured")
  }
  if (state.hooks.mounted) {
    vueImportsUsed.add("onMounted")
  }
  if (state.hooks.destroyed) {
    vueImportsUsed.add("onUnmounted")
  }
  if (state.hooks.updated) {
    vueImportsUsed.add("onUpdated")
  }
  if (state.using.provides.size) {
    vueImportsUsed.add("provide")
  }
  if (state.using.$attrs) {
    vueImportsUsed.add("useAttrs")
  }
  if (Object.keys(state.refs).length) {
    vueImportsUsed.add("ref")
  }
  if (state.using.$slots) {
    vueImportsUsed.add("useSlots")
  }
  if (Object.keys(state.watchers).length) {
    vueImportsUsed.add("watch")
  }
  const vueRouterImportsUsed = new Set<string>()
  if (state.using.$router) {
    vueRouterImportsUsed.add("useRouter")
  }
  if (state.using.$route) {
    vueRouterImportsUsed.add("useRoute")
  }
  let importSection = ""
  let hasVueImport = false
  let hasVueRouterImport = false
  for (const importNode of state.importNodes) {
    // XXX check syntax node instead of string compare?
    if (importNode.text.match(/'vue'/) || importNode.text.match(/"vue"/)) {
      // XXX support import vue from "vue" (not just import { ... } from "vue") ?
      treeSelect(importNode, ["named_imports", "import_specifier", "identifier"], n => {
        if (n.text !== "defineComponent") {
          vueImportsUsed.add(n.text)
        }
      })
      hasVueImport = true
      importSection += importString(state, "vue", vueImportsUsed)
    } else if (importNode.text.match(/'vue-router'/) || importNode.text.match(/"vue-router"/)) {
      // XXX support import vue from "vue" (not just import { ... } from "vue") ?
      treeSelect(importNode, ["named_imports", "import_specifier", "identifier"], n => {
        vueRouterImportsUsed.add(n.text)
      })
      hasVueRouterImport = true
      importSection += importString(state, "vue-router", vueRouterImportsUsed)
    } else {
      importSection += `${importNode.text}\n`
    }
  }
  if (!hasVueRouterImport && vueRouterImportsUsed.size) {
    importSection = importString(state, "vue-router", vueRouterImportsUsed) + importSection
  }
  if (!hasVueImport && vueImportsUsed.size) {
    importSection = importString(state, "vue", vueImportsUsed) + importSection
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
    propsSection += `${state.semi}\n`
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
  for (const inj of state.using.injects) {
    injectionsSection += `const $${inj} = inject(${state.quote}${inj}${state.quote})${state.semi}\n`
  }

  let emitsSection = ""
  if (state.using.$emit) {
    if (!state.using.emits.size) {
      fail("using $emit but no emits discovered") // should never happen
    }
    emitsSection += "const $emit = "
  }
  if (state.using.emits.size) {
    emitsSection += `defineEmits([${Array.from(state.using.emits).join(", ")}])${state.semi}\n`
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
        const zeroIndentLine = templateLines[zeroIndentIdx!]
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
          templateLines[zeroIndentIdx!] = newLine
          template = templateLines.join("\n")
        } else {
          fail("cannot edit pug template to suport $el")
        }
      } else {
        // probably need tree-sitter html?
        fail("cannot edit non-pug template to suport $el")
      }
    }
  }
  for (const k in state.refs) {
    refsSection += `const ${k} = ref(${state.refs[k]})${state.semi}\n`
  }

  let computedsSection = ""
  for (const k in state.computeds) {
    computedsSection += `const ${k} = computed(${state.computeds[k]})${state.semi}\n`
  }

  let watchersSection = ""
  for (const k in state.watchers) {
    const watcher = state.watchers[k]
    watchersSection += `watch(() => ${k}, ${watcher.handler}`
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
    watchersSection += `)${state.semi}\n`
  }

  let methodsSection = ""
  for (const k in state.methods) {
    methodsSection += `${state.methods[k]}${state.semi}\n`
  }
  if (Object.keys(state.filters).length) {
    if (!template) {
      if (templateStartIdx != null) {
        // XXX handle if template is after start tag or before end tag but no one does this
        template = lines.slice(templateStartIdx + 1, templateEndIdx).join("\n")
      } else {
        fail("cannot find template to rewrite filters")
      }
    }
    template = template!.replace(/{{.*}}/g, match => {
      // XXX preserve whether like {{ spaced }} or {{tight}}
      let spacing = ""
      if (match[2] === " ") {
        spacing = " "
      }
      let str = match
      const chunks = match.slice(2, match.length-2).split("|").map(c => c.trim())
      if (chunks.length > 1) {
        str = chunks[0]
        for (let i = 1; i < chunks.length; i++) {
          const chunk = chunks[i]
          const parenIdx = chunk.indexOf("(")
          if (parenIdx >= 0) {
            str = `${chunk.slice(0, parenIdx+1)}${str}, ${chunk.slice(parenIdx+1)}`
          } else {
            str = `${chunk}(${str})`
          }
        }
      }
      return `{{${spacing}${str}${spacing}}}`
    })
  }
  for (const k in state.filters) {
    methodsSection += `${state.filters[k]}${state.semi}\n`
  }

  let directivesSection = ""
  for (const k in state.directives) {
    directivesSection += `const v${k[0].toUpperCase() + k.slice(1)} = ${state.directives[k]}${state.semi}\n`
  }

  // XXX sort provides alphabetically
  let providesSection = ""
  for (const k of state.using.provides) {
    providesSection += `provide(${state.quote}${k}${state.quote}, ${k})${state.semi}\n`
  }

  const scriptSections = [
    importSection,
    propsSection,
    injectionsSection,
    emitsSection,
    state.hooks.beforeCreate && `${state.hooks.beforeCreate}\n`, // XXX semi?
    state.hooks.created && `${state.hooks.created}\n`, // XXX semi?
    refsSection,
    state.hooks.beforeMount && `onBeforeMount(${state.hooks.beforeMount})${state.semi}\n`,
    state.hooks.mounted && `onMounted(${state.hooks.mounted})${state.semi}\n`,
    state.hooks.beforeUpdate && `onBeforeUpdate(${state.hooks.beforeUpdate})${state.semi}\n`,
    state.hooks.updated && `onUpdated(${state.hooks.updated})${state.semi}\n`,
    state.hooks.beforeDestroy && `onBeforeUnmount(${state.hooks.beforeDestroy})${state.semi}\n`,
    state.hooks.destroyed && `onUnmounted(${state.hooks.destroyed})${state.semi}\n`,
    state.hooks.errorCaptured && `onErrorCaptured(${state.hooks.errorCaptured})${state.semi}\n`,
    computedsSection,
    watchersSection,
    methodsSection,
    directivesSection,
    providesSection,
  ].filter(Boolean)

  const newScript = scriptSections.join("\n") + state.extraScript

  // this can be simplified...
  let transformed = ""
  if (scriptEndIdx == null) {
    throw new Error("script end index not found")
  }
  if (template) {
    if (templateStartIdx == null || scriptStartIdx == null) {
      throw new Error("template or script indices not found")
    }
    if (templateStartIdx < scriptStartIdx) {
      transformed += lines.slice(0, templateStartIdx + 1).join("\n")
      transformed += `\n${template}\n`
      transformed += lines.slice(templateEndIdx, scriptStartIdx).join("\n")
      transformed += `\n<script setup lang="ts">\n${newScript}</script>\n`
      transformed += lines.slice(scriptEndIdx + 1, lines.length).join("\n")
    } else {
      transformed += lines.slice(0, scriptStartIdx).join("\n")
      transformed += `\n<script setup lang="ts">\n${newScript}</script>\n`
      transformed += lines.slice(scriptEndIdx + 1, templateStartIdx + 1).join("\n")
      transformed += `\n${template}\n`
      transformed += lines.slice(templateEndIdx, lines.length).join("\n")
    }
  } else {
    transformed += [
      lines.slice(0, scriptStartIdx).join("\n"),
      `<script setup lang="ts">\n${newScript}</script>`,
      lines.slice(scriptEndIdx + 1, lines.length).join("\n"),
    ].filter(Boolean).join("\n")
  }

  state.transformed = transformed

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
    case "Date":
      return "Date"
    case "Function":
      return "Function"
    case "Number":
      return "number"
    case "Object":
      return "object"
    case "String":
      return "string"
    case "Symbol":
      return "symbol"
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
    fail(`prop value type not array or identifier: ${n?.text}`, n)
  }
  // TODO tag these to be touched up after
  // if (ret.match(/any/)) {
  //   ret += " // TODO fix any"
  // }
  return ret
}

function handleProps(state: State, s: SyntaxNode, transformPass = true) { // ObjectNode or ArrayNode
  if (s.type === 'array') {
    handleArray(s, (n: SyntaxNode) => {
        state.props[n.text] = 'any';
    })
    return;
  }
  handleObject(s, {
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
                  fail(`prop attribute not handled: ${key}`, n)
              }
            },
            onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
              assert(meth === "default", `prop attribute method not named default: ${meth}`, n)
              assert(args.text === "()", `prop attribute method default has unexpected args: ${args.text}`, args)
              state.propDefaultNodes[propName] = `() => ${reindent(block.text, 2)}`
            },
          })
          break
        default:
          fail(`prop value not identifier or object: ${n.children[2].type}`, n.children[2])
      }
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      fail(`unexpected prop method: ${meth}`, s) // XXX wrong syntax node here
    },
  })
}

type OnNode = (n: SyntaxNode) => void | false
function bfs(n: SyntaxNode, onNode: OnNode) {
  const q = [n]
  while (q.length) {
    const c = q.shift()!
    const ret = onNode(c)
    if (ret !== false) {
      q.push(...c.children)
    }
  }
}
// <selector1> <selector2> ...
function treeSelect(n: SyntaxNode, selectors: string[], onNode: OnNode) {
  const [selector, ...rest] = selectors
  bfs(n, c => {
    if (c.type === selector) {
      if (rest.length) {
        treeSelect(n, rest, onNode)
      } else {
        onNode(c)
      }
      return false
    }
  })
}

function transformToken(state: State, token: string): string {
  // XXX should warn about this usage and fix...
  if (token === "$el") {
    state.using.$el = true
    return "$el.value"
  }
  if (["$emit", "$slots", "$attrs", "$router", "$route"].includes(token)) {
    (state.using as any)[token] = true // XXX fix ts
    return token
  }
  // TODO need to supply a config of how to get prototype -- eg:
  // this.$sentry -> {$sentry: 'inject("$sentry")'}, etc.
  assert(!token.startsWith("$"), `config needed to determine how to replace global property: ${token}`)
  assert(token === identifier(token), `unsafe identifier not supported: ${token}`)
  if (state.props[token]) {
    state.using.props = true
    return `props.${token}`
  }
  if (state.computeds[token] || state.refs[token]) {
    return `${token}.value`
  }
  if (state.methods[token]) {
    return token
  }
  if (state.using.injects.has(token)) {
    return `$${token}` // convention
  }
  state.nonRefs.add(token)
  return `$this.${token}`
}

function transformNode(state: State, n: SyntaxNode) {
  const replacements: {
    startIndex: number,
    endIndex: number,
    value: string,
  }[] = []
  const handleThisKey = (name: string, startIndex: number, endIndex: number, textNode: SyntaxNode) => {
    const pushReplacement = (value: string) => {
      replacements.push({
        startIndex: startIndex - n.startIndex,
        endIndex: endIndex - n.startIndex,
        value,
      })
    }
    if (name === "$nextTick") {
      state.using.nextTick = true
      pushReplacement("nextTick")
      return
    }
    // do not include nextTick in this (as it is used for watch key source transform)
    const rep = transformToken(state, name)
    pushReplacement(rep)
  }
  // want to preserve whitespace so i think strat should be start from text but navigate nodes and then replace
  bfs(n, (c: SyntaxNode) => {
    if (c.type === "this") {
      // look at the next nodes
      // 0: this
      const c1 = c.nextSibling
      const c2 = c1?.nextSibling
      const c3 = c2?.nextSibling
      let member
      if (c1?.type === ".") {
        // this.<key>
        assert(c2, "expected sibling after this.", c1)
        assert(c2.type === "property_identifier", "expected property_identifier after `this.`")
        member = c2.text
        handleThisKey(member, c.startIndex, c2.endIndex, c2)
      } else if (c1?.type === "[" && c2?.type === "string" && c3?.type === "]") {
        // 1: [
        // 2: ' OR "
        // 3: <key>
        // 4: ' OR "
        // 5: ]
        member = c2.text.slice(1, c2.text.length - 1)
        handleThisKey(member, c.startIndex, c3.endIndex, c2)
      } else {
        fail("unsupported this attribute while transforming", c.parent || undefined)
      }
      // collect first arg of this.$emit as well for using.emits
      if (member === "$emit") {
        let foundEmit = false
        let n: SyntaxNode | null = c
        // look up the tree until call_expression
        while (n) {
          if (n.type === "call_expression") {
            for (const c of n.children) {
              if (c.type === "arguments") {
                assert(c.children[0].type === "(", "expected parent after $emit", c)
                assert(c.children[1].type === "string", "expected string as first $emit arg", c)
                state.using.emits.add(c.children[1].text)
                foundEmit = true
              }
            }
            break
          }
          n = n.parent
        }
        assert(foundEmit, "could not find emit to define", c)
      }
    }
  })
  const sortedReplacements = replacements.sort((a, b) => a.startIndex - b.startIndex)
  let ret = ""
  let idx = 0
  for (let i = 0; i < sortedReplacements.length; i++) {
    const r = sortedReplacements[i]
    ret += n.text.substring(idx, r.startIndex) + r.value
    idx = r.endIndex
  }
  ret += n.text.substring(idx)
  return ret
}

function handleComputeds(state: State, n: SyntaxNode, transformPass = true) {
  handleObject(n, {
    onKeyValue(key: string, n: SyntaxNode) {
      if (!transformPass) {
        state.computeds[key] = DISCOVERED
        return
      }
      switch (n.type) {
        case "object":
          // XXX check that just get/set?
          const computedString = transformNode(state, n)
          state.computeds[key] = reindent(computedString, 0)
          break
        default:
          fail(`computed object unexpected key: ${key}`, n)
      }
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      assert(!async, "computed async method unexpected", block) // XXX wrong syntax node
      if (transformPass) {
        const computedString = transformNode(state, block)
        assert(args.text === "()", `computed method has unexpected args: ${args.text}`, args)
        state.computeds[meth] = `() => ${reindent(computedString, 0)}`
      } else {
        state.computeds[meth] = DISCOVERED
      }
    },
  })
}

function handleMethodKeyValue(key: string, n: SyntaxNode) {
  // (async) formal_paramaters => statement_block
  let i = 0
  let async = false
  let args = "()"
  if (n.children[i].type === "async") {
    async = true
    i++
  }
  if (n.children[i].type === "formal_parameters") {
    args = n.children[i].text
    i++
  }
  assert(n.children[i].type === "=>", "expected =>", n.children[i])
  i++
  assert(n.children[i].type === "statement_block", "expected statement block", n.children[i])
  const statement = n.children[i]
  return {
    async,
    args,
    statement,
  }
}

function handleMethods(state: State, n: SyntaxNode, transformPass = true) {
  handleObject(n, {
    onKeyValue(key, n) {
      if (!transformPass) {
        state.methods[key] = DISCOVERED
      } else {
        const { async, args, statement } = handleMethodKeyValue(key, n)
        state.methods[key] = `${async ? 'async ' : ''}function ${key}${args} ${reindent(transformNode(state, statement), 0)}`
      }
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      if (transformPass) {
        state.methods[meth] = `${async ? 'async ' : ''}function ${meth}${args.text} ${reindent(transformNode(state, block), 0)}`
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
                  fail(`unexpected watch value attribute: ${key}`, n)
              }
            },
            onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
              watch.handler = `${async ? 'async ' : ''}${args.text} => ${reindent(transformNode(state, block), 0)}`
            },
          })
          const ds = key.split('.', 2)
          state.watchers[transformToken(state, ds[0]) + (ds[1] ? `.${ds[1]}` : '')] = watch
          break
        default:
          fail(`unexpected watch value type (not method or object): ${n.type}`, n)
      }
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      const watch: WatchConfig = {}
      watch.handler = `${async ? 'async ' : ''}${args.text} => ${reindent(transformNode(state, block), 0)}`
      const ds = meth.split('.', 2)
      state.watchers[transformToken(state, ds[0]) + (ds[1] ? `.${ds[1]}` : '')] = watch
    },
  })
}

function handleDirectives(state: State, n: SyntaxNode, transformPass = true) {
  if (!transformPass) {
    // cannot refer to directives so need to discover them
    return
  }
  // directives: {
  //   a: someDirective, // -> vA
  //   b: { created, ... } // -> vB
  // }
  handleObject(n, {
    onKeyValue(key, n) {
      state.directives[key] = reindent(transformNode(state, n), 0)
    },
    onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
      assert(false, "expected only key-value directives object", n)
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
    case "directives":
      handleDirectives(state, n, transformPass)
      break
    case "emits":
      assert(n.type === "array", "expected emits to be an array", n)
      handleArray(n, c => {
        assert(c.type === "string", "expected emits to be array of simple strings", c)
        state.using.emits.add(c.text)
      })
      break
    case "filters":
      assert(n.type === "object", "expected filters to be an object", n)
      handleObject(n, {
        onKeyValue(key, c) {
          if (!transformPass) {
            state.filters[key] = DISCOVERED
          } else {
            const { async, args, statement } = handleMethodKeyValue(key, c)
            state.filters[key] = `${async ? 'async ' : ''}function ${key}${args} ${reindent(transformNode(state, statement), 0)}`
          }
        },
        onMethod(meth, async, args, block) {
          if (!transformPass) {
            state.filters[meth] = DISCOVERED
          } else {
            state.filters[meth] = `${async ? 'async ' : ''}function ${meth}${args.text} ${reindent(transformNode(state, block), 0)}`
          }
        },
      })
      break
    case "inject":
      if (n.type === "array") {
        handleArray(n, c => {
          assert(c.type === "string", "expected inject to be array of simple strings", c)
          state.using.injects.add(c.text.slice(1, c.text.length - 1))
        })
      } else if (n.type === "object") {
        fail("inject object not supported yet")
      } else {
        fail("expected inject to be an array or object", n)
      }
      break
    case "methods":
      handleMethods(state, n, transformPass)
      break
    case "name":
      // do nothing with this...
      break
    case "props":
      assert(n.type === "object" || n.type === "array", `expected props to be an object or array: ${n.type}`, n)
      handleProps(state, n, transformPass)
      break
    case "provide":
      assert(n.type === "array", "expected provide to be an array", n)
      handleArray(n, c => {
        assert(c.type === "string", "expected provide to be array of simple strings", c)
        state.using.provides.add(c.text.slice(1, c.text.length - 1))
      })
      break
    case "watch":
      handleWatchers(state, n, transformPass)
      break
    default:
      fail(`export default key value not supported: ${key}`, n)
  }
}

function handleDataMethod(state: State, n: SyntaxNode, transformPass = true) {
  for (const c of n.children) {
    switch (c.type) {
      case "{":
      case "}":
      case "comment":
        break
      case "return_statement":
        if (c.children[1]?.type === "object") {
          // simple version, we can just make naked refs
          // input:
          // data() {
          //   return { a: "hi" }
          // }
          // output:
          // const a = ref("hi")
          handleObject(c.children[1], {
            onKeyValue(key: string, n: SyntaxNode) {
              if (transformPass) {
                state.refs[key] = reindent(transformNode(state, n), 0)
              } else {
                state.refs[key] = "<observed>"
              }
            },
            onMethod(meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) {
              fail(`data() return object method key not supported: ${meth}`, block) // XXX wrong syntax node
            },
          })
          break
        }
        /* fall-through */
      default:
        // there might be a premable, we preserve entire function and then assign the returned object to refs in $data
        // input:
        // data() {
        //   console.log("hi")
        //   const ret = {}; ret.yo = "hi"; return ret
        // }
        // output:
        // const $data = Object.entries((() => {
        //   console.log("hi")
        //   const ret = {}; ret.yo = "hi"; return ret
        // })()).reduce((acc, [k, v]) => {
        //   acc[k] = ref(v)
        //   return acc
        // }, {})
        // TODO we need to rewrite template in this case :/
        // we can try to find strings in the method block but it can be fully dynamic :/
        // state.using.$data = n.text
        fail("complex data() not supported", c)
    }
  }
}

function handleDefaultExportMethod(state: State, meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode, transformPass = true) {
  switch (meth) {
    case "data":
      handleDataMethod(state, block, transformPass)
      break
    case "beforeCreate":
    case "created":
      if (transformPass) {
        assert(args.text === "()", `${meth} hook method has unexpected args: ${args.text}`, args)
        assert(block.children[0]?.type === "{", "expected open brace in block", block)
        assert(block.children[2]?.type === "}", "expected close brace in block", block)
        state.hooks[meth] = reindent(transformNode(state, block.children[1]), 0)
      }
      break
    case "beforeMount":
    case "mounted":
    case "beforeUpdate": // XXX arg?
    case "updated": // XXX arg?
    case "beforeDestroy":
    case "destroyed":
      if (transformPass) {
        assert(args.text === "()", `${meth} hook method has unexpected args: ${args.text}`, args)
        assert(block.children[0]?.type === "{", "expected open brace in block", block)
        assert(block.children[block.children.length - 1]?.type === "}", "expected close brace in block", block)
        state.hooks[meth] = `${async ? 'async ' : ''}() => ${reindent(transformNode(state, block), 0)}`
      }
      break
    case "errorCaptured":
      if (transformPass) {
        assert(args.children[0].type === "(", "expected open paren in args", args)
        assert(args.children[2].type === ")", "expected open paren in args", args)
        assert(args.children[1].type === "identifier", "expected identifier in args", args)
        assert(block.children[0]?.type === "{", "expected open brace in block", block)
        assert(block.children[2]?.type === "}", "expected close brace in block", block)
        state.hooks.errorCaptured = `${async ? 'async ' : ''}(${args.children[1].text}: Error) => ${reindent(transformNode(state, block), 0)}`
      }
      break
    case "provide":
      fail("provide() not supported yet")
      break
    default:
      // TODO other hooks destroyed, etc.
      fail(`export default key method not supported: ${meth}`, block) // XXX wrong syntax node
  }
}

type HandleObjectHooks = {
  onKeyValue?: (key: string, n: SyntaxNode) => void
  onMethod?: (meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) => void
}

function handleObject(object: SyntaxNode, hooks: HandleObjectHooks) { // ObjectNode
  for (const c of object.children) {
    if (c.type === "pair") {
      const n = c.children[0]
      let key
      if (n?.type === "property_identifier") {
        key = n.text
      } else if (n?.type === "string") {
        key = n.text.slice(1, -1) // XXX might have to do some harder processing
      }
      assert(key, `pair[0] not supported: ${c.children[0].type}`, c.children[0])
      assert(c.children[1]?.type === ":", `pair[1] not ":": ${c.children[1].type}`, c.children[1])
      assert(c.children[2], "pair has no 3nd child", c)
      hooks.onKeyValue?.(key, c.children[2])
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
          case "computed_property_name":
            // eg. ["test"]() {}
            if (n.children[0]?.type === "[" && n.children[2]?.type === "]" && n.children[1]?.type === "string") {
              meth = n.text.slice(2, -2)
              break
            }
            fail(`unhandled method_definition structure, found: ${n.type}`, n)
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
            fail(`unhandled method_definition structure, found: ${n.type}`, n)
        }
      }
      assert(meth && args && block, "did not find required nodes for method_definition", c) 
      hooks.onMethod?.(meth!, async, args!, block!) // fix ts
    } else if (c.type === "comment") {
      // TODO preserve these -- onComment
    } else if (c.type === "{" || c.type === "," || c.type === "}") {
      // do nothing
    } else {
      fail(`unexpected node found while parsing object: ${c.type}`, c)
    }
  }
}

function handleDefaultExport(state: State, n: SyntaxNode) {
  let transformPass = false
  handleObject(n, {
    onKeyValue: (key: string, n: SyntaxNode) => handleDefaultExportKeyValue(state, key, n, transformPass),
    onMethod: (meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) => 
      handleDefaultExportMethod(state, meth, async, args, block, transformPass),
  })
  transformPass = true
  handleObject(n, {
    onKeyValue: (key: string, n: SyntaxNode) => handleDefaultExportKeyValue(state, key, n, transformPass),
    onMethod: (meth: string, async: boolean, args: SyntaxNode, block: SyntaxNode) => 
      handleDefaultExportMethod(state, meth, async, args, block, transformPass),
  })
}

function maybeHandleDefaultExport(state: State, n: SyntaxNode): boolean {
  let defaultExport = false
  for (const c1 of n.children) {
    if (defaultExport) {
      if (c1.type === "object") {
        handleDefaultExport(state, c1)
        return true
      }
      if (c1.type === "call_expression") {
        const c2 = c1.children[0]
        if (c2.type === "identifier" && c2.text === "defineComponent") {
          const c3 = c1.children[1]
          if (c3.type === "arguments") {
            if (c3.children[0].type === "(" && c3.children[2].type === ")" && c3.children[1].type === "object") {
              handleDefaultExport(state, c3.children[1])
              return true
            }
          }
        }
      }
      fail("unexpected default export", c1)
    }
    if (c1.text === "default") {
      defaultExport = true
    }
  }
  return false
}
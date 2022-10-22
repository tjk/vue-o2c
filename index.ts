// npx tsx optionsToComposition.ts </path/to/file.vue>
import assert from "assert"
import fs from "fs"
import path from "path"
import Parser, { SyntaxNode } from "tree-sitter"
import { typescript } from "tree-sitter-typescript"
import javascript from "tree-sitter-javascript"

type State = {
  importNodes: SyntaxNode[]
  emitsNode?: SyntaxNode // ArrayNode
  props: Record<string, string> // name -> type string
  propDefaultNodes: Record<string, string>
  refs: Record<string, SyntaxNode>
  computeds: Record<string, SyntaxNode>
}

function transform(vuePath: string) {
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
    return
  }

  // XXX handle if js is after start tag or before end tag but no one does this
  const code = lines.slice(scriptStartIdx + 1, scriptEndIdx).join("\n")

  const parser = new Parser()
  if (ts) {
    parser.setLanguage(typescript)
  } else {
    parser.setLanguage(javascript)
  }

  const state: State = {
    importNodes: [],
    props: {},
    propDefaultNodes: {},
    refs: {},
    computeds: {},
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

  console.log(`<script setup lang="ts">`)
  const vueImportsUsed: string[] = []
  if (Object.keys(state.refs).length) {
    vueImportsUsed.push("ref")
  }
  // TODO
  if (vueImportsUsed.length) {
    for (const importNode of state.importNodes) {
      if (importNode.text.match(/'vue'/) || importNode.text.match(/"vue"/)) {
        assert(false, "editing vue import not supported yet")
      }
    }
    console.log(`import { ${vueImportsUsed.join(', ')} } from "vue"`) // TODO check how other imports are written
  }
  for (const importNode of state.importNodes) {
    // TODO look if we already have a vue import and then add whichever features we use
    console.log(importNode.text) 
  }
  if (state.importNodes.length) {
    console.log()
  }
  // TODO if we need props. later (not just template) then set const props =
  if (Object.keys(state.props).length) {
    if (Object.keys(state.propDefaultNodes).length) {
      console.log("withDefaults(defineProps<{")
    } else {
      console.log("defineProps<{")
    }
    for (const k in state.props) {
      console.log(`  ${k}: ${state.props[k]}`)
    }
    if (Object.keys(state.propDefaultNodes).length) {
      console.log("}>(), {")
      for (const k in state.propDefaultNodes) {
        console.log(`  ${k}: ${state.propDefaultNodes[k]},`)
      }
      console.log("})")
    } else {
      console.log("}>()")
    }
    console.log()
  }
  if (state.emitsNode) {
    console.log(`defineEmits(${state.emitsNode.text})`)
    console.log()
  }
  if (Object.keys(state.refs).length) {
    for (const k in state.refs) {
      console.log(`const ${k} = ref(${state.refs[k].text})`) // TODO needs to be fixed
    }
    console.log()
  }
  console.log("</script>")
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

function handleProps(state: State, o: SyntaxNode) { // ObjectNode
  handleObject(o, {
    onKeyValue(propName: string, n: SyntaxNode) {
      switch (n.type) {
        case "identifier":
          // same as { type: ____ } value
          state.props[propName] = handlePropType(n)
          break
        case "object":
          if (n.text === "{}") {
            state.props[propName] = "any" // TODO tag
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
            onMethod(meth: string, async: boolean, n: SyntaxNode) {
              assert(meth === "default", meth)
              // TODO need to lint here, indentation will be broken
              state.propDefaultNodes[propName] = `() => ${n.text}`
            },
          })
          break
        default:
          assert(false, n.children[2].type)
      }
    },
    onMethod(meth: string, async: boolean, n: SyntaxNode) {
      assert(false, meth)
    },
  })
}

// TODO heavy rewriting here!!
// TODO this.x -> props.x or x.value in most cases
function handleComputed(state: State, n: SyntaxNode) {
  assert(false, n.type)
}

function handleDefaultExportKeyValue(state: State, key: string, n: SyntaxNode) {
  switch (key) {
    case "components":
      // we don't need this now! but we should do better and remove/rewrite imports to use components.d.ts
      break
    case "computed":
      handleComputed(state, n)
      break
    case "emits":
      // property_identifier : array
      assert(n.type === "array", n.type)
      state.emitsNode = n
      break
    case "methods":
      // TODO
      break
    case "name":
      // do nothing with this...
      break
    case "props":
      assert(n.type === "object", n.type)
      handleProps(state, n)
      break
    case "watch":
      // TODO
      break
    default:
      assert(false, key)
  }
}

function handleDataMethod(state: State, n: SyntaxNode) { // StatementBlock
  for (const c of n.children) {
    if (c.type === "return_statement") {
      assert(c.children[0].type === "return")
      assert(c.children[1].type === "object")
      handleObject(c.children[1], {
        onKeyValue(key: string, n: SyntaxNode) {
          state.refs[key] = n
        },
        onMethod(meth: string, async: boolean, n: SyntaxNode) {
          assert(false, meth)
        },
      })
      console.log(c.children[1].children)
    }
  }

}

function handleDefaultExportMethod(state: State, meth: string, async: boolean, n: SyntaxNode) { // StatementBlock
  switch (meth) {
    case "data":
      handleDataMethod(state, n)
      break
    case "created":
      // TODO EMIT onCreated or w.e
      break
    default:
      assert(false, meth)
  }
}

type HandleObjectHooks = {
  onKeyValue?: (name: string, n: SyntaxNode) => void
  onMethod?: (name: string, async: boolean, n: SyntaxNode /* StatementBlock */) => void
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
            // TODO may need to emit these
            break
          default:
            assert(false, n.type)
        }
      }
      assert(meth && block) 
      hooks.onMethod?.(meth, async, block)
    } else if (c.type === "comment") {
      // TODO preserve these -- onComment
    } else if (c.type === "{" || c.type === "," || c.type === "}") {
      // do nothing
    } else {
      assert(false, c.text)
    }
  }
}

// TODO pass in state so we can spit out final code at the end
function maybeHandleDefaultExport(state: State, n: SyntaxNode): boolean {
  let defaultExport = false
  for (const c1 of n.children) {
    if (c1.text === "default") {
      defaultExport = true
    }
    if (defaultExport && c1.type === "object") {
      // handle the default export here
      handleObject(c1, {
        onKeyValue(key: string, n: SyntaxNode) {
          handleDefaultExportKeyValue(state, key, n)
        },
        onMethod(meth: string, async: boolean, n: SyntaxNode) {
          handleDefaultExportMethod(state, meth, async, n)
        },
      })
    }
  }
  return defaultExport
}

transform(path.resolve(process.argv[2]))
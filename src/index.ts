import fs from "fs"
import Parser from "tree-sitter"
import javascript from "tree-sitter-javascript"
import typescript from "tree-sitter-typescript"
import { scan, transform as _transform, type State } from "./core"

export function transformPath(sfcPath: string): State {
  const sfc = fs.readFileSync(sfcPath, "utf8")
  return transform(sfc)
}

export function transform(sfc: string): State {
  const state = scan(sfc)
  if (!state.scan.script) {
    return state
  }
  const parser = new Parser()
  parser.setLanguage(state.scan.scriptTs ? typescript : javascript)
  _transform(state, parser)
  return state
}
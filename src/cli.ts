#!/usr/bin/env node
import * as path from "path"
import { transformPath } from "./index"

if (!process.argv[2]) {
  console.error("usage: vue-o2c </path/to/sfc.vue>")
  process.exit(1)
}
try {
  const state = transformPath(path.resolve(process.argv[2]))
  if (!state.transformed) {
    process.exit(1)
  }
  console.log(state.transformed)
} catch (e) {
  console.error(e)
  process.exit(1)
}
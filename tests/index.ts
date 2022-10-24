import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { diffLines } from "diff"
import pc from "picocolors"
import { transformPath } from "../src/index"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename)

function printDiff(from: string, to: string) {
  const diff = diffLines(from, to)
  diff.forEach(part => {
    const color = part.added ? "green" : part.removed ? "red" : "gray"
    const truncated = part.value.replace(/[\t ]*$/, '')
    process.stderr.write(pc[color](truncated))
    if (color === "green" || color === "red") {
      const trailingSpaces = part.value.match(/([\t ]+)$/)
      if (trailingSpaces) {
        const bgColor = `bg${color[0].toUpperCase() + color.substring(1)}`
        process.stderr.write(pc[bgColor](trailingSpaces[1]))
      }
    }
  })
  console.log()
}

function main() {
  let failed = false
  const fixturesPath = path.resolve(__dirname, "./fixtures")
  for (const folder of fs.readdirSync(fixturesPath)) {
    console.log(`- ${folder}`)
    // error.txt or output.vue
    const inputPath = path.join(fixturesPath, folder, "input.vue")
    const outputPath = path.join(fixturesPath, folder, "output.vue")
    if (fs.existsSync(outputPath)) {
      const expected = fs.readFileSync(outputPath, "utf8")
      const state = transformPath(inputPath)
      if (!state.transformed) {
        console.error(pc.red("Not output when there should have been"))
        failed = true
      } else if (state.transformed !== expected) {
        console.log()
        printDiff(state.transformed, expected)
        console.log()
        failed = true
      }
    } else {
      const outputPath = path.join(fixturesPath, folder, "output.vue")
      const expected = fs.readFileSync(outputPath, "utf8")
      let errorStack
      try {
        transformPath(inputPath)
      } catch (e) {
        errorStack = e.stack
      }
      if (errorStack !== expected) {
        console.log()
        printDiff(errorStack, expected)
        console.log()
        failed = true
      }
    }
  }
  if (failed) {
    process.exit(1)
  } else {
    console.log()
    console.log("Tests succeeded!")
  }
}

try {
  main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
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
    let color = part.added ? "green" : part.removed ? "red" : "gray"
    const md = part.value.match(/(\s*)$/)
    let printNewline = true
    if (md) {
      if (md.index) {
        process.stderr.write(pc[color](part.value.substring(0, md.index)))
      }
      if (md[1].length && (color === "green" || color === "red")) {
        printNewline = false
        color = `bg${color[0].toUpperCase() + color.substring(1)}`
        // remove one of the newlines unless whole part is whitespace
        let str = md[1]
        if (!str.match(/\n\n$/) && !part.value.match(/^\s+$/)) {
          str = str.slice(0, str.length - 1)
          printNewline = true
        }
        if (str.length) {
          // \n\n\n will write 4 newlines (with first one not colored)!?!?!?
          str.split("").forEach((s: string) => {
            if (s === "\n") {
              process.stderr.write(pc[color]("\\n"))
              process.stderr.write("\n")
            } else {
              process.stderr.write(pc[color](s))
            }
          })
        }
      }
    }
    if (printNewline) {
      process.stderr.write("\n")
    }
  })
  console.log()
}

function main(str?: string) {
  let failed = false
  const fixturesPath = path.resolve(__dirname, "./fixtures")
  for (const folder of fs.readdirSync(fixturesPath)) {
    if (str && !folder.includes(str)) {
      continue
    }
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
        // /*
        console.log("actual:")
        console.log()
        console.log(`|${pc.red(state.transformed)}|`)
        console.log()
        console.log("expected:")
        console.log()
        console.log(`|${pc.green(expected)}|`)
        console.log()
        // */
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
  main(process.argv[2])
} catch (e) {
  console.error(e)
  process.exit(1)
}
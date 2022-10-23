import cp from "child_process"
import fs from "fs"
import path from "path"

const readmePath = path.resolve(__dirname, "../README.md")
const data = fs.readFileSync(readmePath, "utf8")
const lines = data.split("\n")

let newLines: string[] = []
for (let i = 0; i < lines.length; i++) {
  const md = lines[i].match(/^```[a-z]+ (.*)$/)
  if (md) {
    newLines.push(lines[i])
    do {
      i++
    } while (!lines[i].match(/^```/))
    newLines.push(String(cp.execSync(md[1])))
  }
  newLines.push(lines[i])
}

fs.writeFileSync(readmePath, newLines.join("\n"))
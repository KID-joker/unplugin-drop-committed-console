import path from 'node:path'
import { parse as scriptParse } from './script'
import { parse as vueParse } from './vue'

export function parse(code: string, filePath: string) {
  const [realFilePath] = filePath.split('?')
  const extension = filePath ? path.extname(realFilePath).slice(1) : 'js'
  switch (extension) {
    case 'vue':
      return vueParse(code, realFilePath)
    default: {
      const ast = scriptParse(code, realFilePath)
      return {
        ast,
        loc: ast.loc,
        raw: code,
      }
    }
  }
}

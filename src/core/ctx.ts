import { createFilter } from '@rollup/pluginutils'
import MagicString from 'magic-string'
import type * as ESTree from 'estree'
import type { ConsoleType, Options } from '../types'
import Traverser from './traverser'
import { Status, createGit } from './git'
import { parse } from './parser'

export function createContext(options: Options = {}) {
  const consoleType = options.type || ['log']
  const consoleReference = options.reference || ['console']
  const anyConsole = consoleReference === '*' || !consoleReference.length

  const git = createGit()
  const checkRepoTask = git.checkIsRepo()

  const filter = createFilter(
    options.include || [/\.[jt]sx?$/, /\.astro$/, /\.vue$/, /\.vue\?vue/, /\.svelte$/],
    options.exclude || [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/],
  )

  async function transform(code: string, id: string) {
    const isRepo = await checkRepoTask
    if (!isRepo)
      return code

    const status = await git.getStatus(id)

    if (status && (!options.strict || ![Status.BOTH_MODIFIED, Status.INDEX_MODIFIED, Status.MODIFIED].includes(status)))
      return code

    const source = new MagicString(code)
    const diff = status ? await git.getDiff(id) : []
    const diffLines = diff.map(hunk => Array.from(hunk.lines.keys())).flat()

    const parseResult = await parse(code, id)
    Traverser.traverse(parseResult.ast, {
      enter(node: ESTree.Node) {
        if (node.type === 'CallExpression') {
          const { loc, callee, range } = node
          if (!loc || !range)
            return
          if (diffLines.length) {
            const startLine = loc.start.line
            const endLine = loc.end.line
            for (let i = startLine; i <= endLine; i++) {
              if (diffLines.includes(i))
                return
            }
          }

          let isConsoleCall = false
          if (callee.type === 'Identifier') {
            isConsoleCall = anyConsole && consoleType.includes(callee.name as ConsoleType)
          }
          if (callee.type === 'MemberExpression') {
            isConsoleCall = (anyConsole || consoleReference.includes((callee.object as ESTree.Identifier).name)) && consoleType.includes((callee.property as ESTree.Identifier).name as ConsoleType)
          }
          if (isConsoleCall) {
            const [start, end] = range
            source.remove(start, end)
          }
        }
      },
    })

    return source.toString()
  }

  return {
    filter,
    transform,
  }
}

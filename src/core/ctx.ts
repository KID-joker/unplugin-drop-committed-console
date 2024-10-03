import { createFilter } from '@rollup/pluginutils'
import MagicString from 'magic-string'
import type { NodePath } from '@babel/traverse'
import _traverse from '@babel/traverse'
import type { CallExpression, Identifier } from '@babel/types'
import type { ConsoleType, Options } from '../types'
import { Status, createGit, uncommitted } from './git'
import { parse } from './parser'

// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
const traverse = (_traverse.default as typeof _traverse) ?? _traverse

export function createContext(options: Options = {}) {
  const scope = options.scope || 'file'
  const consoleType = options.type || ['log']
  const consoleReference = options.reference || ['console']
  const anyConsole = consoleReference === '*' || !consoleReference.length

  const git = createGit()
  const checkRepoTask = git.checkIsRepo()
  const userTask = git.getCurrentUser()

  const filter = createFilter(
    options.include || [/\.[jt]sx?$/, /\.vue$/, /\.vue\?vue/],
    options.exclude || [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/],
  )

  async function transform(code: string, id: string) {
    const isRepo = await checkRepoTask
    if (!isRepo)
      return code

    const path = id.replace(/\\/g, '/')
    const filePath = path.split('?')[0]

    const ignore = await git.checkIsIgnore(filePath)
    if (ignore)
      return code

    const status = await git.getStatus(filePath)

    if (scope === 'file' && status && [Status.BOTH_MODIFIED, Status.INDEX_MODIFIED, Status.MODIFIED].includes(status))
      return code

    const { ast, loc: scriptLoc, raw } = await parse(code, path)
    const blames = await git.getBlame(filePath, scriptLoc.start.line, scriptLoc.end.line)
    const userName = await userTask
    const rawIdx = code.indexOf(raw)
    const source = new MagicString(code)
    traverse(ast, {
      CallExpression(path: NodePath) {
        const { callee, loc: nodeLoc } = path.node as CallExpression

        let isConsoleCall = false
        if (callee.type === 'Identifier') {
          isConsoleCall = anyConsole && consoleType.includes(callee.name as ConsoleType)
        }
        if (callee.type === 'MemberExpression') {
          isConsoleCall = (anyConsole || consoleReference.includes((callee.object as Identifier).name)) && consoleType.includes((callee.property as Identifier).name as ConsoleType)
        }

        if (isConsoleCall) {
          const { start, end } = nodeLoc!
          const [realStart, realEnd] = [start.index, end.index].map(pos => pos + rawIdx)

          if (['strict', 'user'].includes(scope)) {
            const startLine = start.line + scriptLoc.start.line - 1
            const endLine = end.line + scriptLoc.start.line - 1
            for (let i = startLine; i <= endLine; i++) {
              const blame = blames.get(i)
              if (blame?.commit === uncommitted || (scope === 'user' && blame?.author === userName)) {
                return
              }
            }
          }

          source.remove(realStart, realEnd)
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

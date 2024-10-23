import { createFilter } from '@rollup/pluginutils'
import MagicString from 'magic-string'
import type { NodePath } from '@babel/traverse'
import _traverse from '@babel/traverse'
import type { CallExpression, Identifier } from '@babel/types'
import { parse as babelParse } from '@babel/parser'
import { type EncodedSourceMap, TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import type { ConsoleType, Options } from '../types'
import { Status, createGit, uncommitted } from './git'
import { cleanUrl } from './utils'

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
  const userNameTask = git.getCurrentConfig('user.name')
  const userEmailTask = git.getCurrentConfig('user.email')

  const filter = createFilter(
    options.include || [/\.[jt]sx?$/, /\.vue$/, /\.vue\?vue/, /\.svelte$/],
    options.exclude || [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/],
  )

  async function transform(code: string, id: string, sourceMap: EncodedSourceMap | undefined) {
    if (!sourceMap || (!('version' in sourceMap) && (sourceMap as EncodedSourceMap).mappings === ''))
      return code

    if (!consoleType.length || !consoleType.some(type => code.includes(type)))
      return code

    const isRepo = await checkRepoTask
    if (!isRepo)
      return code

    const fileName = cleanUrl(id)

    const ignore = await git.checkIsIgnore(fileName)
    if (ignore)
      return code

    const status = await git.getStatus(fileName)

    if (status && (scope === 'file' || ![Status.BOTH_MODIFIED, Status.INDEX_MODIFIED, Status.MODIFIED].includes(status)))
      return code

    const ast = babelParse(code, { sourceType: 'module' })
    const traced = new TraceMap(sourceMap as any)
    const consoleNodeList: any[] = []
    traverse(ast, {
      CallExpression(path: NodePath) {
        const { callee, loc } = path.node as CallExpression

        let isConsoleCall = false
        if (callee.type === 'Identifier') {
          isConsoleCall = anyConsole && consoleType.includes(callee.name as ConsoleType)
        }
        if (callee.type === 'MemberExpression') {
          isConsoleCall = (anyConsole || consoleReference.includes((callee.object as Identifier).name)) && consoleType.includes((callee.property as Identifier).name as ConsoleType)
        }

        if (isConsoleCall) {
          const { start, end } = loc!
          const originalStart = originalPositionFor(traced, {
            line: Number(start.line),
            column: Number(start.column),
          })
          const originalEnd = originalPositionFor(traced, {
            line: Number(end.line),
            column: Number(end.column),
          })

          if (!originalStart.line || !originalEnd.line)
            return

          consoleNodeList.push({
            start,
            end,
            originalStart,
            originalEnd,
          })
        }
      },
    })

    if (!consoleNodeList.length)
      return code

    const source = new MagicString(code)
    const userName = await userNameTask
    const userEmail = await userEmailTask

    for (const { start, end, originalStart, originalEnd } of consoleNodeList) {
      const startLine = originalStart.line
      const endLine = originalEnd.line
      let shouldReplace = true
      for (let i = startLine; i <= endLine; i++) {
        const blame = await git.getBlame(fileName, i)
        if (!blame || blame.sha === uncommitted || (scope === 'user' && ((blame.authorEmail && userEmail && blame.authorEmail === userEmail) || blame.author === userName))) {
          shouldReplace = false
          break
        }
      }

      if (shouldReplace)
        source.overwrite(start.index, end.index, 'void 0')
    }

    return {
      code: source.toString(),
      map: source.generateMap({ source: id, includeContent: true, hires: true }),
    }
  }

  return {
    filter,
    transform,
  }
}

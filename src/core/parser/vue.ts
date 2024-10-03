import { tryRequire } from '../../utils'
import { parse as scriptParse } from './script'

export function parse(source: string, filePath: string) {
  const vueMeta = tryRequire('vue/package.json')
  const compiler = tryRequire('vue/compiler-sfc')

  const { descriptor } = vueMeta.version.split('.')[0] >= 3 ? compiler.parse(source) : compiler.parse({ source })
  const script = descriptor.scriptSetup || descriptor.script
  const { loc } = script
  return {
    ast: scriptParse(loc.source, filePath),
    loc,
    raw: loc.source,
  }
}

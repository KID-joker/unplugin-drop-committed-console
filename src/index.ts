import type { UnpluginBuildContext, UnpluginContext, UnpluginFactory } from 'unplugin'
import { createUnplugin } from 'unplugin'
import type { EncodedSourceMap } from '@jridgewell/trace-mapping'
import type { Options } from './types'
import { createContext } from './core/ctx'

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options) => {
  const ctx = createContext(options)
  return {
    name: 'unplugin-drop-committed-console',
    enforce: 'post',
    transformInclude(id) {
      return ctx.filter(id)
    },
    async transform(code, id) {
      const that = this as UnpluginBuildContext & UnpluginContext & { getCombinedSourcemap?: () => EncodedSourceMap }
      if (typeof that.getCombinedSourcemap === 'function') {
        const combinedMap = that.getCombinedSourcemap()
        return await ctx.transform(code, id, combinedMap)
      } else {
        return code
      }
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin

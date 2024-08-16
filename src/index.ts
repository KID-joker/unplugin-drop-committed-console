import type { UnpluginFactory } from 'unplugin'
import { createUnplugin } from 'unplugin'
import type { Options } from './types'
import { createContext } from './core/ctx'

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options) => {
  const ctx = createContext(options)
  return {
    name: 'unplugin-drop-committed-console',
    enforce: 'pre',
    transformInclude(id) {
      return ctx.filter(id)
    },
    async transform(code, id) {
      return ctx.transform(code, id)
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin

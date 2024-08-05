import type { FilterPattern } from '@rollup/pluginutils'

export interface Options {
  /**
   * Only keep uncommitted consoles in the changed files.
   * If false, keep all consoles.
   */
  strict?: boolean

  /**
   * Remove console type of these module.
   * @default ['log']
   */
  type?: Array<'assert' | 'debug' | 'dir' | 'error' | 'info' | 'log' | 'table' | 'warn'>

  /**
   * Rules to exclude transforming target.
   * @default [/node_modules/, /\.git/]
   */
  exclude?: FilterPattern
}

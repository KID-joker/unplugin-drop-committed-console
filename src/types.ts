import type { FilterPattern } from '@rollup/pluginutils'

export type ConsoleType = 'assert' | 'debug' | 'dir' | 'error' | 'info' | 'log' | 'table' | 'warn'

export interface Options {
  /**
   * The scope of removing uncommitted consoles
   * options: ['strict', 'file', 'user']
   * @default 'user'
   */
  scope?: string

  /**
   * Remove console type of these module.
   * @default ['log']
   */
  type?: Array<ConsoleType>

  /**
   * The object provides access to the debugging console.
   * The array is empty or set to "*", indicating that the reference object is not determined.
   * @default ['console']
   */
  reference?: Array<string> | '*'

  /**
   * Rules to include transforming target.
   * @default [/\.[jt]sx?$/, /\.vue$/, /\.vue\?vue/, /\.svelte$/]
   */
  include?: FilterPattern

  /**
   * Rules to exclude transforming target.
   * @default [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/]
   */
  exclude?: FilterPattern
}

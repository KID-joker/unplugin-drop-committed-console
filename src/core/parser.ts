import path from 'node:path'
import tsParser from '@typescript-eslint/parser'
import { tryImportPkg } from '../utils/import-pkg'

export async function parse(code: string, filePath: string) {
  const extension = path.extname(filePath.split('?')[0]).slice(1)
  const parser = ['astro', 'svelte', 'vue'].includes(extension) ? await tryImportPkg(`${extension}-eslint-parser`) : tsParser

  const options = {
    sourceType: 'module',
    parser: tsParser,
    ecmaFeatures: {
      globalReturn: false,
      impliedStrict: false,
      jsx: true,
    },
  }
  switch (extension) {
    case 'astro':
      break
    case 'svelte':
      Object.assign(options, {
        svelteFeatures: {
          runes: false,
          experimentalGenerics: false,
        },
      })
      break
    case 'vue':
      Object.assign(options, {
        vueFeatures: {
          interpolationAsNonHTML: false,
          filter: false,
          styleCSSVariableInjection: false,
        },
      })
  }

  return parser.parseForESLint(code, options)
}

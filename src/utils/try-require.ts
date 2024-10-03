import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const importMetaUrl = pathToFileURL(__filename || fileURLToPath(import.meta.url)).href

const _require = createRequire(importMetaUrl)

export function tryRequire(id: string, from?: string) {
  try {
    return from
      ? _require(_require.resolve(id, { paths: [from] }))
      : _require(id)
  } catch {}
}

import { parse as babelParse } from '@babel/parser'

export function parse(source: string, filePath: string) {
  return babelParse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'], sourceFilename: filePath })
}

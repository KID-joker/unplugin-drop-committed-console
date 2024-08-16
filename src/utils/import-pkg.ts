import { isPackageExists } from 'local-pkg'
import { tryInstallPkg } from './install-pkg'

export async function tryImportPkg(name: string) {
  if (!isPackageExists(name)) {
    await tryInstallPkg(name)
  }

  return import(name)
}

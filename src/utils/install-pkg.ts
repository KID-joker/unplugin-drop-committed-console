// reference https://github.com/iconify/iconify/blob/main/packages/utils/src/loader/install-pkg.ts

import { installPackage } from '@antfu/install-pkg'

function sleep(ms: number) {
  return new Promise<void>(resolve =>
    setTimeout(async () => {
      resolve()
    }, ms),
  )
}

let pending: Promise<void> | undefined
const tasks: Record<string, Promise<void> | undefined> = {}

export async function tryInstallPkg(name: string) {
  if (pending)
    await pending

  if (!tasks[name]) {
    tasks[name] = pending = installPackage(name, { dev: true, preferOffline: true, silent: true })
      .then(() => sleep(300))
      .finally(() => {
        pending = undefined
      })
  }

  return tasks[name]!
}

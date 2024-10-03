// reference https://github.com/gitkraken/vscode-gitlens

import * as process from 'node:process'
import path from 'node:path'
import { exec, execFile, spawn } from 'node:child_process'
import type { ExecFileException } from 'node:child_process'
import type { Buffer } from 'node:buffer'
import which from 'which'
import { getLines } from '../utils'

export enum Status {
  INDEX_MODIFIED,
  INDEX_ADDED,
  INDEX_DELETED,
  INDEX_RENAMED,
  INDEX_COPIED,

  MODIFIED,
  DELETED,
  UNTRACKED,
  IGNORED,
  INTENT_TO_ADD,
  INTENT_TO_RENAME,
  TYPE_CHANGED,

  ADDED_BY_US,
  ADDED_BY_THEM,
  DELETED_BY_US,
  DELETED_BY_THEM,
  BOTH_ADDED,
  BOTH_DELETED,
  BOTH_MODIFIED,
}

export interface GitBlameLine {
  readonly author?: string
  readonly commit: string
  readonly line: number
}

export const uncommitted = '0000000000000000000000000000000000000000'

function findSpecificGit(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const buffers: Buffer[] = []
    const child = spawn(path, ['--version'])
    child.stdout.on('data', (b: Buffer) => buffers.push(b))
    child.on('error', reject)
    child.on('close', code => (code ? reject(new Error(`Not found. Code: ${code}`)) : resolve(path)))
  })
}

function findGitDarwin(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    exec('which git', (err, gitPathBuffer) => {
      if (err) {
        return reject(new Error(`Executing "which git" failed: ${err.message}`))
      }

      const path = gitPathBuffer.toString().trim()

      if (path !== '/usr/bin/git') {
        return resolve(path)
      }

      // must check if XCode is installed
      exec('xcode-select -p', (err: any) => {
        if (err && err.code === 2) {
          // git is not installed, and launching /usr/bin/git
          // will prompt the user to install it

          return reject(new Error('Executing "xcode-select -p" failed with error code 2.'))
        }

        resolve(path)
      })
    })
  })
}

function findSystemGitWin32(base: string): Promise<string> {
  if (!base) {
    return Promise.reject<string>(new Error('Not found'))
  }

  return findSpecificGit(path.join(base, 'Git', 'cmd', 'git.exe'))
}

async function findGitWin32InPath(): Promise<string> {
  const path = await which('git.exe')
  return findSpecificGit(path)
}

function findGitWin32(): Promise<string> {
  return findSystemGitWin32(process.env.ProgramW6432 as string)
    .then(undefined, () => findSystemGitWin32(process.env['ProgramFiles(x86)'] as string))
    .then(undefined, () => findSystemGitWin32(process.env.ProgramFiles as string))
    .then(undefined, () => findSystemGitWin32(path.join(process.env.LocalAppData as string, 'Programs')))
    .then(undefined, () => findGitWin32InPath())
}

async function findGit(): Promise<string> {
  try {
    switch (process.platform) {
      case 'darwin':
        return await findGitDarwin()
      case 'win32':
        return await findGitWin32()
      default:
        return await findSpecificGit('git')
    }
  } catch (err: any) {
    // noop
    console.warn(`Unable to find git. Error: ${err.message}`)
  }

  throw new Error('Git installation not found.')
}

function run(command: string, args: any[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8' }, (error: ExecFileException | null, stdout: string, stderr: string) => {
      if (error != null) {
        reject(error)

        return
      }

      if (stderr) {
        console.warn(`Warning(${command} ${args.join(' ')}): ${stderr}`)
      }

      resolve(stdout)
    })
  })
}
function runGit(args: any[]) {
  return findGit().then((path: string) => run(path, args))
}

function parseStatus(raw: { x: string, y: string }) {
  switch (raw.x + raw.y) {
    case '??': return Status.UNTRACKED
    case '!!': return Status.IGNORED
    case 'DD': return Status.BOTH_DELETED
    case 'AU': return Status.ADDED_BY_US
    case 'UD': return Status.DELETED_BY_THEM
    case 'UA': return Status.ADDED_BY_THEM
    case 'DU': return Status.DELETED_BY_US
    case 'AA': return Status.BOTH_ADDED
    case 'UU': return Status.BOTH_MODIFIED
  }

  switch (raw.x) {
    case 'M': return Status.INDEX_MODIFIED
    case 'A': return Status.INDEX_ADDED
    case 'D': return Status.INDEX_DELETED
    case 'R': return Status.INDEX_RENAMED
    case 'C': return Status.INDEX_COPIED
  }

  switch (raw.y) {
    case 'M': return Status.MODIFIED
    case 'D': return Status.DELETED
    case 'A': return Status.INTENT_TO_ADD
    case 'R': return Status.INTENT_TO_RENAME
    case 'T': return Status.TYPE_CHANGED
  }

  return undefined
}

const blameRegex = /[\d-]+ [\d:]+ [+\-\d]+\s+(\d+)\)/
function parseBlame(data: string): Map<number, GitBlameLine> {
  if (!data)
    return new Map()

  const blames = new Map<number, GitBlameLine>()

  for (const lineData of getLines(data)) {
    const match = lineData.raw.match(blameRegex)
    if (match) {
      const commit_author = lineData.raw.slice(0, match.index)
      const index = commit_author.indexOf(' (')
      const commit = commit_author.slice(0, index)
      const author = commit_author.slice(index + 2)
      const lineStr = match[1]
      const line = Number.parseInt(lineStr, 10)
      blames.set(line, {
        author: author.trim(),
        commit,
        line,
      })
    }
  }
  return blames
}

export function createGit() {
  function checkIsRepo(): Promise<boolean> {
    return runGit(['rev-parse', '--is-inside-work-tree'])
      .then((text: string) => text.trim() === 'true')
  }

  function checkIsIgnore(path: string): Promise<boolean> {
    return runGit(['check-ignore', path]).then((text: string) => !!text.trim()).catch(() => false)
  }

  function getCurrentUser(): Promise<string> {
    return runGit(['config', '--get', 'user.name']).then((text: string) => text.trim())
  }

  async function getStatus(path: string): Promise<Status | undefined> {
    const args = ['status', '-z', '-uall', path]
    const data = await runGit(args).then((text: string) => ({ x: text.charAt(0), y: text.charAt(1) }))
    return parseStatus(data)
  }

  async function getBlame(path: string, startLine?: number, endLine?: number): Promise<Map<number, GitBlameLine>> {
    const args = ['blame', '--root', '-l']
    if (startLine != null && endLine != null) {
      args.push(`-L ${startLine},${endLine}`)
    }
    args.push('--', path)
    const data = await runGit(args)
    return parseBlame(data)
  }

  return {
    checkIsRepo,
    checkIsIgnore,
    getCurrentUser,
    getStatus,
    getBlame,
  }
}

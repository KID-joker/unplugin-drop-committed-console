// reference https://github.com/gitkraken/vscode-gitlens

import * as process from 'node:process'
import * as path from 'node:path'
import { exec, execFile, spawn } from 'node:child_process'
import type { ExecFileException } from 'node:child_process'
import type { Buffer } from 'node:buffer'
import which from 'which'

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

interface GitDiffHunkLine {
  current: string | undefined
  previous: string | undefined
  state: 'added' | 'changed' | 'removed' | 'unchanged'
}
interface GitDiffHunk {
  readonly contents: string
  readonly current: {
    readonly count: number
    readonly position: { readonly start: number, readonly end: number }
  }
  readonly previous: {
    readonly count: number
    readonly position: { readonly start: number, readonly end: number }
  }
  readonly lines: Map<number, GitDiffHunkLine>
}

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

function parseHunkHeaderPart(headerPart: string) {
  const [startS, countS] = headerPart.split(',')
  const start = Number(startS)
  const count = Number(countS) || 1
  return { count, position: { start, end: start + count - 1 } }
}

function parseDiff(data: string): GitDiffHunk[] {
  if (!data)
    return []

  const hunks: GitDiffHunk[] = []

  const lines = data.split('\n')

  // Skip header
  let i = -1
  while (++i < lines.length) {
    if (lines[i].startsWith('@@')) {
      break
    }
  }

  // Parse hunks
  let line
  while (i < lines.length) {
    line = lines[i]
    if (!line.startsWith('@@')) {
      i++
      continue
    }

    const header = line.split('@@')[1].trim()
    const [previousHeaderPart, currentHeaderPart] = header.split(' ')

    const current = parseHunkHeaderPart(currentHeaderPart.slice(1))
    const previous = parseHunkHeaderPart(previousHeaderPart.slice(1))

    const hunkLines = new Map<number, GitDiffHunkLine>()
    let fileLineNumber = current.position.start

    line = lines[++i]
    const contentStartLine = i

    // Parse hunks lines
    while (i < lines.length && !line.startsWith('@@')) {
      switch (line[0]) {
        // deleted
        case '-': {
          let deletedLineNumber = fileLineNumber
          while (line?.startsWith('-')) {
            hunkLines.set(deletedLineNumber++, {
              current: undefined,
              previous: line.slice(1),
              state: 'removed',
            })
            line = lines[++i]
          }

          if (line?.startsWith('+')) {
            let addedLineNumber = fileLineNumber
            while (line?.startsWith('+')) {
              const hunkLine = hunkLines.get(addedLineNumber)
              if (hunkLine != null) {
                hunkLine.current = line.slice(1)
                hunkLine.state = 'changed'
              } else {
                hunkLines.set(addedLineNumber, {
                  current: line.slice(1),
                  previous: undefined,
                  state: 'added',
                })
              }
              addedLineNumber++
              line = lines[++i]
            }
            fileLineNumber = addedLineNumber
          } else {
            fileLineNumber = deletedLineNumber
          }
          break
        }
        // added
        case '+':
          hunkLines.set(fileLineNumber++, {
            current: line.slice(1),
            previous: undefined,
            state: 'added',
          })

          line = lines[++i]
          break

          // unchanged (context)
        case ' ':
          hunkLines.set(fileLineNumber++, {
            current: line.slice(1),
            previous: line.slice(1),
            state: 'unchanged',
          })

          line = lines[++i]
          break

        default:
          line = lines[++i]
          break
      }
    }

    const hunk: GitDiffHunk = {
      contents: `${lines.slice(contentStartLine, i).join('\n')}\n`,
      current,
      previous,
      lines: hunkLines,
    }

    hunks.push(hunk)
  }

  return hunks
}

export function createGit() {
  function checkIsRepo(): Promise<boolean> {
    return runGit(['rev-parse', '--is-inside-work-tree'])
      .then((text: string) => text.trim() === 'true')
  }

  async function getStatus(path: string): Promise<Status | undefined> {
    const args = ['status', '-z', '-uall', path]
    const data = await runGit(args).then((text: string) => ({ x: text.charAt(0), y: text.charAt(1) }))
    return parseStatus(data)
  }

  async function getDiff(path: string) {
    const args = ['diff', '--no-ext-diff', '--minimal', '-U0', '--diff-filter=M', '--', path]
    const data = await runGit(args)
    return parseDiff(data)
  }

  return {
    checkIsRepo,
    getStatus,
    getDiff,
  }
}

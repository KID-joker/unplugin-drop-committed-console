export function* getLines(data: string | string[], char: string = '\n'): IterableIterator<string> {
  if (typeof data === 'string') {
    let i = 0
    while (i < data.length) {
      let j = data.indexOf(char, i)
      if (j === -1) {
        j = data.length
      } else {
        j += 1
      }

      yield data.substring(i, j)
      i = j
    }

    return
  }

  let count = 0
  let leftover: string | undefined
  for (let s of data) {
    count++
    if (leftover) {
      s = leftover + s
      leftover = undefined
    }

    let i = 0
    while (i < s.length) {
      let j = s.indexOf(char, i)
      if (j === -1) {
        if (count === data.length) {
          j = s.length
        } else {
          leftover = s.substring(i)
          break
        }
      }

      yield s.substring(i, j)
      i = j + 1
    }
  }
}

export function cleanUrl(url: string): string {
  return url.replace(/[?#].*$/, '')
}

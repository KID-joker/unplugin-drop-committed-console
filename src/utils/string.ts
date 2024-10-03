interface loc {
  start: number
  end: number
  line: number
  raw: string
}

export function* getLines(data: string | string[], char: string = '\n'): IterableIterator<loc> {
  if (typeof data === 'string') {
    let i = 0
    let line = 1
    while (i < data.length) {
      let j = data.indexOf(char, i)
      if (j === -1) {
        j = data.length
      } else {
        j += 1
      }

      yield {
        start: i,
        end: j - 1,
        line,
        raw: data.substring(i, j),
      }
      i = j
      line++
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
    let line = 1
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

      yield {
        start: i,
        end: j,
        line,
        raw: s.substring(i, j),
      }
      i = j + 1
      line++
    }
  }
}

export function getLineBySpan(lines: Array<loc>, span: number) {
  let left = 0
  let right = lines.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const { start, end, line } = lines[mid]

    if (span >= start && span <= end) {
      return line
    } else if (span < start) {
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  return -1
}

import { type Lyric, type Metadata, parseLrc, parseTime, timestamp, uid } from './lrc'

const metadataTag = /^\[(?:ti|ar|al|offset|[a-z]+):.*\]$/i
const timeTags = /^(?:\[\d+:[0-5]\d(?:[.:]\d{1,3})?\])+/
export function editorSource(lyrics: Lyric[], metadata: Metadata) {
  const clean = (value: string) => value.replace(/[\r\n[\]]/g, '')
  const tags = (
    [
      ['ti', metadata.title],
      ['ar', metadata.artist],
      ['al', metadata.album],
    ] as const
  )
    .filter(([, value]) => value)
    .map(([key, value]) => `[${key}:${clean(value)}]`)
  if (metadata.offset) tags.push(`[offset:${Math.round(metadata.offset)}]`)
  return [
    ...tags,
    ...lyrics.map((line) => `${line.time === null ? '' : `[${timestamp(line.time)}]`}${line.text}`),
  ].join('\n')
}
export function parseEditor(source: string) {
  const { metadata } = parseLrc(source)
  const lyrics: Lyric[] = []
  const rows: { start: number; end: number; indices: number[]; tag: boolean }[] = []
  let start = 0
  const lines = source === '' ? [] : source.split('\n')
  for (const text of lines) {
    const tag = metadataTag.test(text)
    const indices: number[] = []
    if (!tag) {
      const parsed = parseLrc(text).lyrics
      for (const lyric of parsed.length ? parsed : [{ id: uid(), time: null, text }]) {
        indices.push(lyrics.length)
        lyrics.push(lyric)
      }
    }
    rows.push({ start, end: start + text.length, indices, tag })
    start += text.length + 1
  }
  return { lyrics, metadata, rows }
}
export function cursorRow(source: string, cursor: number) {
  return source.slice(0, cursor).split('\n').length - 1
}
export function stampEditor(source: string, cursor: number, seconds: number, advance: boolean) {
  const parsed = parseEditor(source)
  const rowIndex = cursorRow(source, cursor)
  const row = parsed.rows[rowIndex]
  if (!row || row.tag) return null
  const lines = source.split('\n')
  const previousPrefix = lines[rowIndex].match(timeTags)?.[0] || ''
  const prefix = `[${timestamp(seconds)}]`
  lines[rowIndex] = prefix + lines[rowIndex].slice(previousPrefix.length)
  const text = lines.join('\n')
  const nextRows = parseEditor(text).rows
  const nextIndex = advance ? nextRows.findIndex((r, i) => i > rowIndex && !r.tag) : -1
  const nextRow = nextRows[nextIndex >= 0 ? nextIndex : rowIndex]
  const position =
    nextIndex >= 0
      ? nextRow.start + (lines[nextIndex].match(timeTags)?.[0].length || 0)
      : row.start +
        Math.max(prefix.length, cursor - row.start + prefix.length - previousPrefix.length)
  return { source: text, cursor: Math.min(position, nextRow.end) }
}

export function adjustEditor(source: string, cursor: number, delta: number) {
  if (!Number.isFinite(delta)) return null
  const lines = source.split('\n')
  const rowIndex = cursorRow(source, cursor)
  const line = lines[rowIndex]
  if (line === undefined || metadataTag.test(line)) return null
  const oldPrefix = line.match(timeTags)?.[0]
  if (!oldPrefix) return null
  const prefix = oldPrefix.replace(
    /\[([^\]]+)\]/g,
    (_, value: string) => `[${timestamp(Math.max(0, (parseTime(value) || 0) + delta))}]`,
  )
  lines[rowIndex] = prefix + line.slice(oldPrefix.length)
  const start = lines.slice(0, rowIndex).reduce((sum, text) => sum + text.length + 1, 0)
  const position = Math.min(
    start + lines[rowIndex].length,
    Math.max(start, cursor + prefix.length - oldPrefix.length),
  )
  return { source: lines.join('\n'), cursor: position }
}

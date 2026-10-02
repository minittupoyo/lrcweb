export type Lyric = { id: string; time: number | null; text: string }
export type Metadata = { title: string; artist: string; album: string; offset: number }
export const uid = () => crypto.randomUUID()
export function timestamp(seconds: number) {
  const centiseconds = Math.round(Math.max(0, seconds) * 100)
  return `${String(Math.floor(centiseconds / 6000)).padStart(2, '0')}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`
}
export function parseTime(value: string): number | null {
  const match = value.trim().match(/^(\d+):([0-5]\d)(?:[.:](\d{1,3}))?$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || '0'}`)
}
export function parseLrc(source: string): { lyrics: Lyric[]; metadata: Metadata } {
  const metadata: Metadata = { title: '', artist: '', album: '', offset: 0 }
  const lyrics: Lyric[] = []
  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const tag = line.match(/^\[(ti|ar|al|offset):(.*)\]$/)
    if (tag) {
      if (tag[1] === 'offset') metadata.offset = Number(tag[2]) || 0
      else
        metadata[
          ({ ti: 'title', ar: 'artist', al: 'album' } as const)[tag[1] as 'ti' | 'ar' | 'al']
        ] = tag[2]
      continue
    }
    const times = [...line.matchAll(/\[(\d+:[0-5]\d(?:[.:]\d{1,3})?)\]/g)]
    if (times.length) {
      const text = line.replace(/\[\d+:[0-5]\d(?:[.:]\d{1,3})?\]/g, '')
      for (const t of times) lyrics.push({ id: uid(), time: parseTime(t[1]), text })
    } else if (line.trim() && !/^\[[a-z]+:.*\]$/i.test(line))
      lyrics.push({ id: uid(), time: null, text: line })
  }
  return { lyrics, metadata }
}
export function exportLrc(lyrics: Lyric[], metadata: Metadata) {
  const clean = (s: string) => s.replace(/[\r\n[\]]/g, '')
  const tags = [
    ['ti', metadata.title],
    ['ar', metadata.artist],
    ['al', metadata.album],
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `[${key}:${clean(value as string)}]`)
  if (metadata.offset) tags.push(`[offset:${Math.round(metadata.offset)}]`)
  return [
    ...tags,
    '',
    ...lyrics
      .filter((l) => l.time !== null)
      .sort((a, b) => a.time! - b.time!)
      .map((l) => `[${timestamp(l.time!)}]${l.text.replace(/[\r\n]/g, ' ')}`),
  ].join('\n')
}

// Keep timestamps on unchanged lines, including after inserting/removing lines.
export function updatePlainLyrics(lyrics: Lyric[], text: string): Lyric[] {
  const lines = text === '' ? [] : text.replace(/\r\n?/g, '\n').split('\n')
  let prefix = 0
  while (prefix < lyrics.length && prefix < lines.length && lyrics[prefix].text === lines[prefix])
    prefix++
  let suffix = 0
  while (
    suffix < lyrics.length - prefix &&
    suffix < lines.length - prefix &&
    lyrics[lyrics.length - 1 - suffix].text === lines[lines.length - 1 - suffix]
  )
    suffix++
  const oldMiddle = lyrics.slice(prefix, lyrics.length - suffix)
  const middle = lines.slice(prefix, lines.length - suffix)
  return [
    ...lyrics.slice(0, prefix),
    ...middle.map((line, i) =>
      oldMiddle.length === middle.length
        ? { ...oldMiddle[i], text: line }
        : { id: uid(), time: null, text: line },
    ),
    ...lyrics.slice(lyrics.length - suffix),
  ]
}

import { editorSource } from './editor'
import { type Lyric, type Metadata, parseLrc, uid } from './lrc'
export type LrclibRecord = {
  id: number
  trackName: string
  artistName: string
  albumName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}
export class LrclibError extends Error {
  constructor(
    message: string,
    public retryAt = 0,
  ) {
    super(message)
  }
}
export function retryAfter(value: string | null, now = Date.now()) {
  const seconds = value === null ? NaN : Number(value)
  if (Number.isFinite(seconds)) return now + Math.max(1, seconds) * 1000
  const date = value ? Date.parse(value) : NaN
  return Number.isFinite(date) ? Math.max(now + 1000, date) : now + 30000
}
export async function searchLrclib(
  track: string,
  artist: string,
  signal: AbortSignal,
): Promise<LrclibRecord[]> {
  const params = new URLSearchParams()
  if (track.trim()) params.set('track_name', track.trim())
  else if (artist.trim()) params.set('q', artist.trim())
  else throw new LrclibError('曲名またはアーティストを入力してください')
  if (track.trim() && artist.trim()) params.set('artist_name', artist.trim())
  const response = await fetch(`https://lrclib.net/api/search?${params}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  })
  if (response.status === 429 || response.status === 503)
    throw new LrclibError(
      response.status === 429 ? '検索回数の制限に達しました' : 'LRCLIB が混み合っています',
      retryAfter(response.headers.get('Retry-After')),
    )
  if (!response.ok) throw new LrclibError(`検索できませんでした（${response.status}）`)
  const data: unknown = await response.json()
  if (!Array.isArray(data)) throw new LrclibError('検索結果の形式が正しくありません')
  return data
    .filter(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item === 'object' &&
        Number.isInteger(item.id) &&
        typeof item.trackName === 'string' &&
        typeof item.artistName === 'string',
    )
    .map((item) => ({
      id: item.id as number,
      trackName: item.trackName as string,
      artistName: item.artistName as string,
      albumName: typeof item.albumName === 'string' ? item.albumName : '',
      duration:
        typeof item.duration === 'number' && Number.isFinite(item.duration)
          ? Math.max(0, item.duration)
          : 0,
      instrumental: item.instrumental === true,
      plainLyrics:
        typeof item.plainLyrics === 'string' && item.plainLyrics.trim() ? item.plainLyrics : null,
      syncedLyrics:
        typeof item.syncedLyrics === 'string' && item.syncedLyrics.trim()
          ? item.syncedLyrics
          : null,
    }))
}
export function importLrclib(record: LrclibRecord, mode: 'synced' | 'plain') {
  const text = mode === 'synced' ? record.syncedLyrics : record.plainLyrics
  if (!text?.trim()) throw new LrclibError('この形式の歌詞はありません')
  const lyrics: Lyric[] =
    mode === 'synced'
      ? parseLrc(text).lyrics
      : text
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .map((text) => ({ id: uid(), time: null, text }))
  if (!lyrics.length) throw new LrclibError('取り込める歌詞がありません')
  const metadata: Metadata = {
    title: record.trackName,
    artist: record.artistName,
    album: record.albumName,
    offset: 0,
  }
  return { lyrics, metadata, source: editorSource(lyrics, metadata) }
}

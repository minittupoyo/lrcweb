import { expect, test } from 'bun:test'
import { importLrclib, type LrclibRecord, retryAfter } from './lrclib'

const record: LrclibRecord = {
  id: 1,
  trackName: '検索曲',
  artistName: '作者',
  albumName: '作品',
  duration: 123,
  instrumental: false,
  plainLyrics: '[括弧]歌詞\n\n次の行',
  syncedLyrics: '[00:01.50]歌詞\n[00:03.00]次の行',
}
test('LRCLIB import maps metadata and synchronized timestamps', () => {
  const project = importLrclib(record, 'synced')
  expect(project.metadata).toEqual({ title: '検索曲', artist: '作者', album: '作品', offset: 0 })
  expect(project.lyrics.map((l) => l.time)).toEqual([1.5, 3])
  expect(project.source).toContain('[00:01.50]歌詞')
})
test('plain import preserves blank lines and literal text without timestamps', () => {
  const project = importLrclib(record, 'plain')
  expect(project.lyrics.map((l) => l.text)).toEqual(['[括弧]歌詞', '', '次の行'])
  expect(project.lyrics.every((l) => l.time === null)).toBe(true)
  expect(() => importLrclib({ ...record, plainLyrics: null }, 'plain')).toThrow()
})
test('Retry-After honors seconds, dates and missing headers', () => {
  const now = Date.parse('2026-10-02T12:00:00Z')
  expect(retryAfter('10', now)).toBe(now + 10000)
  expect(retryAfter('Fri, 02 Oct 2026 12:01:00 GMT', now)).toBe(now + 60000)
  expect(retryAfter(null, now)).toBe(now + 30000)
})

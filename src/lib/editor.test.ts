import { expect, test } from 'bun:test'
import { editorSource, parseEditor, stampEditor } from './editor'

test('raw rows map metadata, blank lines and multiple timestamps', () => {
  const p = parseEditor('[ti:曲名]\n[00:01.00][00:02.00]歌詞\n\n未同期')
  expect(p.rows.map((row) => row.indices)).toEqual([[], [0, 1], [2], [3]])
  expect(p.lyrics.map((l) => l.time)).toEqual([1, 2, null, null])
  expect(p.metadata.title).toBe('曲名')
})
test('stamping replaces timestamps and advances past metadata', () => {
  const text = '[00:01.00][00:02.00]歌詞\n[ar:作者]\n次の歌詞'
  const result = stampEditor(text, 22, 3.45, true)!
  expect(result.source).toBe('[00:03.45]歌詞\n[ar:作者]\n次の歌詞')
  expect(result.source.slice(result.cursor)).toBe('次の歌詞')
  expect(stampEditor('[ti:曲名]', 2, 2, false)).toBeNull()
})
test('editable source includes unsynchronized rows and blank lines', () => {
  const p = parseEditor('[ti:曲名]\n[00:01.00]歌詞\n\n未同期')
  expect(editorSource(p.lyrics, p.metadata)).toBe('[ti:曲名]\n[00:01.00]歌詞\n\n未同期')
  expect(parseEditor('').lyrics).toEqual([])
})
test('adjust cursor row shifts all its timestamps and preserves other rows and caret', async () => {
  const { adjustEditor } = await import('./editor')
  const source = '[ti:曲名]\n[00:59.95][02:00.00]同じ歌詞\n[00:10.00]別の歌詞'
  const cursor = source.indexOf('同じ歌詞') + 2
  const result = adjustEditor(source, cursor, 0.1)!
  expect(result.source).toBe('[ti:曲名]\n[01:00.05][02:00.10]同じ歌詞\n[00:10.00]別の歌詞')
  expect(result.cursor).toBe(cursor)
  expect(adjustEditor('[00:00.05]歌詞', 12, -0.1)!.source).toBe('[00:00.00]歌詞')
  expect(adjustEditor('[ti:曲名]', 1, 0.1)).toBeNull()
  expect(adjustEditor('未同期の歌詞', 2, 0.1)).toBeNull()
  expect(adjustEditor('[00:3', 2, 0.1)).toBeNull()
})

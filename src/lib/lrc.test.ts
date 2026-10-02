import { expect, test } from 'bun:test'
import { exportLrc, parseLrc, parseTime, timestamp } from './lrc'

test('parse metadata, repeated timestamps and unsynced lyrics', () => {
  const result = parseLrc('[ti:夜の散歩]\n[offset:-200]\n[00:01.20][00:12.345]空を見上げる\n次の行')
  expect(result.metadata.title).toBe('夜の散歩')
  expect(result.metadata.offset).toBe(-200)
  expect(result.lyrics.map((l) => l.time)).toEqual([1.2, 12.345, null])
})
test('export sorts synchronized lines and round trips metadata', () => {
  const result = parseLrc('[ar:Artist]\n[00:12.50]後\n[00:01.00]先\n未同期')
  const output = exportLrc(result.lyrics, result.metadata)
  expect(output).toContain('[00:01.00]先\n[00:12.50]後')
  expect(output).not.toContain('未同期')
  expect(parseLrc(output).metadata.artist).toBe('Artist')
})
test('timestamp rounds over minute boundaries and validates seconds', () => {
  expect(timestamp(59.999)).toBe('01:00.00')
  expect(parseTime('00:60')).toBeNull()
  expect(parseTime('02:03.45')).toBe(123.45)
})

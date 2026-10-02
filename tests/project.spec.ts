import { expect, test } from '@playwright/test'

const legacy = {
  metadata: { title: '朝の散歩', artist: '', album: '', offset: 0 },
  lyrics: [
    '窓の向こう、街が目を覚ます',
    'まだ眠たい風が 頬をなでる',
    '昨日の言葉を ポケットにしまって',
    'いつもの道を 少し遠回り',
    '名前のない この小さな気持ち',
    '朝の光に そっと溶けていく',
    '一歩ずつ、一歩ずつ',
    '今日という日を 歩いていこう',
  ].map((text, index) => ({
    id: `demo-${index}`,
    text,
    time: [8.4, 14.2, 20.8, 27.6, 35.1, 42.3, 49.8, 56.4][index],
  })),
}
test('untouched cached demo is removed and the empty project persists', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(
    (project) => localStorage.setItem('lrc-studio-v1', JSON.stringify(project)),
    legacy,
  )
  await page.reload()
  await expect(page.getByText('歌詞なし', { exact: true })).toBeVisible()
  await expect(page.locator('#title')).toHaveValue('')
  await expect(page.getByText('自動保存済み', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('lrc-studio-v1')!).lyrics),
  ).toEqual([])
})
test('edited cached demo is preserved', async ({ page }) => {
  const edited = {
    ...legacy,
    lyrics: legacy.lyrics.map((line, index) =>
      index === 0 ? { ...line, text: 'ユーザーの編集内容' } : line,
    ),
  }
  await page.goto('/')
  await page.evaluate(
    (project) => localStorage.setItem('lrc-studio-v1', JSON.stringify(project)),
    edited,
  )
  await page.reload()
  await expect(page.getByLabel('歌詞 1', { exact: true })).toHaveValue('ユーザーの編集内容')
  await expect(page.locator('#title')).toHaveValue('朝の散歩')
})

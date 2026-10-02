import { expect, test } from '@playwright/test'

const records = [
  {
    id: 1,
    trackName: '検索曲',
    artistName: '検索アーティスト',
    albumName: 'アルバム',
    duration: 123,
    instrumental: false,
    syncedLyrics: '[00:01.50]同期歌詞\n[00:03.00]次の歌詞',
    plainLyrics: 'プレーン歌詞\n次の歌詞',
  },
  {
    id: 2,
    trackName: 'テキスト曲',
    artistName: '別の作者',
    albumName: '別作品',
    duration: 110,
    instrumental: false,
    syncedLyrics: null,
    plainLyrics: '未同期の歌詞\n別の行',
  },
  {
    id: 3,
    trackName: 'インスト曲',
    artistName: '作者',
    albumName: '',
    duration: 200,
    instrumental: true,
    syncedLyrics: null,
    plainLyrics: null,
  },
]
test('LRCLIB search previews and imports both formats with undo', async ({ page }) => {
  let url = ''
  await page.route('https://lrclib.net/api/search?**', async (route) => {
    url = route.request().url()
    await route.fulfill({ json: records })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'LRCLIB から歌詞を検索' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  await page.getByLabel('曲名', { exact: true }).last().fill('検索曲')
  await page.getByLabel('アーティスト', { exact: true }).last().fill('検索アーティスト')
  await modal.getByRole('button', { name: '検索', exact: true }).click()
  await expect(modal.getByRole('status')).toHaveText('3 件')
  expect(new URL(url).searchParams.get('track_name')).toBe('検索曲')
  expect(new URL(url).searchParams.get('artist_name')).toBe('検索アーティスト')
  await expect(modal.locator('pre')).toContainText('[00:01.50]同期歌詞')
  await modal.getByRole('button', { name: 'LRC を取り込む', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await expect(page.getByLabel('歌詞 / LRC', { exact: true })).toHaveValue(
    '[ti:検索曲]\n[ar:検索アーティスト]\n[al:アルバム]\n[00:01.50]同期歌詞\n[00:03.00]次の歌詞',
  )
  await page.getByRole('button', { name: '元に戻す', exact: true }).click()
  await expect(page.getByLabel('歌詞 / LRC', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'LRCLIB から歌詞を検索' }).click()
  await page.getByLabel('曲名', { exact: true }).last().fill('テスト曲')
  await modal.getByRole('button', { name: '検索', exact: true }).click()
  await expect(modal.getByRole('status')).toHaveText('3 件')
  await modal.getByRole('button', { name: 'テキスト', exact: true }).click()
  await expect(modal.locator('pre')).toHaveText('プレーン歌詞\n次の歌詞')
  await modal.getByRole('button', { name: 'インスト曲', exact: false }).click()
  await expect(
    modal.getByRole('button', { name: 'テキストを取り込む', exact: true }),
  ).toBeDisabled()
  await modal.getByRole('button', { name: 'テキスト曲', exact: false }).click()
  await modal.getByRole('button', { name: 'テキストを取り込む', exact: true }).click()
  await expect(page.getByLabel('歌詞 / LRC', { exact: true })).toHaveValue(
    '[ti:テキスト曲]\n[ar:別の作者]\n[al:別作品]\n未同期の歌詞\n別の行',
  )
  await page.getByRole('tab', { name: '歌詞編集', exact: true }).click()
  await expect(page.getByLabel('タイムスタンプ 1', { exact: true })).toHaveValue('')
})
test('LRCLIB errors, rate limits and empty results leave the editor intact', async ({ page }) => {
  let calls = 0
  await page.route('https://lrclib.net/api/search?**', async (route) => {
    calls++
    const track = new URL(route.request().url()).searchParams.get('track_name')
    if (track === 'エラー') await route.fulfill({ status: 500, json: {} })
    else if (track === '制限')
      await route.fulfill({
        status: 429,
        headers: { 'Retry-After': '2', 'Access-Control-Expose-Headers': 'Retry-After' },
        json: {},
      })
    else await route.fulfill({ json: [] })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '行を追加', exact: true }).click()
  await page.getByLabel('歌詞 1', { exact: true }).fill('保持する歌詞')
  const original = await page.getByLabel('歌詞 1', { exact: true }).inputValue()
  await page.getByRole('button', { name: 'LRCLIB から歌詞を検索' }).click()
  const modal = page.getByRole('dialog')
  const track = page.getByLabel('曲名', { exact: true }).last()
  await track.fill('なし')
  await modal.getByRole('button', { name: '検索', exact: true }).click()
  await expect(modal.getByText('該当する歌詞なし')).toBeVisible()
  await track.fill('エラー')
  await modal.getByRole('button', { name: '検索', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText('500')
  await track.fill('制限')
  await modal.getByRole('button', { name: '検索', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText('検索回数の制限')
  await expect(modal.getByRole('button', { name: /秒後に再検索/ })).toBeDisabled()
  expect(calls).toBe(3)
  await expect(modal.getByRole('button', { name: '検索', exact: true })).toBeEnabled({
    timeout: 4000,
  })
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('歌詞 1', { exact: true })).toHaveValue(original)
})
test('search modal scrolls inside the viewport and cancels on close', async ({ page }) => {
  await page.route('https://lrclib.net/api/search?**', (route) =>
    route.fulfill({
      json: Array.from({ length: 20 }, (_, i) => ({
        ...records[0],
        id: i + 10,
        trackName: `検索曲 ${i + 1}`,
        syncedLyrics: Array.from({ length: 100 }, (_, j) => `[00:01.00]歌詞 ${j + 1}`).join('\n'),
      })),
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'LRCLIB から歌詞を検索' }).click()
  await page.getByLabel('曲名', { exact: true }).last().fill('テスト曲')
  const modal = page.getByRole('dialog')
  await modal.getByRole('button', { name: '検索', exact: true }).click()
  await expect(modal.getByRole('status')).toHaveText('20 件')
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    const box = await modal.boundingBox()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    expect(
      await page
        .locator('.lrclib-result-list')
        .evaluate((el) => el.scrollHeight > el.clientHeight && el.clientHeight > 0),
    ).toBe(true)
    expect(
      await page
        .locator('.lrclib-preview-text')
        .evaluate((el) => el.scrollHeight > el.clientHeight && el.clientHeight > 0),
    ).toBe(true)
    await expect(
      modal.getByRole('button', { name: 'LRC を取り込む', exact: true }),
    ).toBeInViewport()
  }
  await page.setViewportSize({ width: 375, height: 667 })
  await page.screenshot({ path: test.info().outputPath('lrc-search-mobile.png') })
  await page.keyboard.press('Escape')
  await page.unrouteAll()
  await page.route('https://lrclib.net/api/search?**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600))
    await route.fulfill({ json: records }).catch(() => {})
  })
  await page.getByRole('button', { name: 'LRCLIB から歌詞を検索' }).click()
  await page.getByLabel('曲名', { exact: true }).last().fill('テスト曲')
  await modal.getByRole('button', { name: '検索', exact: true }).click()
  await expect(modal.getByRole('button', { name: '検索中', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(750)
  await page.getByRole('button', { name: 'LRCLIB から歌詞を検索' }).click()
  await expect(modal.locator('.lrclib-result')).toHaveCount(0)
  await page.getByLabel('曲名', { exact: true }).last().fill('テスト曲')
  await expect(modal.getByRole('button', { name: '検索', exact: true })).toBeEnabled()
})

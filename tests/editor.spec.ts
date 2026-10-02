import { expect, test } from '@playwright/test'

test('edit, synchronize, persist, import and export lyrics', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tab', { name: '歌詞編集', exact: true })).toBeVisible()
  await expect(page.locator('.sidebar')).toHaveCount(0)
  await expect(page.getByText('歌詞なし', { exact: true })).toBeVisible()
  await page.getByLabel('歌詞ファイル', { exact: true }).setInputFiles({
    name: 'test.lrc',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '[ti:テスト曲]\n' +
        Array.from(
          { length: 8 },
          (_, i) => `[00:${String(8 + i).padStart(2, '0')}.40]歌詞 ${i + 1}`,
        ).join('\n'),
    ),
  })
  await page.getByRole('textbox', { name: '歌詞 1', exact: true }).fill('テストの歌詞')
  await page.getByRole('button', { name: '行を追加', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '歌詞 9', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '元に戻す', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '歌詞 9', exact: true })).toHaveCount(0)
  await page.waitForTimeout(650)
  await page.reload()
  await expect(page.getByRole('textbox', { name: '歌詞 1', exact: true })).toHaveValue(
    'テストの歌詞',
  )
  const sampleRate = 8000,
    seconds = 4
  const wav = Buffer.alloc(44 + sampleRate * seconds * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(wav.length - 44, 40)
  for (let i = 0; i < sampleRate * seconds; i++)
    wav.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 440) / sampleRate) * 3000), 44 + i * 2)
  await page
    .getByLabel('音声ファイル', { exact: true })
    .setInputFiles({ name: 'test.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.locator('audio')).toHaveJSProperty('duration', 4)
  await page.getByRole('button', { name: '再生', exact: true }).click()
  await page.waitForTimeout(350)
  await page.getByRole('button', { name: '現在の時間を同期', exact: false }).click()
  await page.getByRole('button', { name: '一時停止', exact: true }).click()
  await expect(page.getByLabel('タイムスタンプ 1', { exact: true })).not.toHaveValue('00:08.40')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '書き出す', exact: false }).click()
  expect((await download).suggestedFilename()).toBe('テスト曲.lrc')
  await page.getByLabel('歌詞ファイル', { exact: true }).setInputFiles({
    name: 'import.lrc',
    mimeType: 'text/plain',
    buffer: Buffer.from('[ti:インポート曲]\n[00:01.00][00:02.00]新しい歌詞\n未同期'),
  })
  await expect(page.getByLabel('曲名', { exact: true })).toHaveValue('インポート曲')
  await expect(page.getByRole('textbox', { name: '歌詞 3', exact: true })).toHaveValue('未同期')
  await page.getByRole('tab', { name: 'テキスト / LRC' }).click()
  await expect(page.getByLabel('歌詞 / LRC', { exact: true })).toHaveValue(
    '[ti:インポート曲]\n[00:01.00]新しい歌詞\n[00:02.00]新しい歌詞\n未同期',
  )
})
test('responsive layout and dialogs', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  for (const width of [1440, 768, 390, 375]) {
    await page.setViewportSize({ width, height: 960 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  }
  await page.getByRole('button', { name: 'キーボードショートカット' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('lrc-studio-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: test.info().outputPath('lrc-studio-desktop.png'), fullPage: true })
  expect(errors).toEqual([])
})
test('unified text editor preserves raw input, edits metadata and timestamps', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'LRC コード', exact: true })).toHaveCount(0)
  const field = page.getByLabel('歌詞 / LRC', { exact: true })
  const text = '[ti:編集曲]\n[offset:200]\n[00:01.25][00:02.50]同じ歌詞\nプレーンテキスト\n\n[00:3'
  await field.fill(text)
  await expect(page.getByLabel('曲名', { exact: true })).toHaveValue('編集曲')
  await page.getByRole('tab', { name: '歌詞編集', exact: true }).click()
  await expect(page.getByLabel('歌詞 3', { exact: true })).toHaveValue('プレーンテキスト')
  await expect(page.getByLabel('タイムスタンプ 1', { exact: true })).toHaveValue('00:01.25')
  await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  await expect(field).toHaveValue(text)
  await page.waitForTimeout(650)
  await page.reload()
  await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  await expect(field).toHaveValue(text)
  await field.fill('')
  await page.getByRole('tab', { name: '歌詞編集', exact: true }).click()
  await expect(page.getByText('歌詞なし')).toBeVisible()
})
test('Alt shortcuts stamp the cursor line, advance, seek and support undo', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  const field = page.getByLabel('歌詞 / LRC', { exact: true })
  await field.fill('[ti:テスト]\n[offset:200]\n一行目\n[00:03.00]二行目\n三行目')
  await field.evaluate((el: HTMLTextAreaElement) => {
    el.focus()
    el.setSelectionRange(el.value.indexOf('一行目'), el.value.indexOf('一行目'))
  })
  await field.press('Alt+z')
  await expect(field).not.toHaveValue(/\[00:00.20\]/)
  await expect(page.getByRole('status')).toContainText('音声を読み込んでください')
  const sampleRate = 8000
  const wav = Buffer.alloc(44 + sampleRate * 8 * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(wav.length - 44, 40)
  await page
    .getByLabel('音声ファイル', { exact: true })
    .setInputFiles({ name: 'test.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.locator('audio')).toHaveJSProperty('duration', 8)
  await page.locator('audio').evaluate((el: HTMLAudioElement) => {
    el.currentTime = 1.5
  })
  await field.evaluate((el: HTMLTextAreaElement) => {
    el.focus()
    el.setSelectionRange(el.value.indexOf('一行目'), el.value.indexOf('一行目'))
  })
  await field.press('Alt+z')
  await expect(field).toHaveValue(
    '[ti:テスト]\n[offset:200]\n[00:01.70]一行目\n[00:03.00]二行目\n三行目',
  )
  expect(
    await field.evaluate(
      (el: HTMLTextAreaElement) => el.value.slice(0, el.selectionStart).split('\n').length,
    ),
  ).toBe(3)
  await field.press('Control+z')
  await expect(field).toHaveValue('[ti:テスト]\n[offset:200]\n一行目\n[00:03.00]二行目\n三行目')
  await field.press('Control+Shift+z')
  await expect(field).toHaveValue(/\[00:01.70\]一行目/)
  await field.press('Alt+Enter')
  expect(
    await field.evaluate(
      (el: HTMLTextAreaElement) => el.value.slice(0, el.selectionStart).split('\n').length,
    ),
  ).toBe(4)
  await field.press('Alt+x')
  await expect(page.locator('audio')).toHaveJSProperty('paused', false)
  const current = await page.locator('audio').evaluate((el: HTMLAudioElement) => el.currentTime)
  expect(current).toBeGreaterThanOrEqual(2.8)
  expect(current).toBeLessThan(3.4)
  await page.locator('audio').evaluate((el: HTMLAudioElement) => {
    el.pause()
    el.currentTime = 4
  })
  await field.press('Alt+z')
  await expect(field).toHaveValue(/\[00:04.20\]二行目/)
  await field.press('Alt+Enter')
  expect(
    await field.evaluate(
      (el: HTMLTextAreaElement) => el.value.slice(0, el.selectionStart).split('\n').length,
    ),
  ).toBe(5)
  await field.press('Alt+x')
  await expect(page.getByRole('status')).toContainText('この行にはタイムスタンプがありません')
  await field.press('Alt+Enter')
  await expect(field).toHaveValue(/\[00:04.20\]三行目/)
  await field.evaluate((el: HTMLTextAreaElement) => {
    el.focus()
    el.setSelectionRange(2, 2)
  })
  await field.press('Alt+z')
  await expect(field).toHaveValue(/^\[ti:テスト\]/)
  await expect(page.getByRole('status')).toContainText('歌詞の行を選択してください')
  await field.fill(Array.from({ length: 100 }, (_, i) => `歌詞 ${i + 1}`).join('\n'))
  await field.evaluate((el: HTMLTextAreaElement) => {
    const position = el.value.indexOf('歌詞 50\n')
    el.focus()
    el.setSelectionRange(position, position)
    el.scrollTop = 0
  })
  await field.press('Alt+Enter')
  const textCenter = await field.evaluate((el: HTMLTextAreaElement) => {
    const row = el.value.slice(0, el.selectionStart).split('\n').length - 1
    const style = getComputedStyle(el)
    return Math.abs(
      parseFloat(style.paddingTop) +
        (row + 0.5) * parseFloat(style.lineHeight) -
        el.scrollTop -
        el.clientHeight / 2,
    )
  })
  expect(textCenter).toBeLessThan(2)
  await page.getByRole('tab', { name: '歌詞編集', exact: true }).click()
  await page.getByRole('button', { name: '現在の時間を同期', exact: false }).click()
  const rowCenter = await page.locator('.lyric-list').evaluate((el) => {
    const row = el.querySelector('[data-selected="true"]')!
    const a = el.getBoundingClientRect(),
      b = row.getBoundingClientRect()
    return Math.abs(b.top + b.height / 2 - a.top - a.height / 2)
  })
  expect(rowCenter).toBeLessThan(2)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
test('viewport stays fixed while long lyrics scroll inside the editors', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  const field = page.getByLabel('歌詞 / LRC', { exact: true })
  await field.fill(
    Array.from(
      { length: 100 },
      (_, i) => `[00:${String(i % 60).padStart(2, '0')}.00]歌詞 ${i + 1}`,
    ).join('\n'),
  )
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 375, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(
      await field.evaluate(
        (el: HTMLTextAreaElement) => el.clientHeight > 0 && el.scrollHeight > el.clientHeight,
      ),
    ).toBe(true)
    await field.evaluate((el: HTMLTextAreaElement) => {
      el.scrollTop = el.scrollHeight
    })
    expect(await field.evaluate((el: HTMLTextAreaElement) => el.scrollTop)).toBeGreaterThan(0)
    const button = await page
      .getByRole('button', { name: '現在の時間を同期', exact: false })
      .boundingBox()
    expect(button!.y + button!.height).toBeLessThanOrEqual(viewport.height)
    await page.getByRole('tab', { name: '歌詞編集', exact: true }).click()
    const list = page.locator('.lyric-list')
    expect(
      await list.evaluate((el) => el.clientHeight > 0 && el.scrollHeight > el.clientHeight),
    ).toBe(true)
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  }
  await page.setViewportSize({ width: 375, height: 667 })
  await page.getByRole('button', { name: '楽曲情報とプレビュー', exact: true }).click()
  await expect(page.getByLabel('曲名', { exact: true })).toBeVisible()
  expect(
    await page.locator('.details-column').evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true)
  await page.locator('.details-column').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect(page.getByRole('button', { name: 'タイミングをまとめて調整' })).toBeInViewport()
  await page.getByRole('button', { name: '楽曲情報とプレビュー', exact: true }).click()
  await expect(field).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('lrc-studio-fixed-mobile.png') })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: test.info().outputPath('lrc-studio-fixed-desktop.png') })
})

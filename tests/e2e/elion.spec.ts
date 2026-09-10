import { test, expect, type Page } from '@playwright/test'
const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  errors.set(page, [])
  page.on('pageerror', (error) => errors.get(page)!.push(error.message))
  // Deterministic third-party forecast, not a mock of Elion's stores/actions.
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: {
        current: { temperature_2m: 27, weather_code: 2 },
        daily: { temperature_2m_max: [29], temperature_2m_min: [23] }
      }
    })
  )
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
})
async function boot(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

test('exact default tokens and a content-weighted dashboard', async ({ page }) => {
  await boot(page)
  const tokens = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const today = document.querySelector('.today-panel')!.getBoundingClientRect()
    const weather = document.querySelector('.weather-panel')!.getBoundingClientRect()
    return {
      bg: root.getPropertyValue('--bg'),
      current: root.getPropertyValue('--current'),
      font: getComputedStyle(document.body).fontFamily,
      ratio: (today.width * today.height) / (weather.width * weather.height),
      button: getComputedStyle(document.querySelector('.focus-action')!).backgroundImage
    }
  })
  // iOS light jadi default sejak v0.7 — bandingkan trim+uppercase biar
  // kapitalisasi hex dari runtime tidak jadi source of flake.
  expect(tokens.bg.trim().toUpperCase()).toBe('#F2F2F7')
  expect(tokens.current.trim().toUpperCase()).toBe('#0066D6')
  expect(tokens.font).toContain('Geist')
  expect(tokens.ratio).toBeGreaterThan(3)
  expect(tokens.button).toBe('none')
})

test('dock is centered and pages do not overflow at the four target widths', async ({ page }) => {
  await boot(page)
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const geometry = await page.evaluate(() => {
      const dock = document.querySelector('.quick-dock')!.getBoundingClientRect()
      return { center: dock.x + dock.width / 2, overflow: document.documentElement.scrollWidth > innerWidth }
    })
    expect(geometry.center).toBeCloseTo(width / 2, 0)
    expect(geometry.overflow).toBe(false)
  }
})

test('task creation and habit completion update the shared stores', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Write a focused outline')
  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await page.getByRole('button', { name: 'Mark Read 20 pages done', exact: true }).click()
  await page.goto('/habits')
  await expect(
    page.getByRole('button', { name: 'Mark Read 20 pages not done today', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/tasks')
  await expect(page.getByRole('button', { name: 'Write a focused outline', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Write a focused outline', exact: true })).toBeVisible()
})

test('pixel art changes frames, reacts to a cheer, and honors reduced motion', async ({ page }) => {
  await boot(page)
  const sprite = page.locator('.floating-nova [data-frame]').first()
  const frame = await sprite.getAttribute('data-frame')
  await expect.poll(() => sprite.getAttribute('data-frame')).not.toBe(frame)
  await page.getByRole('button', { name: 'Interact with Elion', exact: true }).click()
  await page.getByRole('button', { name: 'High five Elion', exact: true }).click()
  await expect(page.locator('.floating-nova .nova-pet')).toHaveAttribute('data-pose', 'happy')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.floating-nova .nova-pet')).toHaveAttribute('data-animated', 'false')
  const frozen = await sprite.getAttribute('data-frame')
  await page.waitForTimeout(400)
  expect(await sprite.getAttribute('data-frame')).toBe(frozen)
})

test('kanban drag changes status and persists across reload', async ({ page }) => {
  await page.goto('/workspace')
  await page
    .getByRole('navigation', { name: 'Workspace documents' })
    .getByRole('link', { name: 'Project Aurora' })
    .click()
  const title = 'Offline STT dictation (Whisper WASM)'
  const handle = page.getByRole('button', { name: `Move ${title}`, exact: true })
  await expect(handle).toBeVisible()
  const target = page.locator('.board-column').nth(1).locator('.board-column-floor')
  const from = (await handle.boundingBox())!,
    to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 12, from.y + 12, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + 30, { steps: 25 })
  await page.mouse.up()
  await expect(target.getByRole('button', { name: title, exact: true })).toBeVisible()
  await page.reload()
  await expect(
    page.locator('.board-column').nth(1).getByRole('button', { name: title, exact: true })
  ).toBeVisible()
})

test('Lockdown pauses without resetting and saves the real session once', async ({ page }) => {
  await page.goto('/lockdown')
  await page.getByLabel('Session objective').fill('One deliberate task')
  await page.getByRole('button', { name: 'Start focus session', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause focus', exact: true })).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Pause focus', exact: true }).click()
  const paused = await page.getByRole('timer').innerText()
  expect(paused).not.toBe('25:00')
  await page.waitForTimeout(1100)
  expect(await page.getByRole('timer').innerText()).toBe(paused)
  await page.getByRole('button', { name: 'Resume focus', exact: true }).click()
  await expect(page.getByRole('timer')).not.toHaveText('25:00')
  await page.getByRole('button', { name: 'Exit Lockdown', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Session saved' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Back to dashboard', exact: true }).click()
  await page.goto('/lockdown')
  await page.getByRole('button', { name: 'Focus history', exact: true }).click()
  await expect(page.getByText('One deliberate task', { exact: true })).toBeVisible()
})

test('voice inserts at the editor selection as a real undoable edit', async ({ page }) => {
  // Stub the neural worker's result only. Capture, mic controls, selection,
  // registered editor adapter, history and persistence are the real app.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        if (args[1]?.name === 'Elion offline dictation')
          return {
            onmessage: null as ((event: { data: unknown }) => void) | null,
            onerror: null,
            postMessage(
              this: { onmessage: ((event: { data: unknown }) => void) | null },
              message: { id: number }
            ) {
              setTimeout(
                () => this.onmessage?.({ data: { id: message.id, kind: 'result', text: 'quiet' } }),
                50
              )
            },
            terminate() {}
          }
        return Reflect.construct(target, args)
      }
    })
  })
  await page.goto('/workspace')
  await page
    .getByRole('navigation', { name: 'Workspace documents' })
    .getByRole('link', { name: 'Project Aurora' })
    .click()
  await page.getByRole('button', { name: 'Document actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Open advanced Elion editor', exact: true }).click()
  const paragraph = page.getByRole('textbox', { name: 'Text', exact: true }).first()
  await paragraph.fill('Alpha beta gamma')
  await paragraph.press('Tab')
  await paragraph.focus()
  await page.evaluate(async () => {
    const element = document.querySelector<HTMLElement>('[contenteditable="true"][aria-label="Text"]')!
    const range = document.createRange()
    range.setStart(element.firstChild!, 6)
    range.setEnd(element.firstChild!, 10)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
  })
  await paragraph.locator('..').getByRole('button', { name: 'Dictate into text', exact: true }).click()
  await expect(page.locator('.dictation-feedback')).toContainText('Listening on this device')
  await page
    .locator('.dictation-feedback')
    .getByRole('button', { name: 'Stop dictation', exact: true })
    .click()
  await expect(paragraph).toHaveText('Alpha quiet gamma')
  await page.keyboard.press('Control+z')
  await expect(paragraph).toHaveText('Alpha beta gamma')
  await page.keyboard.press('Control+Shift+z')
  await expect(paragraph).toHaveText('Alpha quiet gamma')
})

test('microphone denial gives an actionable error, not a silent failure', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('denied', 'NotAllowedError')
        }
      }
    })
  })
  await boot(page)
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Draft')
  await page.getByRole('button', { name: 'Dictate task title', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('enable it in browser or system settings')
})

function wave() {
  const rate = 16000,
    samples = rate * 8
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++)
    buffer.writeInt16LE(Math.round(Math.sin((i / rate) * Math.PI * 440) * 300), 44 + i * 2)
  return buffer
}
test('local audio controls the real platter and tonearm, then stays paused', async ({ page }) => {
  await page.goto('/music')
  await page
    .getByLabel('Local audio files', { exact: true })
    .setInputFiles({ name: 'Focus test.wav', mimeType: 'audio/wav', buffer: wave() })
  await page.getByRole('button', { name: 'Play music', exact: true }).click()
  await expect
    .poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0)
  await expect(page.locator('.large-turntable')).toHaveClass(/is-playing/)
  await expect(page.locator('.large-turntable .vinyl')).toHaveCSS('animation-play-state', 'running')
  await page.getByRole('button', { name: 'Pause music', exact: true }).click()
  await expect(page.locator('.large-turntable .vinyl')).toHaveCSS('animation-play-state', 'paused')
  const angle = await page.locator('.large-turntable .vinyl').evaluate((el) => getComputedStyle(el).transform)
  await page.waitForTimeout(400)
  expect(await page.locator('.large-turntable .vinyl').evaluate((el) => getComputedStyle(el).transform)).toBe(
    angle
  )
  await page
    .getByRole('navigation', { name: 'Primary', exact: true })
    .getByRole('link', { name: 'Dashboard', exact: true })
    .click()
  await expect(page.locator('.dashboard-music .music-readout strong')).toHaveText('Focus test')
})

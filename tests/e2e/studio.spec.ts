import { test, expect, type Page } from '@playwright/test'

async function newDocument(page: Page) {
  await page.goto('/workspace')
  await page.getByRole('button', { name: /Start with a thought/ }).click()
  await expect(page.locator('affine-paragraph [contenteditable="true"]').first()).toBeVisible({
    timeout: 30000
  })
}
const editor = (page: Page) => page.locator('affine-editor-container')
const body = (page: Page) => page.locator('affine-paragraph [contenteditable="true"]').first()

test('BlockSuite really edits rich text and survives an immediate reload', async ({ page }) => {
  await newDocument(page)
  await body(page).click()
  await page.keyboard.type('A bold idea and a clear plan.')
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  for (let index = 0; index < 11; index++) await page.keyboard.press('ArrowRight')
  await page.keyboard.up('Shift')
  await page.keyboard.press('Control+b')
  // Formatting commands resolve through BlockSuite's selection pipeline.
  // Confirm the actual mark before exercising the immediate-reload path.
  await expect
    .poll(() =>
      editor(page).evaluate((node: any) =>
        node.doc
          .getBlocksByFlavour('affine:paragraph')[0]
          .model.text.toDelta()
          .some((delta: any) => delta.attributes?.bold && delta.insert.includes('A bold idea'))
      )
    )
    .toBe(true)
  await page.reload()
  await expect(body(page)).toContainText('A bold idea and a clear plan.', { timeout: 30000 })
  const deltas = await editor(page).evaluate((node: any) =>
    node.doc.getBlocksByFlavour('affine:paragraph')[0].model.text.toDelta()
  )
  expect(deltas.some((delta: any) => delta.attributes?.bold && delta.insert.includes('A bold idea'))).toBe(
    true
  )
  await expect(page.locator('.document-save-state')).toContainText('All changes saved')
})

test('Doc and Canvas use one native document and persist real drawn geometry', async ({ page }) => {
  await newDocument(page)
  await body(page).click()
  await page.keyboard.type('A thought on the canvas')
  await page.getByRole('tab', { name: 'Canvas', exact: true }).click()
  await expect(page.locator('affine-edgeless-root')).toBeVisible()
  await page.getByRole('button', { name: 'Draw shape', exact: true }).click()
  const canvas = await page.locator('.blocksuite-surface').boundingBox()
  if (!canvas) throw new Error('Canvas has no layout')
  // Draw in the blank upper-left area, not through the existing note.
  await page.mouse.move(canvas.x + 55, canvas.y + 55)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 185, canvas.y + 145, { steps: 12 })
  await page.mouse.up()
  await expect
    .poll(() =>
      editor(page).evaluate(
        (node: any) =>
          node.doc.getBlocksByFlavour('affine:surface')[0].model.getElementsByType('shape').length
      )
    )
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Fit canvas to content', exact: true }).click()
  await expect(page.locator('.document-save-state')).toContainText('All changes saved')
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Canvas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.locator('affine-edgeless-root')).toBeVisible({ timeout: 30000 })
  expect(
    await editor(page).evaluate(
      (node: any) => node.doc.getBlocksByFlavour('affine:surface')[0].model.getElementsByType('shape').length
    )
  ).toBeGreaterThan(0)
  await page.getByRole('tab', { name: 'Doc', exact: true }).click()
  await expect(body(page)).toContainText('A thought on the canvas')
})

test('migration keeps the existing Elion board live and snapshots the original', async ({ page }) => {
  await page.goto('/workspace')
  await page
    .getByRole('navigation', { name: 'Workspace documents' })
    .getByRole('link', { name: 'Project Aurora' })
    .click()
  await expect(page.locator('.native-react-mount .board-card')).toHaveCount(9, { timeout: 30000 })
  await page.getByRole('button', { name: 'Theme contrast auto-correction', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Edit item' })).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('One shared item, edited in BlockSuite')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await page.getByRole('button', { name: 'Document actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Version history', exact: true }).click()
  await expect(page.getByText('Before BlockSuite migration', { exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'One shared item, edited in BlockSuite', exact: true })
  ).toBeVisible()
})

test('BlockSuite dictation goes through native Yjs text and native undo/redo', async ({ page }) => {
  // Only neural inference is replaced; input, capture and the editor are real.
  await page.addInitScript(() => {
    const Native = window.Worker
    window.Worker = new Proxy(Native, {
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
                40
              )
            },
            terminate() {}
          }
        return Reflect.construct(target, args)
      }
    })
  })
  await newDocument(page)
  await body(page).click()
  await page.keyboard.type('Alpha beta gamma')
  // Select beta with native keyboard selection, not a DOM textContent mutation.
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.down('Shift')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.up('Shift')
  await page.getByRole('button', { name: 'Dictate into BlockSuite document', exact: true }).click()
  await expect(page.locator('.dictation-feedback')).toContainText('Listening on this device')
  await page
    .locator('.dictation-feedback')
    .getByRole('button', { name: 'Stop dictation', exact: true })
    .click()
  await expect(body(page)).toHaveText('Alpha quiet gamma')
  await page.getByRole('button', { name: 'Undo document change', exact: true }).click()
  await expect(body(page)).toHaveText('Alpha beta gamma')
  await page.getByRole('button', { name: 'Redo document change', exact: true }).click()
  await expect(body(page)).toHaveText('Alpha quiet gamma')
})

test('MiniCPM unavailable state is honest and cannot send a fake reply', async ({ page }) => {
  await page.route('**/api/companion/health', (route) =>
    route.fulfill({ status: 503, json: { error: 'Gateway offline' } })
  )
  await page.goto('/settings#companion')
  const chat = page.getByRole('dialog', { name: 'Elion chat' })
  await page.getByRole('button', { name: 'Chat with Elion', exact: true }).click()
  await chat.getByRole('radio', { name: /MiniCPM Desk Pet/ }).click()
  await chat.getByRole('button', { name: 'Connect MiniCPM', exact: true }).click()
  await expect(chat.locator('.nova-chat-error')).toContainText('could not be reached')
  await chat.getByRole('textbox', { name: 'Message Elion', exact: true }).fill('Help me focus')
  await expect(chat.getByRole('button', { name: 'Send message to Elion', exact: true })).toBeDisabled()
  await expect(chat.locator('.nova-message.from-assistant')).toHaveCount(0)
})

test('MiniCPM streaming contract drives Elion and keeps private context off by default', async ({ page }) => {
  let payload: any
  await page.route('**/api/companion/health', (route) =>
    route.fulfill({
      json: {
        ok: true,
        alive: true,
        backend: 'llama.cpp',
        device: 'cpu',
        model_name: 'Protocol test fixture',
        llama_server: { status: 'ok' }
      }
    })
  )
  await page.route('**/api/companion/chat', async (route) => {
    payload = route.request().postDataJSON()
    await route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"event":"start"}\n\ndata: {"event":"delta","content":"Protocol fixture response."}\n\ndata: {"event":"end"}\n\n'
    })
  })
  await page.goto('/settings#companion')
  const chat = page.getByRole('dialog', { name: 'Elion chat' })
  await page.getByRole('button', { name: 'Chat with Elion', exact: true }).click()
  await chat.getByRole('radio', { name: /MiniCPM Desk Pet/ }).click()
  await chat.getByRole('button', { name: 'Connect MiniCPM', exact: true }).click()
  await expect(chat.getByText('MiniCPM is connected')).toBeVisible()
  await chat.getByRole('textbox', { name: 'Message Elion', exact: true }).fill('Help me find a next step')
  await chat.getByRole('button', { name: 'Send message to Elion', exact: true }).click()
  await expect(chat.locator('.nova-message.from-assistant')).toContainText('Protocol fixture response.')
  expect(payload.messages.at(-1).content).toBe('Help me find a next step')
  expect(payload.system).not.toContain('Prepare Q4 proposal')
  expect(payload.silent).toBe(true)
})

test('the floating companion opens, moves with the keyboard, and can be unpinned', async ({ page }) => {
  await page.goto('/tasks')
  const nova = page.locator('.floating-nova')
  await expect(nova).toBeVisible()
  await page.getByRole('button', { name: 'Move Elion', exact: true }).focus()
  const before = await nova.boundingBox()
  await page.keyboard.press('ArrowLeft')
  const after = await nova.boundingBox()
  expect(after!.x).toBeLessThan(before!.x)
  await page.getByRole('button', { name: 'Interact with Elion', exact: true }).click()
  await page.getByRole('button', { name: 'Start a chat', exact: true }).click()
  await expect(page.locator('.floating-nova-chat')).toBeVisible()
  await page.getByRole('button', { name: 'Close companion chat', exact: true }).click()
  await page.getByRole('button', { name: 'Hide Elion', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(nova).toHaveCount(0)
})

test('React Bits spotlight and dock move, with a real reduced-motion fallback', async ({ page }) => {
  await page.goto('/')
  const spotlight = page.locator('.today-panel')
  await expect(spotlight).toHaveAttribute('data-effects', 'on')
  await spotlight.hover({ position: { x: 80, y: 60 } })
  // hover di offset 80px — browser memberi presisi subpixel (79.99px), jadi
  // bandingkan angka yang dibulatkan, bukan substring.
  await expect
    .poll(() => spotlight.evaluate((el) => Math.round(parseFloat(el.style.getPropertyValue('--mouse-x')))))
    .toBe(80)
  const dock = page.getByRole('navigation', { name: 'Quick dock', exact: true })
  await dock.getByRole('link', { name: 'Workspace', exact: true }).hover()
  await expect
    .poll(() =>
      dock
        .locator('.dock-icon-motion')
        .nth(1)
        .evaluate((element) => getComputedStyle(element).transform)
    )
    .not.toBe('none')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(spotlight).toHaveAttribute('data-effects', 'off')
  await expect(dock).toHaveAttribute('data-motion', 'off')
})

test('renaming an existing native document does not revert its title', async ({ page }) => {
  await newDocument(page)
  await body(page).click()
  await page.keyboard.type('Keep the body while renaming')
  await page.getByRole('link', { name: 'Workspace', exact: true }).first().click()
  await page.getByRole('button', { name: 'Actions for Untitled', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept('Research notes'))
  await page.getByRole('menuitem', { name: 'Rename document', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Workspace documents' })
    .getByRole('link', { name: 'Research notes' })
    .click()
  await expect(page.locator('doc-title')).toContainText('Research notes', { timeout: 30000 })
  await expect(body(page)).toContainText('Keep the body while renaming')
  await page.reload()
  await expect(page.locator('doc-title')).toContainText('Research notes', { timeout: 30000 })
})

test('native version snapshots restore the actual rich document', async ({ page }) => {
  await newDocument(page)
  await body(page).click()
  await page.keyboard.type('First version.')
  await page.getByRole('button', { name: 'Document actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save a version', exact: true }).click()
  await expect(page.getByText('Version saved', { exact: true })).toBeVisible()
  await body(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Second version.')
  await expect(body(page)).toContainText('Second version.')
  await page.getByRole('button', { name: 'Document actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Version history', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page
    .locator('.native-version-list > div')
    .filter({ hasText: 'Saved version' })
    .getByRole('button', { name: 'Restore version', exact: true })
    .click()
  await expect(body(page)).toHaveText('First version.', { timeout: 30000 })
})

test('BlockSuite media uses the shared local blob store across reload', async ({ page }) => {
  await newDocument(page)
  await editor(page).evaluate(async (node: any) => {
    const image = await (await fetch('/pet/nova-sprites.png')).blob()
    const sourceId = await node.doc.blobSync.set(image)
    const note = node.doc.getBlocksByFlavour('affine:note')[0].model
    node.doc.addBlock(
      'affine:image',
      { sourceId, width: 256, height: 224, caption: 'Local media fixture' },
      note.id
    )
  })
  await expect(page.locator('affine-image')).toBeVisible()
  await expect(page.locator('.document-save-state')).toContainText('All changes saved')
  await page.reload()
  await expect(page.locator('affine-image')).toBeVisible({ timeout: 30000 })
  const size = await editor(page).evaluate(async (node: any) => {
    const model = node.doc.getBlocksByFlavour('affine:image')[0].model
    return (await node.doc.blobSync.get(model.sourceId))?.size ?? 0
  })
  expect(size).toBeGreaterThan(0)
})

// §44 — object switching. Form ItemModal harus selalu mengikutiobjek yang
// sedang dipilih (bukan snapshot saat pertama dibuka) dan data live dari
// store. Ini regression test-nya.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ItemModal } from '../src/components/items/ItemModal'
import { useItemsStore } from '../src/stores/itemsStore'
import type { WorkspaceItem } from '../src/lib/types'

function mk(id: string, title: string): WorkspaceItem {
  return {
    id,
    type: 'task',
    title,
    description: '',
    status: 'todo',
    priority: 'medium',
    labels: [],
    databaseId: null,
    customFields: {},
    rank: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function seed(...items: WorkspaceItem[]) {
  useItemsStore.setState({ items: Object.fromEntries(items.map((i) => [i.id, i])) })
}

const titleInput = () => screen.getByLabelText('Title') as HTMLInputElement

describe('ItemModal object switching (§44)', () => {
  it('follows the selected object when the modal is switched A → B → C → A', () => {
    const A = mk('a', 'Alpha')
    const B = mk('b', 'Beta')
    const C = mk('c', 'Gamma')
    seed(A, B, C)
    const { rerender } = render(
      <ItemModal db={null} databaseId={null} editing={A} creating={null} onClose={() => {}} />
    )
    expect(titleInput().value).toBe('Alpha')
    for (const step of [B, C, A, B, C, A]) {
      rerender(<ItemModal db={null} databaseId={null} editing={step} creating={null} onClose={() => {}} />)
      expect(titleInput().value).toBe(step.title)
    }
  })

  it('hydrates from the live store, not a stale caller snapshot', () => {
    const A = mk('a2', 'Original title')
    seed(A)
    // caller mengklik → memegang snapshot → store keburu berubah sebelum mount
    const staleSnapshot = A
    useItemsStore.setState({ items: { a2: { ...A, title: 'Renamed elsewhere' } } })
    render(<ItemModal db={null} databaseId={null} editing={staleSnapshot} creating={null} onClose={() => {}} />)
    expect(titleInput().value).toBe('Renamed elsewhere')
  })

  it('saving after a switch writes to the CURRENT object, not the previous one', async () => {
    const A = mk('a3', 'Alpha three')
    const B = mk('b3', 'Beta three')
    seed(A, B)
    const { rerender } = render(
      <ItemModal db={null} databaseId={null} editing={A} creating={null} onClose={() => {}} />
    )
    // user beralih objek ke B, lalu mengetik dan menekan Save
    rerender(<ItemModal db={null} databaseId={null} editing={B} creating={null} onClose={() => {}} />)
    fireEvent.change(titleInput(), { target: { value: 'Beta edited' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(useItemsStore.getState().items.b3.title).toBe('Beta edited'))
    const items = useItemsStore.getState().items
    expect(items.b3.title).toBe('Beta edited')
    expect(items.a3.title).toBe('Alpha three') // tidak boleh kesenggol
  })
})

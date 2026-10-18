import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import models from '../../public/models/manifest.json'
import textures from '../../public/textures/manifest.json'
import { CreditsDialog } from './Credits'
import { useState } from 'react'

test('the credits page names every texture and model source and the CC BY constellation data', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <div id="layers-panel" style={{ backdropFilter: 'blur(4px)' }}>
        <button onClick={() => setOpen(true)}>Credits</button>
        <CreditsDialog open={open} onClose={() => setOpen(false)} />
      </div>
    )
  }
  const { container } = render(<Harness />)
  const opener = screen.getByRole('button', { name: 'Credits' })
  opener.focus()
  fireEvent.click(opener)
  const dialog = screen.getByRole('dialog', { name: 'Credits' })
  expect(dialog.closest('#layers-panel')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close credits' }))
  const text = dialog.textContent ?? ''
  for (const t of Object.values(textures.textures)) expect(text, t.credit).toContain(t.credit)
  for (const m of Object.values(models.models)) expect(text).toContain(m.credit)
  const licence = dialog.querySelector<HTMLAnchorElement>('a[href="https://creativecommons.org/licenses/by/4.0/"]')
  expect(licence).not.toBeNull()
  expect(text).toMatch(/Marc van der Sluys/)
  expect(text).toMatch(/converted/i)
  expect(text).toMatch(/not affiliated with or endorsed by NASA/i)
  expect(document.querySelectorAll('a[target="_blank"]:not([rel~="noopener"])')).toHaveLength(0)
  void container
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Credits' })).toBeNull()
  expect(document.activeElement).toBe(opener)
})

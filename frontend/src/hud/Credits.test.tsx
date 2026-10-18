import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import models from '../../public/models/manifest.json'
import textures from '../../public/textures/manifest.json'
import { CreditsLink } from './Credits'

test('the credits page names every texture and model source and the CC BY constellation data', () => {
  const { container } = render(<CreditsLink />)
  fireEvent.click(screen.getByRole('button', { name: 'Credits' }))
  const dialog = screen.getByRole('dialog', { name: 'Credits' })
  const text = dialog.textContent ?? ''
  for (const t of Object.values(textures.textures)) expect(text, t.credit).toContain(t.credit)
  for (const m of Object.values(models.models)) expect(text).toContain(m.credit)
  const licence = dialog.querySelector<HTMLAnchorElement>('a[href="https://creativecommons.org/licenses/by/4.0/"]')
  expect(licence).not.toBeNull()
  expect(text).toMatch(/Marc van der Sluys/)
  expect(text).toMatch(/converted/i)
  expect(text).toMatch(/not affiliated with or endorsed by NASA/i)
  expect(container.querySelectorAll('a[target="_blank"]:not([rel~="noopener"])')).toHaveLength(0)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Credits' })).toBeNull()
})

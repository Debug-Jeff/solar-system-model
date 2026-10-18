import { expect, test } from 'vitest'
import { clearSelectionOnPress } from './selection'

test('pressing on the scene clears any highlighted text', () => {
  const text = document.createElement('p')
  text.textContent = 'Jupiter is the largest planet.'
  const canvas = document.createElement('canvas')
  document.body.append(text, canvas)
  const range = document.createRange()
  range.selectNodeContents(text)
  window.getSelection()!.addRange(range)
  expect(window.getSelection()!.toString()).toContain('Jupiter')
  const stop = clearSelectionOnPress(canvas)
  canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  expect(window.getSelection()!.toString()).toBe('')
  stop()
  text.remove()
  canvas.remove()
})

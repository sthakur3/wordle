import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Keyboard from '../src/components/Keyboard.jsx'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

function renderKeyboard({ guesses = [], disabled = false, onKey = vi.fn() } = {}) {
  render(<Keyboard guesses={guesses} disabled={disabled} onKey={onKey} />)
  return { onKey }
}

describe('Keyboard', () => {
  it('renders qwerty rows with Enter and Backspace on the last row', () => {
    renderKeyboard()

    const rows = document.querySelectorAll('.key-row')
    expect(rows).toHaveLength(3)
    expect([...rows[0].querySelectorAll('button')].map((button) => button.textContent))
      .toEqual(ROWS[0].split(''))
    expect([...rows[1].querySelectorAll('button')].map((button) => button.textContent))
      .toEqual(ROWS[1].split(''))
    expect([...rows[2].querySelectorAll('button')].map((button) => button.textContent))
      .toEqual(['Enter', ...ROWS[2].split(''), '⌫'])

    expect(screen.getAllByRole('button')).toHaveLength(28)
    expect(screen.getByRole('button', { name: 'Enter' })).toHaveClass('key', 'wide')
    expect(screen.getByRole('button', { name: 'Backspace' })).toHaveClass('key', 'wide')

    ROWS.join('').split('').forEach((letter) => {
      const key = screen.getByRole('button', { name: letter })
      expect(key).toHaveClass('key')
      expect(key).toBeEnabled()
      expect(key.className).not.toMatch(/absent|present|correct|wide/)
    })
  })

  it('calls onKey with the letter, Enter, or Backspace', async () => {
    const user = userEvent.setup()
    const { onKey } = renderKeyboard()

    await user.click(screen.getByRole('button', { name: 'q' }))
    await user.click(screen.getByRole('button', { name: 'Enter' }))
    await user.click(screen.getByRole('button', { name: 'Backspace' }))

    expect(onKey).toHaveBeenNthCalledWith(1, 'q')
    expect(onKey).toHaveBeenNthCalledWith(2, 'Enter')
    expect(onKey).toHaveBeenNthCalledWith(3, 'Backspace')
    expect(onKey).toHaveBeenCalledTimes(3)
  })

  it('disables every key and ignores clicks when disabled', async () => {
    const user = userEvent.setup()
    const { onKey } = renderKeyboard({ disabled: true })

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(28)
    buttons.forEach((button) => {
      expect(button).toBeDisabled()
    })

    await user.click(screen.getByRole('button', { name: 'a' }))
    await user.click(screen.getByRole('button', { name: 'Enter' }))
    await user.click(screen.getByRole('button', { name: 'Backspace' }))
    expect(onKey).not.toHaveBeenCalled()
  })

  it('colors keys from evaluations and keeps the strongest mark', () => {
    renderKeyboard({
      guesses: [
        {
          word: 'CRANE',
          evaluation: ['correct', 'present', 'absent', 'correct', 'present'],
        },
        {
          word: 'apple',
          evaluation: ['absent', 'present', 'absent', 'absent', 'correct'],
        },
      ],
    })

    expect(screen.getByRole('button', { name: 'c' })).toHaveClass('key', 'correct')
    expect(screen.getByRole('button', { name: 'r' })).toHaveClass('present')
    expect(screen.getByRole('button', { name: 'n' })).toHaveClass('correct')
    expect(screen.getByRole('button', { name: 'a' })).toHaveClass('absent')
    expect(screen.getByRole('button', { name: 'e' })).toHaveClass('correct')
    expect(screen.getByRole('button', { name: 'p' })).toHaveClass('present')
    expect(screen.getByRole('button', { name: 'l' })).toHaveClass('absent')
    expect(screen.getByRole('button', { name: 'q' }).className)
      .not.toMatch(/absent|present|correct/)
  })

  it('ignores evaluation marks it does not recognize', () => {
    renderKeyboard({
      guesses: [{
        word: 'ab',
        evaluation: ['mystery', 'present'],
      }],
    })

    expect(screen.getByRole('button', { name: 'a' }).className)
      .not.toMatch(/absent|present|correct/)
    expect(screen.getByRole('button', { name: 'b' })).toHaveClass('present')
  })
})

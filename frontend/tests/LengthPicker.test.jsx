import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LengthPicker from '../src/components/LengthPicker.jsx'

function renderPicker({ wordLength = 5, busy = false, onChange = vi.fn(), onStart = vi.fn() } = {}) {
  render(
    <LengthPicker
      wordLength={wordLength}
      onChange={onChange}
      onStart={onStart}
      busy={busy}
    />,
  )
  return { onChange, onStart }
}

describe('LengthPicker', () => {
  it('offers word lengths 5 through 8', () => {
    renderPicker()

    const group = screen.getByRole('radiogroup', { name: 'Word length' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      '5',
      '6',
      '7',
      '8',
    ])
  })

  it('marks the selected length and shows how many turns that gives', () => {
    renderPicker({ wordLength: 6 })

    expect(screen.getByRole('radio', { name: '6' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '6' })).toHaveClass('selected')
    for (const length of [5, 7, 8]) {
      const radio = screen.getByRole('radio', { name: String(length) })
      expect(radio).not.toBeChecked()
      expect(radio).not.toHaveClass('selected')
    }
    expect(screen.getByText('You get 7 turns to guess the word.')).toBeInTheDocument()
  })

  it('reports a new length without starting the game', async () => {
    const user = userEvent.setup()
    const { onChange, onStart } = renderPicker({ wordLength: 5 })

    await user.click(screen.getByRole('radio', { name: '8' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(8)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('starts the game from the start button', async () => {
    const user = userEvent.setup()
    const { onStart } = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Start game' }))

    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('disables every control while a game is starting', () => {
    renderPicker({ busy: true })

    screen.getAllByRole('radio').forEach((radio) => {
      expect(radio).toBeDisabled()
    })
    const start = screen.getByRole('button', { name: 'Starting…' })
    expect(start).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Start game' })).not.toBeInTheDocument()
  })
})

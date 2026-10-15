import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import Modal from '../src/components/Modal'

function Harness({ onClose }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <header>
        <button type="button" onClick={() => setOpen(true)}>Open</button>
      </header>
      <main>page</main>
      {open && (
        <Modal
          title="Sure?"
          onClose={onClose ? () => { onClose(); setOpen(false) } : undefined}
          actions={(
            <>
              <button type="button">Yes</button>
              <button type="button" onClick={() => setOpen(false)}>No</button>
            </>
          )}
        >
          <p>details</p>
        </Modal>
      )}
    </div>
  )
}

describe('Modal', () => {
  it('renders an accessible dialog with title, children and actions', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = screen.getByRole('dialog', { name: 'Sure?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('details')
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument()
  })

  it('focuses the first action and makes the rest of the page inert', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    expect(screen.getByRole('button', { name: 'Yes' })).toHaveFocus()
    expect(document.querySelector('header')).toHaveAttribute('inert')
    expect(document.querySelector('main')).toHaveAttribute('inert')
  })

  it('traps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'No' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveFocus()
  })

  it('restores focus and removes inert when it closes', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)

    await user.click(screen.getByRole('button', { name: 'No' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('header')).not.toHaveAttribute('inert')
    expect(opener).toHaveFocus()
  })

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Harness onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape when no onClose is given', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

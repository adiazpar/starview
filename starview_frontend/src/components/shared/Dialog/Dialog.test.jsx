import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dialog from './index';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('dialog focus', () => {
  it('starts on the title, not the close button, when the body has nothing to type into', () => {
    render(<Dialog title="Title" onCancel={vi.fn()}><button>Action</button></Dialog>);
    expect(screen.getByRole('heading', { name: 'Title' })).toHaveFocus();
  });

  it('starts in the first text field', () => {
    render(<Dialog title="Title" onCancel={vi.fn()}><input aria-label="Code" /></Dialog>);
    expect(screen.getByLabelText('Code')).toHaveFocus();
  });

  it('prefers the target a step marks with data-autofocus', () => {
    render(<Dialog title="Title" onCancel={vi.fn()}>
      <input aria-label="Code" /><button data-autofocus>Cancel</button>
    </Dialog>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('restores focus to the opener when it closes', () => {
    function Opener() {
      return <Dialog title="Title" onCancel={vi.fn()}><p>Body</p></Dialog>;
    }
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const view = render(<Opener />);
    expect(screen.getByRole('heading', { name: 'Title' })).toHaveFocus();
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('closes from the close button', () => {
    const onCancel = vi.fn();
    render(<Dialog title="Title" onCancel={onCancel}><p>Body</p></Dialog>);
    fireEvent.click(screen.getByRole('button', { name: 'buttons.close' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('preserves form input when the displayed step changes', () => {
    const content = <input aria-label="Code" defaultValue="" />;
    const view = render(<Dialog title="Title" focusKey="email" onCancel={vi.fn()}>{content}</Dialog>);
    const field = screen.getByLabelText('Code');
    fireEvent.change(field, { target: { value: '123' } });
    view.rerender(<Dialog title="Title" focusKey="confirm" onCancel={vi.fn()}>{content}</Dialog>);
    expect(screen.getByLabelText('Code')).toBe(field);
    expect(field).toHaveValue('123');
  });
});

describe('dialog back navigation', () => {
  it('keeps the X that dismisses unless the owner opts in to a back arrow', () => {
    const onCancel = vi.fn();
    render(<Dialog title="Title" onCancel={onCancel}><p>Body</p></Dialog>);
    const close = screen.getByRole('button', { name: 'buttons.close' });
    expect(close.querySelector('i')).toHaveClass('fa-xmark');
    expect(screen.queryByRole('button', { name: 'buttons.back' })).not.toBeInTheDocument();
    fireEvent.click(close);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('replaces the X with a back arrow that calls onBack and leaves dismissal to the owner', () => {
    const onBack = vi.fn();
    const onCancel = vi.fn();
    render(<Dialog title="Title" onCancel={onCancel} onBack={onBack}><p>Body</p></Dialog>);
    expect(screen.queryByRole('button', { name: 'buttons.close' })).not.toBeInTheDocument();
    const back = screen.getByRole('button', { name: 'buttons.back' });
    expect(back.querySelector('i')).toHaveClass('fa-arrow-left');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).not.toHaveClass('app-dialog--closing');
  });

  it('names the arrow for what it does when the owner says so', () => {
    render(<Dialog title="Title" onCancel={vi.fn()} onBack={vi.fn()} backLabel="Close now"><p>Body</p></Dialog>);
    expect(screen.getByRole('button', { name: 'Close now' })).toBeInTheDocument();
  });

  it('lets an owner use the arrow to dismiss through the same exit as the X', async () => {
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const ref = createRef();
    const onCancel = vi.fn();
    render(<Dialog ref={ref} title="Title" onCancel={onCancel} onBack={() => ref.current.dismiss()}><p>Body</p></Dialog>);
    const dialog = screen.getByRole('dialog');
    dialog.getAnimations = () => [{ finished }];
    fireEvent.click(screen.getByRole('button', { name: 'buttons.back' }));
    expect(dialog).toHaveClass('app-dialog--closing');
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('blocks the arrow while busy and while closing, exactly like the X', async () => {
    const onBack = vi.fn();
    const view = render(<Dialog title="Title" dismissDisabled onCancel={vi.fn()} onBack={onBack}>Body</Dialog>);
    const busyArrow = screen.getByRole('button', { name: 'buttons.back' });
    expect(busyArrow).toBeDisabled();
    fireEvent.click(busyArrow);
    expect(onBack).not.toHaveBeenCalled();
    view.unmount();

    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const ref = createRef();
    render(<Dialog ref={ref} title="Title" onCancel={vi.fn()} onBack={onBack}>Body</Dialog>);
    screen.getByRole('dialog').getAnimations = () => [{ finished }];
    act(() => { ref.current.dismiss(); });
    const closingArrow = screen.getByRole('button', { name: 'buttons.back' });
    expect(closingArrow).toBeDisabled();
    fireEvent.click(closingArrow);
    expect(onBack).not.toHaveBeenCalled();
    await act(async () => { finish(); });
  });

  it('keeps Escape on the dismissal path even when a back arrow is shown', () => {
    const onBack = vi.fn();
    const onCancel = vi.fn();
    render(<Dialog title="Title" onCancel={onCancel} onBack={onBack}>Body</Dialog>);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('dialog dismissal lifecycle', () => {
  it('waits for CSS exit, ignores duplicate closes, and completes once', async () => {
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const onCancel = vi.fn();
    render(<Dialog title="Title" onCancel={onCancel}>Body</Dialog>);
    const dialog = screen.getByRole('dialog');
    dialog.getAnimations = () => [{ finished }];
    fireEvent.click(screen.getByRole('button', { name: 'buttons.close' }));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog).toHaveClass('app-dialog--closing');
    expect(dialog.open).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(false);
  });

  it('keeps X and Escape blocked while busy, but allows completed actions to dismiss', async () => {
    const ref = createRef();
    const onCancel = vi.fn();
    const completed = vi.fn();
    render(<Dialog ref={ref} title="Title" dismissDisabled onCancel={onCancel}>Body</Dialog>);
    expect(screen.getByRole('button', { name: 'buttons.close' })).toBeDisabled();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => { await ref.current.dismiss(completed); });
    expect(completed).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('skips animation waits for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const onCancel = vi.fn();
    render(<Dialog title="Title" onCancel={onCancel}>Body</Dialog>);
    screen.getByRole('dialog').getAnimations = vi.fn(() => [{ finished: new Promise(() => {}) }]);
    fireEvent.click(screen.getByRole('button', { name: 'buttons.close' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not run a queued completion after the owner unmounts', async () => {
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const onCancel = vi.fn();
    const view = render(<Dialog title="Title" onCancel={onCancel}>Body</Dialog>);
    screen.getByRole('dialog').getAnimations = () => [{ finished }];
    fireEvent.click(screen.getByRole('button', { name: 'buttons.close' }));
    view.unmount();
    await act(async () => { finish(); });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('updates keyboard viewport bounds and removes listeners on cleanup', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 740, offsetTop: 0 });
    vi.stubGlobal('visualViewport', viewport);
    const remove = vi.spyOn(viewport, 'removeEventListener');
    const view = render(<Dialog title="Title" onCancel={vi.fn()}>Body</Dialog>);
    const dialog = screen.getByRole('dialog');
    viewport.height = 380;
    viewport.offsetTop = 40;
    viewport.dispatchEvent(new Event('resize'));
    expect(dialog.style.getPropertyValue('--dialog-viewport-height')).toBe('380px');
    expect(dialog.style.getPropertyValue('--dialog-viewport-top')).toBe('40px');
    view.unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});

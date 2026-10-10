/**
 * Switch Component
 *
 * Accessible on/off control (role="switch") for a setting that applies as soon as it is changed.
 * It only reflects `checked` and asks for a change through `onChange(nextChecked)`; it never flips
 * itself, so the owner decides when a change has really happened (for example after a save).
 *
 * Props:
 * - checked: boolean - Current state
 * - onChange: (nextChecked: boolean) => void - Called when the user toggles it
 * - busy: boolean (default: false) - A change is being saved. The switch ignores toggles and is
 *   announced as disabled and busy, but stays focusable so keyboard users keep their place
 * - ...props: Passed to the button (aria-labelledby, aria-describedby, id, ...)
 *
 * Space and Enter toggle it because it is a native button.
 */

import './styles.css';

function Switch({ checked, onChange, busy = false, className = '', ...props }) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      className={className ? `switch ${className}` : 'switch'}
      onClick={() => {
        if (!busy) onChange?.(!checked);
      }}
    >
      <span className="switch__knob" aria-hidden="true" />
    </button>
  );
}

export default Switch;

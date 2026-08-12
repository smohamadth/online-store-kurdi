'use client';

/**
 * Loading indicators.
 *
 * Keyframes (`spin`, `pulse`, `indeterminate`) are defined globally in
 * app/globals.css — NOT in styled-jsx. styled-jsx scopes keyframe names to the
 * component that declares them, so an inline `style={{ animation: 'spin ...' }}`
 * can never resolve one. Keep them global.
 */

interface SpinnerProps {
  /** Diameter in px. */
  size?: number;
  /** Stroke colour of the moving arc. */
  color?: string;
  /** Colour of the static track behind it. */
  trackColor?: string;
  thickness?: number;
  /** Announced to screen readers. */
  label?: string;
}

export function Spinner({
  size = 24,
  color = '#111',
  trackColor = 'rgba(0,0,0,0.12)',
  thickness = 2,
  label = 'Loading',
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: 'inline-block',
        width: `${size}px`,
        height: `${size}px`,
        border: `${thickness}px solid ${trackColor}`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Centred spinner for filling a region (a page body, a panel, a tab).
 */
export function LoadingState({
  message = 'Loading…',
  minHeight = 320,
  size = 34,
}: {
  message?: string | null;
  minHeight?: number | string;
  size?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        padding: '48px 20px',
      }}
    >
      <Spinner size={size} />
      {message && <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>{message}</p>}
    </div>
  );
}

/**
 * Full-screen overlay for blocking actions (placing an order, saving).
 * Renders nothing when inactive so it never traps clicks.
 */
export function LoadingOverlay({
  show,
  message = 'Please wait…',
}: {
  show: boolean;
  message?: string;
}) {
  if (!show) return null;

  return (
    <div
      role="alertdialog"
      aria-busy="true"
      aria-live="assertive"
      aria-label={message}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        zIndex: 9999,
      }}
    >
      <Spinner size={40} thickness={3} />
      <p style={{ fontSize: '15px', fontWeight: 600, color: '#111', margin: 0 }}>{message}</p>
    </div>
  );
}

/**
 * Small spinner sized to sit inside a button next to its label.
 */
export function ButtonSpinner({ color = '#fff' }: { color?: string }) {
  return (
    <Spinner
      size={15}
      thickness={2}
      color={color}
      trackColor="rgba(255,255,255,0.35)"
      label="Working"
    />
  );
}

export default Spinner;

// Toast - the small toast notifications (success/error/info/warning).
// Mechanism: a module-level listener store - addToast() updates the
// shared list and notifies subscribers, so any code can toast without
// prop-drilling; the single <ToastContainer/> (mounted in AppShell)
// renders the current list with auto-dismiss.

'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

// Simple global toast state
let toastListeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

export function addToast(toast: Omit<Toast, 'id'>) {
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newToast = { ...toast, id };
  toasts = [...toasts, newToast];
  toastListeners.forEach(listener => listener(toasts));

  // Auto remove after duration
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    toastListeners.forEach(listener => listener(toasts));
  }, toast.duration || 3000);
}

export function removeToast(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  toastListeners.forEach(listener => listener(toasts));
}

export function ToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([]);

  useEffect(() => {
    toastListeners.push(setCurrentToasts);
    return () => {
      toastListeners = toastListeners.filter(l => l !== setCurrentToasts);
    };
  }, []);

  if (currentToasts.length === 0) return null;

  const getBackgroundColor = (type: Toast['type']) => {
    switch (type) {
      case 'success': return '#22c55e';
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'info': return '#3b82f6';
    }
  };

  const getIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      case 'info': return 'ℹ';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      // Logical anchor: sits on the inline-end edge, so it mirrors to the
      // left in RTL. (A JS dir check would go stale after a client-side
      // language switch; document.dir is the live source of truth.)
      insetInlineEnd: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '360px',
    }}>
      {currentToasts.map(toast => (
        <div
          key={toast.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            backgroundColor: 'var(--card-bg, white)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            // Logical edge: the type-accent stripe mirrors to the right in
            // RTL, matching the mirrored toast anchor.
            borderInlineStart: `4px solid ${getBackgroundColor(toast.type)}`,
            animation: 'slideIn 0.3s ease-out',
            cursor: 'pointer',
          }}
          onClick={() => removeToast(toast.id)}
        >
          <span style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: getBackgroundColor(toast.type),
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 'bold',
            flexShrink: 0,
          }}>
            {getIcon(toast.type)}
          </span>
          <span style={{ fontSize: '14px', color: 'var(--body-text, #111)', flex: 1 }}>
            {toast.message}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); removeToast(toast.id); }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted, #6b7280)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <style jsx>{`
        /* Mirrors globals.css slideIn: the toast enters from its anchored
           (inline-end) edge, so the offset flips with dir via --slide-from. */
        @keyframes slideIn {
          from {
            transform: translateX(var(--slide-from, 100%));
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default ToastContainer;

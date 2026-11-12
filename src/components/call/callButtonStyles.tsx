import React from 'react';

export const accentButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--accent-color, #7C3AED), var(--accent-dark, #5B21B6))',
  color: 'var(--accent-on-color, var(--settings-on-primary, #ffffff))',
};

export const rejectButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--settings-error, #e11d48)',
  color: '#ffffff',
};

export const neutralButtonStyle = (active: boolean): React.CSSProperties => ({
  backgroundColor: active
    ? 'color-mix(in srgb, var(--accent-color, #7C3AED) 18%, var(--surface-container-strong, rgba(255,255,255,0.15)))'
    : 'var(--surface-container-strong, var(--surface-muted, rgba(255,255,255,0.08)))',
  color: active ? 'var(--accent-text, var(--accent-color, #a995ec))' : 'var(--text-main, #dbdee1)',
  border: active
    ? '1px solid color-mix(in srgb, var(--accent-color, #7C3AED) 38%, var(--border-color, transparent))'
    : '1px solid var(--border-color, transparent)',
});

export const StaticBackground = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 0,
      backgroundColor: 'var(--bg-primary)',
    }}
  />
);

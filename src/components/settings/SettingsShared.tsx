import React, { useState, useRef, useEffect, memo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { uiSounds } from '../../utils/uiSounds';
export const QrCodeMiniIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = 'currentColor' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}>
    <path fill={color} d="M5 11h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2m0-6h4v4H5zm0 16h4c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2m0-6h4v4H5zm8-10v4c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2m6 4h-4V5h4zm2 11.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5m-8-7v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5m3.5 1.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5M13 17.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5m2.5 3.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5m2-2h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5m1-6h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5m1 4h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5"/>
  </svg>
);

export const MD3 = {
  bg:            'var(--md-bg,            #211d2f)',
  surface:       'var(--md-surface,       #2a253b)',
  surfaceVar:    'var(--md-surface-var,   #342e47)',
  outline:       'var(--md-outline,       rgba(255,255,255,0.12))',
  outlineMed:    'var(--md-outline-med,   rgba(255,255,255,0.20))',
  onSurface:     'var(--md-on-surface,    #ffffff)',
  onSurfaceVar:  'var(--md-on-surface-var,#9f96b3)',
  primary:       'var(--md-primary,       #9b7dd4)',
  onPrimary:     'var(--md-on-primary,    #ffffff)',
  primaryCont:   'var(--md-primary-cont,  #42345e)',
  error:         'var(--md-error,         #ff595a)',
  errorCont:    'var(--md-error-cont,    rgba(255,89,90,0.12))',
};

export const GLOBAL_CSS = `
  .m3-switch-root {
    position: relative; display: inline-flex;
    align-items: center; width: 52px; height: 32px;
    cursor: pointer; user-select: none;
    -webkit-tap-highlight-color: transparent !important;
    outline: none; flex-shrink: 0;
  }
  .m3-switch-root * {
    -webkit-tap-highlight-color: transparent !important;
  }
  .m3-switch-root input { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }

  .m3-track {
    position: absolute; inset: 0; border-radius: 16px;
    background: var(--switch-bg, rgba(255, 255, 255, 0.12));
    border: 2px solid var(--switch-border, rgba(255, 255, 255, 0.25));
    transition: background 200ms cubic-bezier(0.2, 0, 0, 1), border-color 200ms cubic-bezier(0.2, 0, 0, 1);
    box-sizing: border-box; will-change: background, border-color;
  }
  .m3-switch-root input:checked ~ .m3-track {
    background: var(--accent-color, var(--md-primary, #c5b4e3));
    border-color: var(--accent-color, var(--md-primary, #c5b4e3));
  }

  .m3-thumb-wrap {
    position: absolute; left: 0; top: 4px;
    width: 24px; height: 24px;
    transform: translateX(4px);
    transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
    display: flex; align-items: center; justify-content: center; z-index: 1;
    will-change: transform;
  }
  .m3-switch-root input:checked ~ .m3-track ~ .m3-thumb-wrap { transform: translateX(24px); }

  .m3-thumb {
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--md-on-surface-var, #cac4d0);
    transform: scale(0.6666);
    transition: transform 200ms cubic-bezier(0.2, 0, 0, 1), background 200ms cubic-bezier(0.2, 0, 0, 1);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.35); will-change: transform, background;
  }
  .m3-switch-root input:checked ~ .m3-track ~ .m3-thumb-wrap .m3-thumb {
    transform: scale(1); background: var(--bg-primary, #1c1b1f);
  }
  .m3-switch-root:active .m3-thumb { transform: scale(1.1666); }

  .m3-thumb svg { opacity: 0; transform: scale(0.5); transition: opacity 150ms ease, transform 150ms ease; width: 14px; height: 14px; stroke: var(--accent-color, var(--md-primary, #c5b4e3)); will-change: opacity, transform; }
  .m3-switch-root input:checked ~ .m3-track ~ .m3-thumb-wrap .m3-thumb svg { opacity: 1; transform: scale(1); }

  .m3-switch-root input:focus-visible ~ .m3-track { outline: 2px solid var(--accent-color, #c5b4e3); outline-offset: 2px; }
  .m3-switch-root input:disabled ~ * { opacity: .38; }

  input[type=range] { -webkit-appearance: none; appearance: none; background: transparent; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; border-radius: 50%; background: var(--md-primary); cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.4); margin-top: -8px; }
  input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: transparent; }
  input[type=range]::-moz-range-thumb { width: 20px; height: 20px; border: none; border-radius: 50%; background: var(--md-primary); cursor: pointer; }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse-dot { 0%,100% { opacity:1 } 50% { opacity:.35 } }
  @keyframes qr-glow { 0%,100% { box-shadow: 0 0 20px var(--qr-glow-color, rgba(197,180,227,0.3)); } 50% { box-shadow: 0 0 40px var(--qr-glow-color, rgba(197,180,227,0.5)), 0 0 80px var(--qr-glow-color, rgba(197,180,227,0.15)); } }
  @keyframes badge-in { 0% { opacity:0; transform: scale(0.6) translateY(4px); } 100% { opacity:1; transform: scale(1) translateY(0); } }
  .spin { animation: spin 1s linear infinite; }
  .pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
  .qr-glow-anim { animation: qr-glow 3s ease-in-out infinite; }

  .pill-btn {
    transition: background 150ms, border-color 150ms, color 150ms;
  }
`;

export const TuxAvatar = () => (
  <div
    style={{
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      overflow: 'hidden',
      flexShrink: 0,
      WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000000',
    }}
  >
    <img
      src="./tux.png"
      alt="Tux"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: '50%',
        display: 'block',
      }}
    />
  </div>
);

export const OrbitaLogoAvatar = () => (
  <img
    src="./icons/128x128.png"
    alt="Orbita"
    style={{
      width: '60px',
      height: '60px',
      objectFit: 'contain',
      flexShrink: 0,
      display: 'block',
    }}
  />
);

export const TaskbarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="16" height="14" rx="2" />
    <line x1="2" y1="13" x2="18" y2="13" />
    <line x1="6" y1="15" x2="8" y2="15" />
    <line x1="10" y1="15" x2="14" y2="15" />
  </svg>
);

export const TogglePill = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '7px 18px',
      borderRadius: '20px',
      backgroundColor: 'var(--surface-container, #231e34)',
      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
      color: active ? 'var(--text-main, #ffffff)' : 'var(--text-dim, #8a82a2)',
      fontSize: '13.5px',
      fontWeight: 500,
      cursor: 'pointer',
      userSelect: 'none',
      transition: 'all 150ms ease',
    }}
  >
    <div
      style={{
        width: '17px',
        height: '17px',
        borderRadius: '50%',
        backgroundColor: active ? 'var(--text-main, #ffffff)' : 'transparent',
        border: active ? 'none' : '1.5px solid var(--text-dim, #6b6385)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 150ms ease',
      }}
    >
      {active && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--bg-secondary, #231e34)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2.5 6 5 8.5 9.5 3.5" />
        </svg>
      )}
    </div>
    <span>{label}</span>
  </button>
);

export const SectionHeader = ({ title, style }: { title: string; style?: React.CSSProperties }) => (
  <div
    style={{
      fontSize: 12,
      fontWeight: 600,
      color: MD3.onSurfaceVar,
      padding: '0 20px',
      marginBottom: 8,
      userSelect: 'none',
      letterSpacing: '0.01em',
      ...style,
    }}
  >
    {title}
  </div>
);

export const Block = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <div
    style={{
      backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.04))',
      width: 'calc(100% - 16px)',
      margin: '0 8px',
      borderRadius: '12px',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      padding: '3px',
      boxSizing: 'border-box',
      ...style,
    }}
  >
    {children}
  </div>
);

export const SettingsRow = ({
  label,
  right,
  onClick,
  icon,
}: {
  label: string;
  right?: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
}) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '7px 10px',
      borderRadius: onClick ? '8px' : 0,
      margin: onClick ? '1px 2px' : 0,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background 120ms ease',
      backgroundColor: 'transparent',
      boxSizing: 'border-box',
      userSelect: 'none',
    }}
    onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
    onMouseLeave={e => onClick && ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
      {icon && (
        <div style={{
          width: 20,
          height: 20,
          borderRadius: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-dim, #9ca3af)',
          flexShrink: 0,
          backgroundColor: 'transparent',
        }}>
          {icon}
        </div>
      )}
      <p style={{ fontSize: 13.5, fontWeight: 450, color: MD3.onSurface, margin: 0, lineHeight: 1.35 }}>{label}</p>
    </div>
    {right}
  </div>
);

export const M3Switch = memo(({
  checked, onChange, disabled,
}: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
  <div
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        if (!checked) {
          uiSounds.playSwitchOn();
        } else {
          uiSounds.playSwitchOff();
        }
        onChange();
      }
    }}
    style={{
      width: '42px',
      height: '24px',
      borderRadius: '12px',
      backgroundColor: checked ? 'var(--accent-color, #7C3AED)' : 'var(--switch-bg, rgba(255,255,255,0.14))',
      boxShadow: checked ? 'none' : 'inset 0 0 0 1.5px var(--switch-border, rgba(255,255,255,0.22))',
      position: 'relative',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background-color 200ms ease, box-shadow 200ms ease',
      flexShrink: 0,
      boxSizing: 'border-box',
      opacity: disabled ? 0.38 : 1,
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: '3px',
        left: checked ? '21px' : '3px',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        transition: 'left 200ms cubic-bezier(0.2,0,0,1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
      }}
    />
  </div>
));

export const MenuItem = ({
  icon, label, onClick, rightElement, badge,
}: {
  icon: ReactNode; label: string;
  onClick: () => void; rightElement?: ReactNode; badge?: ReactNode;
}) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '7px 10px',
      borderRadius: '8px',
      margin: '1px 2px',
      cursor: 'pointer',
      transition: 'background 120ms ease',
      backgroundColor: 'transparent',
      boxSizing: 'border-box',
      userSelect: 'none',
    }}
    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
  >
    <div style={{ width: 20, height: 20, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim, #9ca3af)', flexShrink: 0, backgroundColor: 'transparent' }}>
      {icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <p style={{ fontSize: 13.5, fontWeight: 450, color: MD3.onSurface, margin: 0, lineHeight: '18px' }} className="truncate">{label}</p>
        {badge}
      </div>
    </div>
    {rightElement}
  </div>
);





export const PreferencesGroup = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div style={{ marginBottom: 24, width: '100%' }}>
    <div style={{
      fontSize: 12,
      fontWeight: 600,
      color: MD3.onSurfaceVar,
      padding: '0 20px',
      marginBottom: 8,
    }}>
      {title}
    </div>
    <Block style={{ padding: '0 16px' }}>
      {children}
    </Block>
  </div>
);

export const PreferenceSwitch = ({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 0',
    gap: 12,
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{label}</div>
      {description && <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{description}</div>}
    </div>
    <M3Switch checked={checked} onChange={onChange} />
  </div>
);

export interface OrbitaSelectOption {
  value: string;
  label: string;
}

export const OrbitaSelect = ({
  value,
  options,
  onChange,
  ariaLabel,
  minWidth = 160,
  width = 'auto',
}: {
  value: string;
  options: OrbitaSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  minWidth?: number | string;
  width?: number | string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width,
        minWidth,
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (!isOpen) {
            uiSounds.playTick();
          } else {
            uiSounds.playPop();
          }
          setIsOpen(!isOpen);
        }}
        aria-label={ariaLabel || selectedOption?.label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          backgroundColor: MD3.surfaceVar,
          color: MD3.onSurface,
          border: 'none',
          borderRadius: 10,
          padding: '9px 14px',
          fontSize: 13.5,
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'background-color 0.15s ease',
          boxShadow: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = MD3.surfaceVar;
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginRight: 8,
            textAlign: 'left',
          }}
        >
          {selectedOption?.label}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: MD3.onSurfaceVar,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
          }}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            role="listbox"
            aria-label={ariaLabel}
            className="custom-chat-scrollbar"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              width: width === '100%' ? '100%' : 'max-content',
              minWidth: '100%',
              maxWidth: 320,
              maxHeight: 164,
              overflowY: 'auto',
              backgroundColor: 'var(--md-surface, #2a253b)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 10,
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: 4,
              zIndex: 1000,
              boxSizing: 'border-box',
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    uiSounds.playSwitchOn();
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? '#ffffff' : MD3.onSurface,
                    backgroundColor: isSelected ? 'var(--accent-color, #7C3AED)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background-color 0.12s ease',
                    gap: 8,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'rgba(130, 130, 130, 0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {opt.label}
                  </span>
                  {isSelected && (
                    <Check
                      size={15}
                      style={{
                        color: '#ffffff',
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const DeviceSelect = ({
  label,
  value,
  devices,
  defaultLabel,
  onChange,
}: {
  label: string;
  value: string;
  devices: MediaDeviceInfo[];
  defaultLabel: string;
  onChange: (deviceId: string) => void;
}) => {
  const options = [
    { value: '', label: defaultLabel },
    ...devices.map((device, idx) => ({
      value: device.deviceId,
      label: device.label || `${label} ${idx + 1}`,
    })),
  ];

  return (
    <div style={{ padding: '14px 0' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: MD3.onSurfaceVar, marginBottom: 8 }}>
        {label}
      </div>
      <OrbitaSelect
        value={value}
        options={options}
        onChange={onChange}
        ariaLabel={label}
        width="100%"
      />
    </div>
  );
};

export const HotkeySwitch = ({
  enterLabel,
  shiftEnterLabel,
  sendOnEnter,
  onChange,
}: {
  enterLabel: string;
  shiftEnterLabel: string;
  sendOnEnter: boolean;
  onChange: (value: boolean) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 0',
      gap: 8,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: MD3.onSurface }}>{enterLabel}</div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar }}>{t('settings.preferences_enter_desc')}</div>
          </div>
          <M3Switch checked={sendOnEnter} onChange={() => onChange(true)} />
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: MD3.onSurface }}>{shiftEnterLabel}</div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar }}>{t('settings.preferences_shift_enter_desc')}</div>
          </div>
          <M3Switch checked={!sendOnEnter} onChange={() => onChange(false)} />
        </div>
      </div>
    </div>
  );
};

export type TabId = 'main' | 'myAccount' | 'security' | 'connection' | 'chats' | 'calls' | 'font' | 'dataMemory' | 'energy' | 'notifications' | 'language' | 'preferences' | 'password' | 'qrCode' | 'backup' | 'cloudBackup' | 'pcBackup' | 'orbitaKey' | 'folders';

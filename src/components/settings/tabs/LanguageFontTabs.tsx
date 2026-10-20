import { motion } from 'framer-motion';
import { MD3, Block } from '../SettingsShared';
import { FONT_MAP, type FontFamily, type Language } from '../../../store/useChatStore';

interface LanguageTabProps {
  language: Language | null;
  setLanguage: (lang: Language) => void;
  languageDisplayOptions: { value: string; label: string; native?: string }[];
}

export const LanguageTab = ({ language, setLanguage, languageDisplayOptions }: LanguageTabProps) => {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        style={{ padding: '0 0 32px' }}
      >
        <Block>
          {languageDisplayOptions.map((opt) => {
            const isSelected = opt.value === language;
            return (
              <div
                key={opt.value}
                onClick={() => setLanguage(opt.value as Language)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 16px',
                  borderRadius: '12px',
                  margin: '2px 6px',
                  cursor: 'pointer',
                  transition: 'background 150ms',
                  backgroundColor: isSelected ? 'rgba(197,180,227,0.12)' : 'transparent',
                  userSelect: 'none',
                  contentVisibility: 'auto',
                  containIntrinsicSize: '48px',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(202,196,208,0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: `2px solid ${isSelected ? MD3.primary : MD3.outlineMed}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'border-color 150ms',
                  }}
                >
                  {isSelected && (
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: MD3.primary }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: isSelected ? 600 : 400,
                      color: MD3.onSurface,
                    }}
                  >
                    {opt.label}
                  </div>
                  {opt.native && opt.native !== opt.label && (
                    <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{opt.native}</div>
                  )}
                </div>
              </div>
            );
          })}
        </Block>
      </motion.div>
  );
};

interface FontTabProps {
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => void;
  fontOptions: { value: string; label: string; native?: string }[];
}

export const FontTab = ({ fontFamily, setFontFamily, fontOptions }: FontTabProps) => {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        style={{ padding: '0 0 32px' }}
      >
        <Block>
          {fontOptions.map((opt) => {
            const isSelected = opt.value === fontFamily;
            const itemFont = FONT_MAP[opt.value as FontFamily] || 'inherit';
            return (
              <div
                key={opt.value}
                onClick={() => setFontFamily(opt.value as FontFamily)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 16px',
                  borderRadius: '12px',
                  margin: '2px 6px',
                  cursor: 'pointer',
                  transition: 'background 150ms',
                  backgroundColor: isSelected ? 'rgba(197,180,227,0.12)' : 'transparent',
                  userSelect: 'none',
                  contentVisibility: 'auto',
                  containIntrinsicSize: '48px',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(202,196,208,0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: `2px solid ${isSelected ? MD3.primary : MD3.outlineMed}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'border-color 150ms',
                  }}
                >
                  {isSelected && (
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: MD3.primary }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="font-picker-item"
                    style={{
                      fontSize: 15,
                      fontWeight: isSelected ? 600 : 400,
                      color: MD3.onSurface,
                      '--item-font': itemFont,
                    } as React.CSSProperties}
                  >
                    {opt.label}
                  </div>
                  {opt.native && (
                    <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{opt.native}</div>
                  )}
                </div>
              </div>
            );
          })}
        </Block>
      </motion.div>
  );
};

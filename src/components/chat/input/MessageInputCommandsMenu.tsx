import React from 'react';
import { BotIcon } from '../../common/BotIcon';

export interface CommandItem {
  command: string;
  desc: string;
}

interface MessageInputCommandsMenuProps {
  commands: CommandItem[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  onExecute: (cmd: string) => void;
}

export const MessageInputCommandsMenu: React.FC<MessageInputCommandsMenuProps> = ({
  commands,
  selectedIndex,
  onSelectIndex,
  onExecute,
}) => {
  return (
    <div
      role="listbox"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        maxHeight: '136px',
        overflowY: 'auto',
        backgroundColor: 'var(--bg-secondary, #20222b)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '8px',
        pointerEvents: 'auto',
      }}
    >
      {commands.map((cmd, idx) => (
        <div
          key={cmd.command}
          role="option"
          aria-selected={idx === selectedIndex}
          onClick={() => onExecute(cmd.command)}
          onMouseEnter={() => onSelectIndex(idx)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '7px 16px',
            minHeight: '34px',
            cursor: 'pointer',
            backgroundColor: idx === selectedIndex ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            transition: 'background-color 0.1s ease',
          }}
        >
          <BotIcon size={16} className="text-accent" />
          <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-main, #ffffff)', flexShrink: 0 }}>
            {cmd.command}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-dim, rgba(255, 255, 255, 0.5))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cmd.desc}
          </span>
        </div>
      ))}
    </div>
  );
};

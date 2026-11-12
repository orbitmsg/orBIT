import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export const SpoilerSpan: React.FC<{ content: string; isOwn?: boolean }> = ({ content, isOwn = true }) => {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(!revealed);
      }}
      style={{
        filter: revealed ? 'none' : 'blur(4px)',
        backgroundColor: revealed
          ? 'transparent'
          : (isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 22%, transparent)' : 'color-mix(in srgb, var(--text-main) 14%, transparent)'),
        borderRadius: '3px',
        padding: '0 4px',
        cursor: 'pointer',
        transition: 'filter 0.2s ease, background-color 0.2s ease',
        userSelect: revealed ? 'text' : 'none',
      }}
      aria-label={revealed ? undefined : t('chatWindow.clickToShowSpoiler')}
    >
      {content}
    </span>
  );
};

export function renderFormattedInlineText(
  rawText: string,
  themeColor: string,
  onLinkClick?: (url: string) => void,
  isOwn: boolean = true
): React.ReactNode[] {
  const regex = /(\[(.*?)\]\(((?:https?:\/\/|ftp:\/\/|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})[^\s)]*)\)|(?:https?:\/\/|ftp:\/\/)[^\s<>"'\)]+|\b(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})(?:\/[^\s<>"'\)]*)?|(?<![\w@])@[a-zA-Z0-9_]{3,32}\b|\*\*(.*?)\*\*|<b>(.*?)<\/b>|\*(.*?)\*|<i>(.*?)<\/i>|<u>(.*?)<\/u>|~~(.*?)~~|<s>(.*?)<\/s>|`(.*?)`|\|\|(.*?)\|\||<spoiler>(.*?)<\/spoiler>)/gi;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;
  const linkColor = isOwn
    ? 'var(--bubble-own-text, #ffffff)'
    : (themeColor && themeColor !== 'var(--accent-color)' ? themeColor : 'var(--accent-text, var(--accent-color))');

  while ((match = regex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      result.push(rawText.substring(lastIndex, match.index));
    }

    const fullMatch = match[0];
    const mdLinkLabel = match[2];
    const mdLinkUrl = match[3];
    const boldText = match[4] || match[5];
    const italicText = match[6] || match[7];
    const underlineText = match[8];
    const strikeText = match[9] || match[10];
    const codeText = match[11];
    const spoilerText = match[12] || match[13];

    if (fullMatch.startsWith('@')) {
      result.push(
        <a
          key={`mention-${keyCounter++}`}
          href={fullMatch}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onLinkClick) {
              onLinkClick(fullMatch);
            }
          }}
          style={{ color: linkColor, textDecoration: isOwn ? 'underline' : 'none', cursor: 'pointer', fontWeight: 500 }}
        >
          {fullMatch}
        </a>
      );
    } else if (mdLinkLabel && mdLinkUrl) {
      const targetUrl = mdLinkUrl.match(/^(https?:\/\/|ftp:\/\/)/i) ? mdLinkUrl : `http://${mdLinkUrl}`;
      result.push(
        <a
          key={`link-${keyCounter++}`}
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onLinkClick) {
              onLinkClick(targetUrl);
            }
          }}
          style={{ color: linkColor, textDecoration: isOwn ? 'underline' : 'none', cursor: 'pointer' }}
        >
          {mdLinkLabel}
        </a>
      );
    } else if (
      fullMatch.match(/^(https?:\/\/|ftp:\/\/)/i) ||
      fullMatch.match(/^\b(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})/i)
    ) {
      const targetUrl = fullMatch.match(/^(https?:\/\/|ftp:\/\/)/i) ? fullMatch : `http://${fullMatch}`;
      result.push(
        <a
          key={`link-${keyCounter++}`}
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onLinkClick) {
              onLinkClick(targetUrl);
            }
          }}
          style={{ color: linkColor, textDecoration: isOwn ? 'underline' : 'none', cursor: 'pointer' }}
        >
          {fullMatch}
        </a>
      );
    } else if (boldText !== undefined) {
      result.push(<strong key={`bold-${keyCounter++}`}>{boldText}</strong>);
    } else if (italicText !== undefined) {
      result.push(<em key={`italic-${keyCounter++}`}>{italicText}</em>);
    } else if (underlineText !== undefined) {
      result.push(<u key={`underline-${keyCounter++}`}>{underlineText}</u>);
    } else if (strikeText !== undefined) {
      result.push(<del key={`strike-${keyCounter++}`}>{strikeText}</del>);
    } else if (codeText !== undefined) {
      result.push(
        <code
          key={`code-${keyCounter++}`}
          style={{
            backgroundColor: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 16%, transparent)' : 'color-mix(in srgb, var(--text-main) 10%, transparent)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.9em',
          }}
        >
          {codeText}
        </code>
      );
    } else if (spoilerText !== undefined) {
      result.push(<SpoilerSpan key={`spoiler-${keyCounter++}`} content={spoilerText} isOwn={isOwn} />);
    } else {
      result.push(fullMatch);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < rawText.length) {
    result.push(rawText.substring(lastIndex));
  }

  return result;
}

interface MessageTextProps {
  text: string;
  timeNode: React.ReactNode;
  themeColor: string;
  isOwn?: boolean;
  isPinned?: boolean;
  onLinkClick?: (url: string) => void;
}

export const MessageText: React.FC<MessageTextProps> = ({
  text,
  timeNode,
  themeColor,
  isOwn = true,
  isPinned = false,
  onLinkClick,
}) => {
  const processedNodes = useMemo(() => {
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let inQuote = false;
    let quoteLines: string[] = [];

    lines.forEach((line, idx) => {
      if (line.startsWith('> ')) {
        inQuote = true;
        quoteLines.push(line.substring(2));
      } else {
        if (inQuote) {
          nodes.push(
            <blockquote
              key={`quote-${idx}`}
              style={{
                borderLeft: isOwn ? '3px solid var(--bubble-own-text, #ffffff)' : '3px solid var(--accent-text, var(--accent-color, #7C3AED))',
                paddingLeft: '8px',
                margin: '4px 0',
                opacity: 0.95,
              }}
            >
              {renderFormattedInlineText(quoteLines.join('\n'), themeColor, onLinkClick, isOwn)}
            </blockquote>
          );
          quoteLines = [];
          inQuote = false;
        }
        nodes.push(
          <React.Fragment key={`line-${idx}`}>
            {renderFormattedInlineText(line, themeColor, onLinkClick, isOwn)}
            {idx < lines.length - 1 && <br />}
          </React.Fragment>
        );
      }
    });

    if (inQuote && quoteLines.length > 0) {
      nodes.push(
        <blockquote
          key="quote-last"
          style={{
            borderLeft: isOwn ? '3px solid var(--bubble-own-text, #ffffff)' : '3px solid var(--accent-text, var(--accent-color, #7C3AED))',
            paddingLeft: '8px',
            margin: '4px 0',
            opacity: 0.95,
          }}
        >
          {renderFormattedInlineText(quoteLines.join('\n'), themeColor, onLinkClick, isOwn)}
        </blockquote>
      );
    }

    return nodes;
  }, [text, themeColor, onLinkClick, isOwn]);

  const spacerWidth = isOwn ? (isPinned ? '72px' : '60px') : (isPinned ? '52px' : '40px');

  return (
    <div
      className={`select-text ${isOwn ? 'select-text-own' : 'select-text-incoming'}`}
      style={{
        fontSize: 'inherit',
        lineHeight: 1.5,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        width: '100%',
        position: 'relative',
      }}
    >
      <span className="selectable-message-text" style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
        {processedNodes}
        {Boolean(timeNode) && (
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: spacerWidth,
              height: 1,
              pointerEvents: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          />
        )}
      </span>
      {Boolean(timeNode) && (
        <span
          aria-hidden
          className="flex-shrink-0 select-none message-time-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            pointerEvents: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            lineHeight: 1,
            position: 'absolute',
            bottom: '0px',
            right: '0px',
            whiteSpace: 'nowrap',
          }}
        >
          {timeNode}
        </span>
      )}
    </div>
  );
};

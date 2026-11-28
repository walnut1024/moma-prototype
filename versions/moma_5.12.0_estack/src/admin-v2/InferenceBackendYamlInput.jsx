import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Space, Typography } from './xa24/HaloUI.jsx';
import { useChannelText } from './channel-language';
import { backendYamlFieldHints } from './inference-backend';
import { backendYamlCompletion, backendYamlNewline, backendYamlPair } from './inference-backend-yaml-completion';
import { backendYamlSyntax, formatBackendYaml } from './inference-backend-yaml-editing';

function popupPosition(input, container, content, caret) {
  const textPrefix = content.slice(0, caret).split('\n');
  const box = input.getBoundingClientRect();
  const bounds = container.getBoundingClientRect();
  const metrics = getComputedStyle(input);
  const lineHeight = parseFloat(metrics.lineHeight) || 21;
  const characterWidth = parseFloat(metrics.fontSize) * 0.6 || 8;
  const y = Math.max(0, box.top - bounds.top + parseFloat(metrics.paddingTop) + (textPrefix.length - 1) * lineHeight - input.scrollTop);
  const x = box.left - bounds.left + parseFloat(metrics.paddingLeft) + textPrefix.at(-1).length * characterWidth - input.scrollLeft;
  const above = y + lineHeight + 180 > bounds.height && y >= 180;
  return {
    top: Math.min(above ? y : y + lineHeight, bounds.height - lineHeight),
    left: Math.max(0, Math.min(x, bounds.width - 320)),
    transform: above ? 'translateY(-100%)' : undefined,
  };
}

function syncMirrorScroll(mirror, input) {
  if (mirror?.firstElementChild) mirror.firstElementChild.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
}

function formattedPosition(content, lines, position) {
  const prefix = content.slice(0, position).split('\n');
  const index = prefix.length - 1;
  const start = lines.slice(0, index).reduce((total, line) => total + line.length + 1, 0);
  return start + Math.min(prefix.at(-1).length, lines[index].length);
}

export default function InferenceBackendYamlInput({ row, inputRef, value, onChange, onBlur, onFormatIssue, onSuggestionsChange, busy, hintId, errorId, invalid }) {
  const t = useChannelText();
  const schema = useMemo(() => backendYamlFieldHints(row), [row]);
  const listId = useId();
  const shortcutId = useId();
  const container = useRef(null);
  const mirror = useRef(null);
  const gutter = useRef(null);
  const list = useRef(null);
  const suggestionRef = useRef(null);
  const edit = useRef(null);
  const composing = useRef(false);
  const [suggestion, setSuggestion] = useState(null);
  const [active, setActive] = useState(0);
  const [inComposition, setInComposition] = useState(false);
  const [formatStatus, setFormatStatus] = useState('');
  const lineCount = value.split('\n', 1001).length;
  const showLineNumbers = value.length <= 128 * 1024 && lineCount <= 1000;
  const syntax = useMemo(() => showLineNumbers && !inComposition && !busy ? backendYamlSyntax(value) : null, [value, showLineNumbers, inComposition, busy]);
  const mirrorEnabled = syntax !== null;

  useLayoutEffect(() => {
    const frame = mirror.current;
    const input = inputRef.current;
    if (!mirrorEnabled || !frame || !input) return;
    const sync = () => {
      const area = container.current.getBoundingClientRect();
      const box = input.getBoundingClientRect();
      const metrics = getComputedStyle(input);
      Object.assign(frame.style, {
        top: `${box.top - area.top}px`, left: `${box.left - area.left}px`, width: `${input.clientWidth}px`, height: `${input.clientHeight}px`,
      });
      for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize', 'padding']) {
        frame.firstElementChild.style[property] = metrics[property];
      }
      syncMirrorScroll(frame, input);
    };
    sync();
    const resize = new ResizeObserver(sync);
    resize.observe(input);
    return () => resize.disconnect();
  }, [inputRef, mirrorEnabled, showLineNumbers]);
  useLayoutEffect(() => {
    const box = list.current;
    const item = box?.children[active];
    if (!item) return;
    if (item.offsetTop < box.scrollTop) box.scrollTop = item.offsetTop;
    const end = item.offsetTop + item.offsetHeight - box.clientHeight;
    if (end > box.scrollTop) box.scrollTop = end;
  }, [active, suggestion]);

  const setSuggestions = next => {
    suggestionRef.current = next;
    setSuggestion(next);
    onSuggestionsChange(Boolean(next));
    if (next) setActive(0);
  };

  const suggest = (content, explicit = false) => {
    const input = inputRef.current;
    const next = !composing.current && input.selectionStart === input.selectionEnd
      ? backendYamlCompletion(content, input.selectionStart, schema, { explicit }) : null;
    setSuggestions(next ? { ...next, position: popupPosition(input, container.current, content, next.caret) } : null);
  };

  const change = (content, event) => {
    onChange(content);
    setFormatStatus('');
    if (edit.current) {
      edit.current.changed = true;
      return;
    }
    const inputType = event?.nativeEvent?.inputType;
    if (!event?.nativeEvent?.isComposing && ['insertText', 'deleteContentBackward', 'deleteContentForward'].includes(inputType)) suggest(content);
    else setSuggestions(null);
  };

  const insertText = (start, end, text, selection) => {
    const input = inputRef.current;
    input.focus();
    input.setSelectionRange(start, end);
    edit.current = { changed: false };
    // Editing commands preserve native undo; replace only this range if unavailable.
    if (!document.queryCommandSupported?.('insertText') || !document.execCommand('insertText', false, text)) {
      input.setRangeText(text, start, end, 'end');
    }
    if (!edit.current.changed) onChange(input.value);
    edit.current = null;
    if (selection) input.setSelectionRange(...selection);
    setSuggestions(null);
  };

  const accept = option => {
    const input = inputRef.current;
    if (!option || !suggestion || input.selectionStart !== suggestion.caret || input.selectionEnd !== suggestion.caret) return false;
    insertText(suggestion.start, suggestion.end, option.insert);
    return true;
  };

  const format = () => {
    const input = inputRef.current;
    if (!input || busy || composing.current) return;
    const { value: content, selectionStart, selectionEnd } = input;
    setFormatStatus('');
    setSuggestions(null);
    try {
      const result = formatBackendYaml(content);
      if (result === content) {
        setFormatStatus('YAML 无需格式化。');
        return;
      }
      const lines = result.split('\n');
      const selection = [selectionStart, selectionEnd].map(offset => formattedPosition(content, lines, offset));
      insertText(0, content.length, result, selection);
      setFormatStatus('YAML 已格式化。');
    } catch (issue) { onFormatIssue(issue); }
  };

  const keyDown = event => {
    const { key, nativeEvent, ctrlKey, metaKey, altKey, shiftKey, currentTarget: input } = event;
    if (composing.current || nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
    if (shiftKey && (altKey && nativeEvent.code === 'KeyF' || ctrlKey && nativeEvent.code === 'KeyI')) {
      event.preventDefault();
      format();
      return;
    }
    if ((ctrlKey || metaKey) && key === ' ' && !altKey && !shiftKey) {
      event.preventDefault();
      suggest(input.value, true);
      return;
    }
    if (ctrlKey || metaKey || altKey || shiftKey && ['Tab', 'Enter', 'ArrowUp', 'ArrowDown'].includes(key)) return;
    if (suggestion && key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setSuggestions(null);
      return;
    }
    if (suggestion && ['ArrowUp', 'ArrowDown'].includes(key)) {
      event.preventDefault();
      const count = suggestion.options.length;
      setActive(index => (index + (key === 'ArrowDown' ? 1 : count - 1)) % count);
      return;
    }
    if (suggestion && ['Enter', 'Tab'].includes(key)) {
      if (accept(suggestion.options[active])) event.preventDefault();
      return;
    }
    const { selectionStart: start, selectionEnd: end } = input;
    if (key === 'Enter') {
      const newline = backendYamlNewline(input.value, start);
      if (newline !== '\n') {
        event.preventDefault();
        insertText(start, end, newline);
      }
      return;
    }
    if (start === end && /^[\]})'"]$/.test(key) && input.value[start] === key) {
      event.preventDefault();
      input.setSelectionRange(start + 1, start + 1);
      setSuggestions(null);
      return;
    }
    const pair = backendYamlPair(input.value, start, end, key);
    if (pair) {
      event.preventDefault();
      insertText(start, end, pair.insert, pair.selection);
    }
  };

  return <div className={`inference-yaml-input${mirrorEnabled ? ' inference-yaml-input-colored' : ''}`} ref={container}>
    <div className="inference-yaml-surface">
      {showLineNumbers && <div className="inference-yaml-gutter" aria-hidden="true"><pre ref={gutter}>
        {Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')}
      </pre></div>}
      <textarea ref={inputRef} aria-label={t('YAML 配置')} className="inference-backend-yaml" spellCheck={false}
      rows={18} wrap="off" disabled={busy} value={value}
      onChange={event => change(event.target.value, event)} onKeyDown={keyDown} onBlur={() => { setSuggestions(null); onBlur(); }}
      onCompositionStart={() => { composing.current = true; setInComposition(true); setSuggestions(null); }}
      onCompositionEnd={() => { composing.current = false; setInComposition(false); }}
      onScroll={event => {
        syncMirrorScroll(mirror.current, event.currentTarget);
        if (gutter.current) gutter.current.style.transform = `translateY(${-event.currentTarget.scrollTop}px)`;
        if (suggestionRef.current) setSuggestions(null);
      }}
      onSelect={event => {
        const input = event.currentTarget;
        const caret = suggestionRef.current?.caret;
        if (caret != null && (input.selectionStart !== caret || input.selectionEnd !== caret)) setSuggestions(null);
      }}
      aria-invalid={invalid} aria-details={hintId}
      aria-describedby={invalid ? `${errorId} ${shortcutId}` : shortcutId} aria-keyshortcuts="Control+Space Meta+Space Alt+Shift+F Control+Shift+I"
      aria-autocomplete="list" aria-controls={suggestion ? listId : undefined}
      aria-activedescendant={suggestion ? `${listId}-${active}` : undefined}/>
    </div>
    {syntax && <div className="inference-yaml-syntax" ref={mirror} aria-hidden="true">
      <pre>{syntax.map(([token, tone], index) => tone ? <span key={index} data-yaml-tone={tone}>{token}</span> : token)}</pre>
    </div>}
    <Space wrap>
      <Typography.Text type="tertiary" size="small" id={shortcutId}>{t('按 Ctrl+空格显示 YAML 补全。')}</Typography.Text>
      <Button type="tertiary" theme="borderless" size="small" htmlType="button" disabled={busy} onClick={format}>{t('格式化 YAML')}</Button>
      <Typography.Text type="tertiary" size="small" role="status">{formatStatus && t(formatStatus)}</Typography.Text>
    </Space>
    {suggestion && <ul className="inference-yaml-suggestions" id={listId} role="listbox" aria-label={t('YAML 补全')} style={suggestion.position} ref={list}>
      {suggestion.options.map(({ label, type }, index) => <li key={label} id={`${listId}-${index}`} role="option" aria-selected={active === index}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => accept(suggestion.options[index])}>
        <Typography.Text code>{label}</Typography.Text>{type && <Typography.Text type="tertiary" size="small">{t(type)}</Typography.Text>}
      </li>)}
    </ul>}
  </div>;
}

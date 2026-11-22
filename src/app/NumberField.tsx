import { useEffect, useState } from 'react';

interface Props {
  value: number;
  onChange: (n: number) => void;
  label: string;
  prefix?: string;
  suffix?: string;
  max?: number;
  step?: number;
  className?: string;
  hideLabel?: boolean;
}

/**
 * Numeric input that keeps the raw text while typing ("12." stays "12.")
 * and only reports clean, clamped numbers upward.
 */
export function NumberField({ value, onChange, label, prefix, suffix, max, step = 1, className, hideLabel }: Props) {
  const [text, setText] = useState(String(value ?? 0));

  useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const invalid = text.trim() !== '' && !Number.isFinite(parseFloat(text));

  return (
    <label className={`numfield ${invalid ? 'is-invalid' : ''} ${className ?? ''}`}>
      <span className={hideLabel ? 'sr-only' : 'numfield-label'}>{label}</span>
      <span className="numfield-box">
        {prefix && <span className="numfield-affix">{prefix}</span>}
        <input
          inputMode="decimal"
          type="text"
          value={text}
          aria-invalid={invalid}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.]/g, '');
            setText(raw);
            let n = parseFloat(raw);
            if (!Number.isFinite(n) || n < 0) n = 0;
            if (max !== undefined) n = Math.min(n, max);
            onChange(n);
          }}
          onBlur={() => setText(String(value))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              let n = value + (e.key === 'ArrowUp' ? step : -step);
              n = Math.max(0, max !== undefined ? Math.min(n, max) : n);
              onChange(Math.round(n * 100) / 100);
            }
          }}
        />
        {suffix && <span className="numfield-affix">{suffix}</span>}
      </span>
    </label>
  );
}

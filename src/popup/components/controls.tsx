import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Unavailable } from './Unavailable';

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  // A switch tile on the home menu; otherwise a settings row with a checkbox.
  tile?: boolean;
  // Why the toggle is unavailable, shown on hover and focus.
  reason?: string;
}

// A labelled checkbox row, or a switch tile.
export function Toggle({ label, checked, onChange, tile, reason = '', disabled, ...input }: ToggleProps) {
  const name = typeof label === 'string' ? label : String(input['aria-label'] ?? '');
  return (
    <label className={tile ? 'switch-tile' : undefined}>
      <span>{label}</span>
      <Unavailable reason={reason} label={name}>
        <input type="checkbox" role={tile ? 'switch' : undefined} checked={checked} disabled={Boolean(reason) || disabled} onChange={event => onChange(event.target.checked)} {...input} />
      </Unavailable>
    </label>
  );
}

export type Option<T extends string> = readonly [value: T, text: string];

interface SegmentedProps<T extends string> {
  // Radio group name, unique in the popup.
  name: string;
  // Visible legend above the switches.
  legend: string;
  // Prefix of each switch's accessible name: "<label>: <option>".
  label: string;
  // Overrides an option's accessible name.
  optionLabel?: (value: T, text: string) => string;
  options: readonly Option<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  describedBy?: string;
  reason?: string;
  // Extra attributes for each radio, such as data hooks.
  inputProps?: (value: T) => Record<string, string>;
  className?: string;
}

// Side-by-side switches for one choice, like the canvas row layout.
export function Segmented<T extends string>({ name, legend, label, optionLabel = (_value, text) => label + ': ' + text, options, value, onChange, describedBy, reason = '', inputProps, className = 'row-section' }: SegmentedProps<T>) {
  return (
    <fieldset className={className} aria-describedby={describedBy}>
      <legend>{legend}</legend>
      <div className="segments">
        {options.map(([option, text]) => (
          <Unavailable key={option} as="label" reason={reason} label={optionLabel(option, text)}>
            <input type="radio" name={name} value={option} checked={value === option} disabled={Boolean(reason)} aria-label={optionLabel(option, text)} onChange={() => onChange(option)} {...inputProps?.(option)} />
            <span>{text}</span>
          </Unavailable>
        ))}
      </div>
    </fieldset>
  );
}

interface SelectProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  id: string;
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  // Inline puts the label and select on one row; stacked puts the label above.
  inline?: boolean;
  reason?: string;
}

export function Select<T extends string>({ id, label, options, value, onChange, inline, reason = '', ...select }: SelectProps<T>) {
  const control = (
    <Unavailable reason={reason} label={label}>
      <select id={id} value={value} disabled={Boolean(reason)} onChange={event => onChange(event.target.value as T)} {...(inline ? { 'aria-label': label } : {})} {...select}>
        {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
      </select>
    </Unavailable>
  );
  if (inline) return <label><span>{label}</span>{control}</label>;
  return <><label htmlFor={id}>{label}</label>{control}</>;
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  reason?: string;
}

// A stacked label and text input.
export function TextField({ id, label, reason = '', disabled, ...input }: TextFieldProps) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <Unavailable reason={reason} label={label}>
        <input id={id} type="text" autoComplete="off" {...input} disabled={Boolean(reason) || disabled} />
      </Unavailable>
    </>
  );
}

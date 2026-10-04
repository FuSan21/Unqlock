import { useId, useRef, type ElementType, type ReactNode } from 'react';

interface UnavailableProps {
  // Why the control is disabled; empty when it is available.
  reason: string;
  // The control's name, read out as "Why <label> is unavailable".
  label: string;
  children: ReactNode;
  // Segmented options use their own label as the wrapper; other controls get a span.
  as?: ElementType;
  className?: string;
}

// Wraps a control that can be disabled with a reason. The wrapper takes focus and shows the reason
// as a tooltip, because a disabled control can neither be focused nor show its own title.
// Once a control has had a reason, it keeps the wrapper, so it never remounts and loses focus.
export function Unavailable({ reason, label, children, as: Tag = 'span', className }: UnavailableProps) {
  const hintId = useId();
  const wrapper = useRef<HTMLElement>(null);
  const hint = useRef<HTMLSpanElement>(null);
  const wrapped = useRef(false);
  if (reason) wrapped.current = true;
  if (!wrapped.current && Tag === 'span') return <>{children}</>;
  const place = () => requestAnimationFrame(() => {
    if (!wrapper.current || !hint.current) return;
    const viewport = Math.min(innerWidth, document.body.clientWidth);
    hint.current.style.width = Math.min(240, viewport - 24) + 'px';
    const rect = wrapper.current.getBoundingClientRect();
    hint.current.style.left = Math.max(12, Math.min(rect.left, viewport - hint.current.offsetWidth - 12)) + 'px';
    const above = rect.top - hint.current.offsetHeight - 6;
    hint.current.style.top = Math.max(8, above >= 8 ? above : Math.min(rect.bottom + 6, innerHeight - hint.current.offsetHeight - 8)) + 'px';
  });
  const classes = [className, wrapped.current && 'disabled-explanation', reason && 'has-reason'].filter(Boolean).join(' ') || undefined;
  return (
    <Tag
      ref={wrapper}
      className={classes}
      tabIndex={reason ? 0 : undefined}
      aria-describedby={reason ? hintId : undefined}
      aria-label={reason ? 'Why ' + label + ' is unavailable' : undefined}
      onMouseEnter={wrapped.current ? place : undefined}
      onFocus={wrapped.current ? place : undefined}
    >
      {children}
      {/* Referenced descriptions remain available without becoming part of a parent label's name. */}
      {wrapped.current && <span ref={hint} id={hintId} className="disabled-hint" role="tooltip" aria-hidden="true">{reason}</span>}
    </Tag>
  );
}

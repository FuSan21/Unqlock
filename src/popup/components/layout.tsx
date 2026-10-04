import { useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { usePages, type PageId } from '../pages';
import { Unavailable } from './Unavailable';

interface PageProps {
  id: PageId;
  title: string;
  titleId: string;
  children: ReactNode;
}

// A feature page: a back button, a focusable title and the page's content.
export function Page({ id, title, titleId, children }: PageProps) {
  const { current, visit, back } = usePages();
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = current === id;
  useEffect(() => {
    if (shown) heading.current?.focus();
  }, [shown, visit]);
  return (
    <section id={id} className="page" aria-labelledby={titleId} hidden={!shown}>
      <button className="page-back" type="button" onClick={() => back()}>‹ Home</button>
      <h2 ref={heading} id={titleId} className="page-title" tabIndex={-1}>{title}</h2>
      {children}
    </section>
  );
}

interface FeatureEntryProps {
  id: string;
  page: PageId;
  icon: ReactNode;
  title: string;
  description: string;
}

// A home menu entry that opens a page.
export function FeatureEntry({ id, page, icon, title, description }: FeatureEntryProps) {
  const { open } = usePages();
  return (
    <button id={id} className="feature-entry" type="button" data-page={page} aria-controls={page} onClick={event => open(page, event.currentTarget)}>
      <span className="sample" aria-hidden="true">{icon}</span>
      <span><strong>{title}</strong><span className="feature-description">{description}</span></span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

export const MenuHeading = ({ children }: { children: ReactNode }) => <h2 className="menu-heading">{children}</h2>;
export const SettingsHeading = ({ children }: { children: ReactNode }) => <h3 className="settings-heading">{children}</h3>;

export function Note({ children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className="note" {...props}>{children}</p>;
}

// A polite live region for save and load results.
export function Status({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p role="status" aria-live="polite" className={className} {...props}>{children}</p>;
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="action-row">{children}</div>;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'link';
  // Why the button is unavailable, shown on hover and focus.
  reason?: string;
  // The name used in "Why … is unavailable"; defaults to the button's aria-label or text.
  name?: string;
}

export function Button({ variant, reason = '', name, className, disabled, children, ...props }: ButtonProps) {
  const classes = [variant === 'primary' ? 'primary' : variant === 'link' ? 'link-button' : '', className].filter(Boolean).join(' ') || undefined;
  return (
    <Unavailable reason={reason} label={name ?? props['aria-label'] ?? (typeof children === 'string' ? children : '')}>
      <button type="button" className={classes} disabled={Boolean(reason) || disabled} {...props}>{children}</button>
    </Unavailable>
  );
}

// A titled group of settings for one item, such as one builder panel.
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel-settings-card"><h3>{title}</h3>{children}</section>;
}

// A page's reset button and save status.
export function PageFooter({ resetId, resetText, statusId, status, busy, onReset }: { resetId: string; resetText: string; statusId: string; status: string; busy: boolean; onReset: () => void }) {
  return (
    <footer>
      <button id={resetId} type="button" disabled={busy} onClick={onReset}>{resetText}</button>
      <span id={statusId} className="appearance-status" role="status" aria-live="polite">{status}</span>
    </footer>
  );
}

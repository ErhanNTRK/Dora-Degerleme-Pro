import { useState, type ReactNode } from 'react';
import { ChevronDownIcon } from './icons';

interface AccordionProps {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  badge?: ReactNode;
}

export function Accordion({ title, defaultOpen = false, children, badge }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="accordion">
      <button type="button" className="accordion__header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="accordion__title">
          {title}
          {badge}
        </span>
        <span className={`accordion__chevron${open ? ' accordion__chevron--open' : ''}`}>
          <ChevronDownIcon width={18} height={18} />
        </span>
      </button>
      {open && <div className="accordion__body">{children}</div>}
    </div>
  );
}

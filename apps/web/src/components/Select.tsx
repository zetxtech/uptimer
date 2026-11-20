import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from './ui';

type SelectOption = {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
};

export interface SelectProps {
  /** Current value. Numbers are compared as strings so numeric options keep working. */
  value?: string | number | null | undefined;
  /** Receives the raw option value as a string. */
  onChange?: (value: string) => void;
  /** `<option>` elements, matching the native API so migrations stay small. */
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /** Shown when the current value does not match any option. */
  placeholder?: string;
}

const POPUP_MAX_HEIGHT = 288;
const POPUP_MAX_WIDTH = 360;
const POPUP_GAP = 6;
const VIEWPORT_MARGIN = 8;

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return '';
}

function collectOptions(children: ReactNode, out: SelectOption[] = []): SelectOption[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;

    if (child.type === 'option') {
      const props = child.props as {
        value?: string | number;
        disabled?: boolean;
        children?: ReactNode;
      };
      const label = props.children;
      const text = textOf(label);
      out.push({
        value: props.value === undefined ? text : String(props.value),
        label,
        text,
        disabled: Boolean(props.disabled),
      });
      return;
    }

    // Support `<optgroup>` (and fragments) by flattening their options.
    const nested = (child.props as { children?: ReactNode }).children;
    if (nested !== undefined) collectOptions(nested, out);
  });

  return out;
}

type PopupRect = {
  /** Viewport coordinates of the trigger box the popup hangs off. */
  anchorTop: number;
  anchorBottom: number;
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  maxWidth: number;
};

/**
 * App-styled dropdown that replaces the browser's native `<select>` popup.
 *
 * The option list is rendered in a portal with fixed positioning, so it is never clipped by the
 * scroll container of a modal, and it keeps the native keyboard model (arrows, Home/End, Enter,
 * Escape, Tab) plus `role="listbox"` semantics.
 */
export function Select({
  value,
  onChange,
  children,
  className,
  disabled = false,
  id,
  name,
  placeholder,
  ...aria
}: SelectProps) {
  const options = useMemo(() => collectOptions(children), [children]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<PopupRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const listId = useId();
  const selectedIndex = options.findIndex((option) => option.value === String(value ?? ''));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback(() => {
    setOpen(false);
    setRect(null);
  }, []);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const box = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - box.bottom - POPUP_GAP - VIEWPORT_MARGIN;

    setRect({
      anchorTop: box.top,
      anchorBottom: box.bottom,
      // Provisional anchor directly under the trigger; the layout effect below re-anchors with the
      // popup's real height before the first paint.
      top: box.bottom + POPUP_GAP,
      left: Math.min(
        Math.max(box.left, VIEWPORT_MARGIN),
        Math.max(VIEWPORT_MARGIN, window.innerWidth - box.width - VIEWPORT_MARGIN),
      ),
      width: box.width,
      maxHeight: Math.min(POPUP_MAX_HEIGHT, Math.max(120, spaceBelow)),
      maxWidth: Math.min(POPUP_MAX_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [measure, open]);

  // Anchor with the popup's real size: it hangs directly under the trigger when it fits there and
  // flips directly above it otherwise, always staying inside the viewport. Using `POPUP_MAX_HEIGHT`
  // here instead of the measured height left the popup floating far away from the trigger.
  useLayoutEffect(() => {
    if (!open || !rect) return;
    const popup = popupRef.current;
    if (!popup) return;

    // `scrollHeight` excludes the popup border, so add it back before anchoring.
    const border = Math.max(0, popup.offsetHeight - popup.clientHeight);
    const contentHeight = Math.min(popup.scrollHeight + border, POPUP_MAX_HEIGHT);
    const spaceBelow = window.innerHeight - rect.anchorBottom - POPUP_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.anchorTop - POPUP_GAP - VIEWPORT_MARGIN;
    const placeBelow = spaceBelow >= contentHeight || spaceAbove < spaceBelow;
    const available = Math.max(120, placeBelow ? spaceBelow : spaceAbove);
    const height = Math.min(contentHeight, available);
    const top = placeBelow ? rect.anchorBottom + POPUP_GAP : rect.anchorTop - POPUP_GAP - height;
    const clampedTop = Math.min(
      Math.max(top, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN),
    );
    const maxLeft = window.innerWidth - popup.offsetWidth - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));

    const maxHeight = Math.min(POPUP_MAX_HEIGHT, available);
    if (
      Math.round(clampedTop) !== Math.round(rect.top) ||
      Math.round(left) !== Math.round(rect.left) ||
      Math.round(maxHeight) !== Math.round(rect.maxHeight)
    ) {
      setRect({ ...rect, top: clampedTop, left, maxHeight });
    }
  }, [open, rect]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    const onReflow = (event: Event) => {
      // Scrolling inside the popup itself must not re-measure (and never moves the page).
      const target = event.target as Node | null;
      if (target && popupRef.current?.contains(target)) return;
      measure();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [close, measure, open]);

  useEffect(() => {
    if (!open) return;
    const container = popupRef.current;
    const node = container?.querySelector<HTMLElement>('[data-highlighted="true"]');
    if (!container || !node) return;

    // Scroll only the popup itself: `scrollIntoView` would also scroll the page/modal behind it.
    const nodeTop = node.offsetTop;
    const nodeBottom = nodeTop + node.offsetHeight;
    if (nodeTop < container.scrollTop) {
      container.scrollTop = nodeTop;
    } else if (nodeBottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = nodeBottom - container.clientHeight;
    }
  }, [highlight, open]);

  const moveHighlight = (direction: 1 | -1) => {
    if (options.length === 0) return;
    let next = highlight;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]?.disabled) break;
    }
    setHighlight(next);
  };

  const commit = (option: SelectOption | undefined) => {
    if (!option || option.disabled) return;
    onChange?.(option.value);
    close();
    triggerRef.current?.focus();
  };

  const openPopup = () => {
    if (disabled) return;
    const enabledFallback = options.findIndex((option) => !option.disabled);
    setHighlight(
      selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : Math.max(0, enabledFallback),
    );
    setOpen(true);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) {
          openPopup();
          return;
        }
        moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      case 'Home':
      case 'End': {
        if (!open) return;
        event.preventDefault();
        setHighlight(event.key === 'Home' ? 0 : options.length - 1);
        return;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (!open) {
          openPopup();
          return;
        }
        commit(options[highlight]);
        return;
      }
      case 'Escape': {
        if (!open) return;
        event.preventDefault();
        close();
        return;
      }
      case 'Tab': {
        if (open) close();
        return;
      }
      default:
        return;
    }
  };

  const activeOption = open ? options[highlight] : undefined;

  return (
    <>
      <button
        {...aria}
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeOption ? `${listId}-${highlight}` : undefined}
        className={cn('ui-select ui-select-trigger', className)}
        onClick={() => (open ? close() : openPopup())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span
          className={cn('ui-select-trigger-label', !selected && 'ui-select-trigger-placeholder')}
        >
          {selected ? selected.label : (placeholder ?? '')}
        </span>
        <span aria-hidden="true" className="ui-select-chevron">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="m5.5 8 4.5 4.5L14.5 8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {name ? <input type="hidden" name={name} value={String(value ?? '')} /> : null}

      {open && rect
        ? createPortal(
            <div
              ref={popupRef}
              id={listId}
              role="listbox"
              aria-labelledby={aria['aria-labelledby']}
              aria-label={aria['aria-label']}
              className="ui-select-popup"
              style={{
                top: `${rect.top}px`,
                left: `${rect.left}px`,
                minWidth: `${rect.width}px`,
                maxWidth: `${rect.maxWidth}px`,
                maxHeight: `${rect.maxHeight}px`,
              }}
            >
              {options.map((option, index) => (
                <div
                  key={`${option.value}-${index}`}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-disabled={option.disabled || undefined}
                  data-highlighted={index === highlight ? 'true' : undefined}
                  className={cn(
                    'ui-select-option',
                    index === highlight && 'ui-select-option-highlighted',
                    option.disabled && 'ui-select-option-disabled',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => commit(option)}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'ui-select-option-check',
                      index !== selectedIndex && 'ui-select-option-check-empty',
                    )}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="m5 10.5 3.2 3.2L15 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="ui-select-option-label">{option.label}</span>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

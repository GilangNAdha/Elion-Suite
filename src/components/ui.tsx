import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'
import type { ReactNode, CSSProperties, ButtonHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { X, Check } from 'lucide-react'
import { uid } from '../lib/types'

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft'

export function Button({
  variant = 'outline',
  size = 'md',
  icon,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  icon?: ReactNode
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-token-sm font-medium transition-colors duration-150 select-none disabled:opacity-40 disabled:pointer-events-none focus-ring'
  const sizes = size === 'sm' ? 'h-7 px-2.5 text-[0.85em]' : 'h-9 px-3.5'
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-primary-on hover:opacity-90',
    outline: 'border border-line bg-surface/40 hover:bg-raised text-ink',
    ghost: 'text-ink-muted hover:text-ink hover:bg-raised',
    soft: 'bg-primary-soft text-primary hover:opacity-80',
    danger: 'bg-bad/15 text-bad hover:bg-bad/25'
  }
  return (
    <button className={`${base} ${sizes} ${variants[variant]} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export function IconBtn({
  label,
  active = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`focus-ring inline-flex h-8 w-8 items-center justify-center rounded-token-sm transition-colors duration-150 ${
        active ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:text-ink hover:bg-raised'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Status pill — the atomic scannable unit (§4), theme-aware
// ---------------------------------------------------------------------------

export function StatusPill({
  color,
  label,
  small = false,
  className = ''
}: {
  color: string
  label: string
  small?: boolean
  className?: string
}) {
  const style: CSSProperties & Record<string, string> = { '--pill': color }
  return (
    <span
      className={`status-pill ${small ? 'status-pill-sm' : ''} ${className}`}
      style={style}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Menu (accessible-ish popover)
// ---------------------------------------------------------------------------

const MenuCtx = createContext<{ close: () => void }>({ close: () => undefined })

export function Menu({
  trigger,
  children,
  align = 'start',
  width = 220,
  panelClassName = ''
}: {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'end' | 'down-start' | 'down-end'
  width?: number
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const pos =
    align === 'end'
      ? 'right-0 top-full mt-1'
      : align === 'down-start'
        ? 'left-0 top-full mt-1'
        : align === 'down-end'
          ? 'right-0 top-full mt-1'
          : 'left-0 top-full mt-1'
  return (
    <div className="relative" ref={ref}>
      <span
        className="inline-flex cursor-pointer"
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
      >
        {trigger}
      </span>
      {open && (
        <div
          role="menu"
          className={`elev-overlay absolute z-50 rounded-token border border-line bg-raised p-1 ${pos} ${panelClassName}`}
          style={{ width }}
        >
          <MenuCtx.Provider value={{ close: () => setOpen(false) }}>{children}</MenuCtx.Provider>
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  icon,
  label,
  shortcut,
  danger = false,
  active = false,
  onClick
}: {
  icon?: ReactNode
  label: string
  shortcut?: string
  danger?: boolean
  active?: boolean
  onClick: () => void
}) {
  const { close } = useContext(MenuCtx)
  return (
    <button
      role="menuitem"
      aria-checked={active}
      className={`focus-ring flex w-full items-center gap-2 rounded-token-sm px-2 py-1.5 text-left text-[0.92em] transition-colors ${
        danger ? 'text-bad hover:bg-bad/10' : active ? 'text-primary hover:bg-primary-soft' : 'text-ink hover:bg-surface'
      }`}
      onClick={() => {
        close()
        onClick()
      }}
    >
      {icon && <span className="text-ink-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {active && <Check size={13} className="shrink-0 text-primary" />}
      {shortcut && <span className="text-[0.78em] text-ink-faint">{shortcut}</span>}
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1.5 text-[0.75em] font-semibold uppercase tracking-wider text-ink-faint">{children}</div>
}

export function MenuSep() {
  return <div className="my-1 h-px bg-line" />
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="elev-overlay relative w-full rounded-token-lg bg-raised outline-none"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[1.02em] font-semibold">{title}</h2>
          <IconBtn label="Close" onClick={onClose}>
            <X size={16} />
          </IconBtn>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return (
    <input
      className={`focus-ring h-9 w-full rounded-token-sm border border-line bg-surface/60 px-3 text-[0.95em] placeholder:text-ink-faint ${className}`}
      {...rest}
    />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props
  return (
    <textarea
      className={`focus-ring w-full rounded-token-sm border border-line bg-surface/60 px-3 py-2 text-[0.95em] placeholder:text-ink-faint ${className}`}
      {...rest}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props
  return (
    <select
      className={`focus-ring h-9 w-full rounded-token-sm border border-line bg-surface/60 px-2.5 text-[0.95em] ${className}`}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange
}: {
  label?: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 flex items-center justify-between text-[0.82em] text-ink-muted">
          <span>{label}</span>
          <span className="tabular-nums text-ink-faint">
            {Math.round(value * 100) / 100}
            {suffix}
          </span>
        </span>
      )}
      <input
        type="range"
        aria-label={label}
        className="slider w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  hint
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className="focus-ring flex w-full items-center justify-between gap-3 rounded-token-sm px-1 py-1.5 text-left"
      onClick={() => onChange(!checked)}
    >
      <span>
        <span className="block text-[0.95em]">{label}</span>
        {hint && <span className="block text-[0.78em] text-ink-faint">{hint}</span>}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[18px]' : ''
          }`}
        />
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Tabs, kbd, empty state
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  size = 'md'
}: {
  tabs: { id: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-token-sm bg-sunken p-0.5" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className={`focus-ring rounded-token-sm transition-colors ${
            size === 'sm' ? 'px-2 py-0.5 text-[0.8em]' : 'px-3 py-1 text-[0.9em]'
          } ${value === t.id ? 'bg-raised text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[0.72em] text-ink-muted">
      {children}
    </kbd>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-token border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-ink-faint [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <div className="font-medium text-ink-muted">{title}</div>
      {hint && <div className="max-w-sm text-[0.85em] text-ink-faint">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface Toast {
  id: string
  title: string
  tone: 'info' | 'success' | 'error'
}

interface ToastState {
  toasts: Toast[]
  push: (title: string, tone?: Toast['tone']) => void
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (title, tone = 'info') => {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts, { id, title, tone }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export function Toaster({ position = 'bottom' }: { position?: 'bottom' | 'top' }) {
  const { toasts, dismiss } = useToasts()
  const pos =
    position === 'top'
      ? 'top-4 left-1/2 -translate-x-1/2 items-center'
      : 'bottom-20 left-1/2 -translate-x-1/2 items-center'
  return (
    <div className={`pointer-events-none fixed z-[200] flex flex-col gap-2 ${pos}`}>
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`toast-in elev-overlay pointer-events-auto flex items-center gap-2 rounded-token border px-3 py-2 text-[0.9em] ${
            t.tone === 'error'
              ? 'border-bad/40 bg-raised text-bad'
              : t.tone === 'success'
                ? 'border-ok/40 bg-raised text-ok'
                : 'border-line bg-raised text-ink'
          }`}
        >
          {t.title}
        </button>
      ))}
    </div>
  )
}

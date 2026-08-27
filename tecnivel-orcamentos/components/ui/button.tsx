import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg' | 'xl'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-white text-ink border border-slate-200 hover:bg-slate-50 active:bg-slate-100',
  ghost: 'text-brand-700 hover:bg-brand-50 active:bg-brand-100',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
}

// Alturas generosas: o alvo de toque precisa ser confortável com uma mão só.
const sizes: Record<Size, string> = {
  md: 'h-11 px-4 text-sm rounded-xl',
  lg: 'h-14 px-5 text-base rounded-2xl',
  xl: 'h-16 px-6 text-lg rounded-2xl',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}

export function Button({
  className,
  variant = 'primary',
  size = 'lg',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 font-semibold transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}

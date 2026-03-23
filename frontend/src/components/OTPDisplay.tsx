import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '../lib/utils'

interface OTPDisplayProps {
  otps: string[]
  className?: string
}

export function OTPDisplay({ otps, className }: OTPDisplayProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (otp: string) => {
    await navigator.clipboard.writeText(otp)
    setCopied(otp)
    setTimeout(() => setCopied(null), 2000)
  }

  if (otps.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {otps.map((otp) => (
        <button
          key={otp}
          onClick={() => copy(otp)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg text-violet-800 font-mono font-bold text-lg hover:bg-violet-100 transition-colors dark:bg-violet-900/30 dark:border-violet-700 dark:text-violet-200"
        >
          {otp}
          {copied === otp ? (
            <Check size={14} className="text-green-500" />
          ) : (
            <Copy size={14} className="opacity-60" />
          )}
        </button>
      ))}
    </div>
  )
}

import { useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { generateTempPassword } from '@/lib/password'

/** Temporary password box with Generate and Copy. Shown in plain text so the admin can share it. */
export function TempPasswordInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} className="min-w-0 font-mono" />
      <Button type="button" variant="secondary" className="shrink-0" onClick={() => onChange(generateTempPassword())} title="Generate a password">
        <RefreshCw className="size-4" aria-hidden /> Generate
      </Button>
    </div>
  )
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? 'Copied' : label}
    </Button>
  )
}

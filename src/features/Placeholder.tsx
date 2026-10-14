import { Construction } from 'lucide-react'
import { Card } from '@/components/ui/Card'

/** Stand-in for screens built in later modules. */
export function Placeholder({ title, module }: { title: string; module: string }) {
  return (
    <Card className="mx-auto mt-10 max-w-md p-8 text-center">
      <Construction className="mx-auto size-8 text-slate-400" aria-hidden />
      <h2 className="mt-3 font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">This screen is built in module {module}.</p>
    </Card>
  )
}

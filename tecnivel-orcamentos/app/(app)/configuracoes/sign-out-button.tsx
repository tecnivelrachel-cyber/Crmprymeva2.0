'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <Button variant="secondary" className="w-full" onClick={handleSignOut}>
      <LogOut className="h-5 w-5" aria-hidden />
      Sair da conta
    </Button>
  )
}

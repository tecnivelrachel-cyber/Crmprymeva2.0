import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types'

/** Perfil da sessão atual. Cacheado por request para não repetir a consulta. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, name, email, role, active')
    .eq('id', user.id)
    .single()

  return (data as Profile | null) ?? null
})

/** Usar em toda página interna. A autoridade real continua sendo a RLS. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile || !profile.active) redirect('/login')
  return profile
}

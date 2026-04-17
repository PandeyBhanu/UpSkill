'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [partnerEmail, setPartnerEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // 1. Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
          },
        },
      })

      if (authError) throw authError

      if (!authData.user) throw new Error('Failed to create user')

      // 2. Create user record in users table
      const { error: userError } = await supabase.from('users').insert({
        id: authData.user.id,
        email,
        name,
      })

      if (userError) throw userError

      // 3. If partner email provided, find or create pair
      if (partnerEmail) {
        const { data: partnerData, error: partnerError } = await supabase
          .from('users')
          .select('id, pair_id')
          .eq('email', partnerEmail.toLowerCase())
          .single()

        if (partnerError && partnerError.code !== 'PGRST116') {
          throw partnerError
        }

        if (partnerData) {
          // Partner exists
          if (partnerData.pair_id) {
            // Partner already has a pair, join it
            const { error: updateError } = await supabase
              .from('users')
              .update({ pair_id: partnerData.pair_id })
              .eq('id', authData.user.id)

            if (updateError) throw updateError
          } else {
            // Create new pair
            const { data: newPair, error: pairError } = await supabase
              .from('pairs')
              .insert({
                user1_id: partnerData.id,
                user2_id: authData.user.id,
              })
              .select()
              .single()

            if (pairError) throw pairError

            // Update both users with pair_id
            await supabase.from('users').update({ pair_id: newPair.id }).eq('id', partnerData.id)
            await supabase.from('users').update({ pair_id: newPair.id }).eq('id', authData.user.id)
          }
        }
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-md">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-8">
          <h1 className="text-3xl font-bold text-center mb-2 text-[var(--foreground)]">
            PlacementDuel
          </h1>
          <p className="text-center text-[var(--text-muted)] mb-8">
            Create your account and find your duel partner
          </p>

          {error && (
            <div className="bg-[var(--danger)]/10 border border-[var(--danger)] text-[var(--danger)] px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="partnerEmail" className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Partner's Email (Optional)
              </label>
              <input
                id="partnerEmail"
                type="email"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="partner@example.com"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Enter your partner's email to link your accounts for duels
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>

          <p className="text-center text-[var(--text-muted)] mt-6">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-[var(--accent)] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

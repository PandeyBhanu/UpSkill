'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardLayout from '@/components/DashboardLayout'
import Link from 'next/link'
import { BookOpen, Clock, Trophy, TrendingUp, User } from 'lucide-react'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [partner, setPartner] = useState<any>(null)
  const [weeklyTopicsSubmitted, setWeeklyTopicsSubmitted] = useState(false)
  const [testGenerated, setTestGenerated] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      // Get user details
      const { data: userData } = await supabase
        .from('users')
        .select('*, pairs(*)')
        .eq('id', authUser.id)
        .single()

      setUser(userData)

      // Get partner if exists
      if (userData?.pair_id) {
        const { data: pairData } = await supabase
          .from('pairs')
          .select('*, users!pairs_user1_id_f1(*), users!pairs_user2_id_f2(*)')
          .eq('id', userData.pair_id)
        .single()

        if (pairData) {
          const partnerUser = pairData.user1_id === authUser.id ? pairData.users?.[1] : pairData.users?.[0]
          setPartner(partnerUser)
        }
      }

      // Check if weekly topics submitted for this week
      const startOfWeek = new Date()
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      startOfWeek.setHours(0, 0, 0, 0)

      const { data: topicsData } = await supabase
        .from('weekly_topics')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('week_start_date', startOfWeek.toISOString().split('T')[0])

      setWeeklyTopicsSubmitted(!!topicsData && topicsData.length > 0)

      // Check if test generated for this week
      if (userData?.pair_id) {
        const { data: testData } = await supabase
          .from('tests')
          .select('*')
          .eq('pair_id', userData.pair_id)
          .eq('week_start_date', startOfWeek.toISOString().split('T')[0])
          .single()

        setTestGenerated(!!testData)
      }

      setLoading(false)
    }

    loadData()
  }, [supabase])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-[var(--foreground)]">Loading...</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
            Welcome back, {user?.name || 'User'}!
          </h1>
          <p className="text-[var(--text-muted)]">
            {partner ? `Dueling with ${partner.name}` : 'No partner linked yet'}
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Link
            href="/topics"
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 hover:border-[var(--accent)] transition-colors"
          >
            <BookOpen className="w-8 h-8 text-[var(--accent)] mb-4" />
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">Weekly Topics</h3>
            <p className="text-[var(--text-muted)] text-sm mb-4">
              {weeklyTopicsSubmitted ? 'Topics submitted for this week' : 'Submit your study topics'}
            </p>
            <div className="flex items-center text-[var(--accent)] text-sm">
              {weeklyTopicsSubmitted ? 'View Topics' : 'Submit Now'}
            </div>
          </Link>

          {testGenerated ? (
            <Link
              href="/test"
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 hover:border-[var(--accent)] transition-colors"
            >
              <Clock className="w-8 h-8 text-[var(--success)] mb-4" />
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">Take Test</h3>
              <p className="text-[var(--text-muted)] text-sm mb-4">
                This week's test is ready
              </p>
              <div className="flex items-center text-[var(--accent)] text-sm">
                Start Test
              </div>
            </Link>
          ) : (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 opacity-60">
              <Clock className="w-8 h-8 text-[var(--text-muted)] mb-4" />
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">Take Test</h3>
              <p className="text-[var(--text-muted)] text-sm mb-4">
                Waiting for test generation
              </p>
              <div className="flex items-center text-[var(--text-muted)] text-sm">
                Coming Soon
              </div>
            </div>
          )}

          <Link
            href="/dashboard/analytics"
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 hover:border-[var(--accent)] transition-colors"
          >
            <TrendingUp className="w-8 h-8 text-[var(--accent)] mb-4" />
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">Analytics</h3>
            <p className="text-[var(--text-muted)] text-sm mb-4">
              View your performance trends
            </p>
            <div className="flex items-center text-[var(--accent)] text-sm">
              View Analytics
            </div>
          </Link>
        </div>

        {/* Status Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6">
            <div className="flex items-center gap-4 mb-4">
              <User className="w-6 h-6 text-[var(--accent)]" />
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Partner Status</h3>
            </div>
            {partner ? (
              <div>
                <p className="text-[var(--foreground)] mb-2">Partner: {partner.name}</p>
                <p className="text-[var(--text-muted)] text-sm">Email: {partner.email}</p>
              </div>
            ) : (
              <div>
                <p className="text-[var(--text-muted)] mb-4">No partner linked yet</p>
                <Link
                  href="/auth/signup"
                  className="text-[var(--accent)] hover:underline text-sm"
                >
                  Link a partner in settings
                </Link>
              </div>
            )}
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6">
            <div className="flex items-center gap-4 mb-4">
              <Trophy className="w-6 h-6 text-[var(--accent)]" />
              <h3 className="text-lg font-semibold text-[var(--foreground)]">This Week's Progress</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Topics Submitted</span>
                <span className={weeklyTopicsSubmitted ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>
                  {weeklyTopicsSubmitted ? '✓ Done' : '✗ Pending'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Test Generated</span>
                <span className={testGenerated ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>
                  {testGenerated ? '✓ Ready' : '✗ Pending'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Test Completed</span>
                <span className="text-[var(--text-muted)]">
                  ✗ Pending
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

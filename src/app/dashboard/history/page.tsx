'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardLayout from '@/components/DashboardLayout'
import { Clock, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react'

interface TestHistory {
  id: string
  week_start_date: string
  created_at: string
  mode: string
  status: string
  score?: {
    total_score: number
    badges: string[]
  }
}

export default function HistoryPage() {
  const [tests, setTests] = useState<TestHistory[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadHistory = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user's tests (both solo and partner mode)
      const { data: soloTests } = await supabase
        .from('tests')
        .select('*, scores(total_score, badges)')
        .eq('user_id', user.id)
        .eq('mode', 'solo')
        .order('created_at', { ascending: false })

      // Get user's pair_id for partner tests
      const { data: userData } = await supabase
        .from('users')
        .select('pair_id')
        .eq('id', user.id)
        .single()

      let partnerTests = []
      if (userData?.pair_id) {
        const { data: partnerTestData } = await supabase
          .from('tests')
          .select('*, scores(total_score, badges)')
          .eq('pair_id', userData.pair_id)
          .order('created_at', { ascending: false })
        partnerTests = partnerTestData || []
      }

      // Combine and format tests
      const allTests = [
        ...(soloTests || []).map(t => ({
          ...t,
          score: t.scores?.[0] || null
        })),
        ...(partnerTests || []).map(t => ({
          ...t,
          score: t.scores?.find((s: any) => s.user_id === user.id) || null
        }))
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setTests(allTests)
      setLoading(false)
    }

    loadHistory()
  }, [supabase])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Clock className="w-8 h-8 text-[var(--accent)] animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
            Test History
          </h1>
          <p className="text-[var(--text-muted)]">
            View your past tests and results
          </p>
        </div>

        {tests.length === 0 ? (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-8 text-center">
            <AlertCircle className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">No Tests Yet</h2>
            <p className="text-[var(--text-muted)]">
              Complete your first test to see your history here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tests.map((test) => (
              <div
                key={test.id}
                className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 hover:border-[var(--accent)] transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 text-xs font-medium rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                        {test.mode === 'solo' ? 'Solo' : 'Partner'}
                      </span>
                      <span className="px-2 py-1 text-xs font-medium rounded bg-[var(--card-border)] text-[var(--text-muted)]">
                        {test.status}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">
                      Week of {new Date(test.week_start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">
                      Created on {new Date(test.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {test.score ? (
                    <div className="text-right">
                      <div className="text-2xl font-bold text-[var(--accent)]">
                        {test.score.total_score}/10
                      </div>
                      {test.score.badges && test.score.badges.length > 0 && (
                        <div className="mt-2 flex gap-1 flex-wrap justify-end">
                          {test.score.badges.map((badge, idx) => (
                            <span key={idx} className="text-xs px-2 py-1 bg-[var(--card-border)] rounded">
                              {badge}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-right">
                      <div className="text-sm text-[var(--text-muted)]">
                        Not completed
                      </div>
                    </div>
                  )}
                </div>

                {test.score ? (
                  <button
                    onClick={() => window.location.href = `/results/${test.id}`}
                    className="w-full mt-4 py-2 bg-[var(--card-border)] hover:bg-[var(--accent)] hover:text-white text-[var(--foreground)] rounded-lg transition-colors"
                  >
                    View Results
                  </button>
                ) : (
                  <button
                    onClick={() => window.location.href = `/test`}
                    className="w-full mt-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors"
                  >
                    Take Test
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

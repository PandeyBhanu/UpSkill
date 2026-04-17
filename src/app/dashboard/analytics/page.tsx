'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardLayout from '@/components/DashboardLayout'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import { TrendingUp, Target, History, Loader2, AlertCircle } from 'lucide-react'

interface ScoreData {
  id: string
  total_score: number
  section_scores: Record<string, number>
  created_at: string
  test: {
    week_start_date: string
  }
}

export default function AnalyticsPage() {
  const [scores, setScores] = useState<ScoreData[]>([])
  const [weakZoneSummary, setWeakZoneSummary] = useState('')
  const [loading, setLoading] = useState(true)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const loadAnalytics = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get last 8 weeks of scores
      const { data: scoresData, error: scoresError } = await supabase
        .from('scores')
        .select('*, tests(week_start_date)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8)

      if (scoresError) {
        console.error('Error loading scores:', scoresError)
      } else {
        setScores(scoresData || [])
      }

      setLoading(false)
    }

    loadAnalytics()
  }, [supabase])

  const generateWeakZoneSummary = async () => {
    setGeneratingSummary(true)
    try {
      const response = await fetch('/api/weak-zone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores }),
      })

      if (response.ok) {
        const data = await response.json()
        setWeakZoneSummary(data.summary)
      }
    } catch (error) {
      console.error('Error generating weak zone summary:', error)
    } finally {
      setGeneratingSummary(false)
    }
  }

  const getTrendData = () => {
    return scores
      .slice()
      .reverse()
      .map((score, index) => ({
        week: `Week ${index + 1}`,
        date: new Date(score.test.week_start_date).toLocaleDateString(),
        total: score.total_score,
        'CS Fundamentals': score.section_scores['CS Fundamentals'] || 0,
        'DSA / Coding': score.section_scores['DSA / Coding'] || 0,
        'System Design': score.section_scores['System Design'] || 0,
        'HR / Behavioural': score.section_scores['HR / Behavioural'] || 0,
      }))
  }

  const getHeatmapData = () => {
    const sections = ['CS Fundamentals', 'DSA / Coding', 'System Design', 'HR / Behavioural']
    return sections.map(section => {
      const sectionScores = scores.map(s => s.section_scores[section] || 0)
      const avgScore = sectionScores.reduce((a, b) => a + b, 0) / sectionScores.length
      return {
        section,
        avgScore: Math.round(avgScore),
        performance: avgScore >= 8 ? 'strong' : avgScore >= 5 ? 'average' : 'weak',
      }
    })
  }

  const getPerformanceColor = (performance: string) => {
    switch (performance) {
      case 'strong': return '#238636'
      case 'average': return '#d29922'
      case 'weak': return '#da3633'
      default: return '#8b949e'
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  const trendData = getTrendData()
  const heatmapData = getHeatmapData()

  return (
    <DashboardLayout>
      <div className="p-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
            Analytics Dashboard
          </h1>
          <p className="text-[var(--text-muted)]">
            Track your performance trends and identify areas for improvement
          </p>
        </div>

        {scores.length === 0 ? (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-8 text-center">
            <AlertCircle className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">No Data Available</h2>
            <p className="text-[var(--text-muted)]">
              Complete at least one test to see your analytics here.
            </p>
          </div>
        ) : (
          <>
            {/* Weekly Score Trend */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="w-6 h-6 text-[var(--accent)]" />
                <h2 className="text-xl font-bold text-[var(--foreground)]">
                  Weekly Score Trend (Last 8 Weeks)
                </h2>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis 
                      dataKey="week" 
                      stroke="var(--text-muted)"
                      tick={{ fill: 'var(--text-muted)' }}
                    />
                    <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--card-border)',
                        borderRadius: '8px',
                        color: 'var(--foreground)',
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="#58a6ff" strokeWidth={2} name="Total Score" />
                    <Line type="monotone" dataKey="CS Fundamentals" stroke="#238636" strokeWidth={2} />
                    <Line type="monotone" dataKey="DSA / Coding" stroke="#da3633" strokeWidth={2} />
                    <Line type="monotone" dataKey="System Design" stroke="#d29922" strokeWidth={2} />
                    <Line type="monotone" dataKey="HR / Behavioural" stroke="#a371f7" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Topic Heatmap */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <Target className="w-6 h-6 text-[var(--accent)]" />
                <h2 className="text-xl font-bold text-[var(--foreground)]">
                  Performance by Section
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {heatmapData.map((item) => (
                  <div
                    key={item.section}
                    className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-4"
                  >
                    <h3 className="text-sm font-medium text-[var(--foreground)] mb-2">
                      {item.section}
                    </h3>
                    <div className="text-3xl font-bold mb-2" style={{ color: getPerformanceColor(item.performance) }}>
                      {item.avgScore}%
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getPerformanceColor(item.performance) }}
                      />
                      <span className="text-sm text-[var(--text-muted)] capitalize">
                        {item.performance}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Weak Zone Summary */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Target className="w-6 h-6 text-[var(--accent)]" />
                  <h2 className="text-xl font-bold text-[var(--foreground)]">
                    AI Weak Zone Analysis
                  </h2>
                </div>
                <button
                  onClick={generateWeakZoneSummary}
                  disabled={generatingSummary}
                  className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {generatingSummary ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    'Generate Analysis'
                  )}
                </button>
              </div>
              {weakZoneSummary ? (
                <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-4">
                  <p className="text-[var(--foreground)] whitespace-pre-wrap">{weakZoneSummary}</p>
                </div>
              ) : (
                <div className="text-[var(--text-muted)] text-sm">
                  Click "Generate Analysis" to get AI-powered insights on your weak areas
                </div>
              )}
            </div>

            {/* Test History */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <History className="w-6 h-6 text-[var(--accent)]" />
                <h2 className="text-xl font-bold text-[var(--foreground)]">
                  Test History
                </h2>
              </div>
              <div className="space-y-3">
                {scores.map((score) => (
                  <div
                    key={score.id}
                    className="flex items-center justify-between p-4 bg-[var(--background)] border border-[var(--card-border)] rounded-lg hover:border-[var(--accent)] transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/results/${score.id}`}
                  >
                    <div>
                      <div className="font-medium text-[var(--foreground)]">
                        Week of {new Date(score.test.week_start_date).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-[var(--text-muted)]">
                        {new Date(score.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-[var(--accent)]">
                      {score.total_score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

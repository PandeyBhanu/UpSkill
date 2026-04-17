'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardLayout from '@/components/DashboardLayout'
import { Trophy, Clock, ChevronDown, ChevronUp, Medal, Star, Award, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import confetti from 'canvas-confetti'

interface ScoreData {
  id: string
  total_score: number
  section_scores: Record<string, number>
  per_question_feedback: any[]
  badges: string[]
  user: {
    name: string
    email: string
  }
}

export default function ResultsPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = use(params)
  const [userScore, setUserScore] = useState<ScoreData | null>(null)
  const [partnerScore, setPartnerScore] = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({})
  const supabase = createClient()

  useEffect(() => {
    const loadResults = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user's score
      const { data: userData, error: userError } = await supabase
        .from('scores')
        .select('*, users(name, email)')
        .eq('test_id', testId)
        .eq('user_id', user.id)
        .single()

      if (userError || !userData) {
        setError('Your score is not available yet. Please wait for evaluation to complete.')
        setLoading(false)
        return
      }

      setUserScore({ ...userData, user: userData.users })

      // Get partner's score
      const { data: userRecord } = await supabase
        .from('users')
        .select('pair_id')
        .eq('id', user.id)
        .single()

      if (userRecord?.pair_id) {
        // Get pair details to find partner
        const { data: pairData } = await supabase
          .from('pairs')
          .select('user1_id, user2_id')
          .eq('id', userRecord.pair_id)
          .single()

        if (pairData) {
          const partnerId = pairData.user1_id === user.id ? pairData.user2_id : pairData.user1_id

          const { data: partnerData } = await supabase
            .from('scores')
            .select('*, users(name, email)')
            .eq('test_id', testId)
            .eq('user_id', partnerId)
            .single()

          if (partnerData) {
            setPartnerScore({ ...partnerData, user: partnerData.users })
          }
        }
      }

      // Trigger confetti if user won
      if (!partnerScore || userData.total_score > (partnerData?.total_score || 0)) {
        setTimeout(() => {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
          })
        }, 500)
      }

      setLoading(false)
    }

    loadResults()
  }, [testId, supabase])

  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions(prev => ({
      ...prev,
      [questionId]: !prev[questionId],
    }))
  }

  const getChartData = () => {
    if (!userScore) return []

    const sections = Object.keys(userScore.section_scores)
    return sections.map(section => ({
      name: section,
      you: userScore.section_scores[section] || 0,
      partner: partnerScore?.section_scores[section] || 0,
    }))
  }

  const getWinner = () => {
    if (!userScore) return null
    if (!partnerScore) return 'waiting'
    if (userScore.total_score > partnerScore.total_score) return 'user'
    if (partnerScore.total_score > userScore.total_score) return 'partner'
    return 'tie'
  }

  const COLORS = {
    you: '#58a6ff',
    partner: '#da3633',
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-[var(--foreground)]">Loading results...</div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="bg-[var(--warning)]/10 border border-[var(--warning)] text-[var(--warning)] px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const winner = getWinner()

  return (
    <DashboardLayout>
      <div className="p-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
            Test Results
          </h1>
          <p className="text-[var(--text-muted)]">
            See how you performed compared to your partner
          </p>
        </div>

        {/* Head-to-Head Comparison */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Your Score */}
          <div className={`bg-[var(--card-bg)] border-2 rounded-lg p-6 ${
            winner === 'user' ? 'border-[var(--success)]' : 'border-[var(--card-border)]'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              {winner === 'user' && <Trophy className="w-6 h-6 text-[var(--success)]" />}
              <h2 className="text-xl font-bold text-[var(--foreground)]">Your Score</h2>
            </div>
            <div className="text-5xl font-bold text-[var(--accent)] mb-4">
              {userScore?.total_score || 0}
            </div>
            <div className="space-y-2">
              {userScore?.badges && userScore.badges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {userScore.badges.map((badge, index) => (
                    <span key={index} className="px-3 py-1 bg-[var(--accent)]/20 text-[var(--accent)] rounded-full text-sm flex items-center gap-1">
                      {badge.includes('🥇') && <Medal className="w-4 h-4" />}
                      {badge.includes('✨') && <Star className="w-4 h-4" />}
                      {badge.includes('💻') && <Award className="w-4 h-4" />}
                      {badge.includes('🔥') && <TrendingUp className="w-4 h-4" />}
                      {badge}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Partner's Score */}
          <div className={`bg-[var(--card-bg)] border-2 rounded-lg p-6 ${
            winner === 'partner' ? 'border-[var(--success)]' : 'border-[var(--card-border)]'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              {winner === 'partner' && <Trophy className="w-6 h-6 text-[var(--success)]" />}
              <h2 className="text-xl font-bold text-[var(--foreground)]">
                {partnerScore ? `${partnerScore.user.name}'s Score` : "Partner's Score"}
              </h2>
            </div>
            <div className="text-5xl font-bold text-[var(--accent)] mb-4">
              {partnerScore?.total_score || '--'}
            </div>
            {!partnerScore && (
              <div className="text-sm text-[var(--text-muted)]">
                Waiting for partner to submit...
              </div>
            )}
            {partnerScore?.badges && partnerScore.badges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {partnerScore.badges.map((badge, index) => (
                  <span key={index} className="px-3 py-1 bg-[var(--accent)]/20 text-[var(--accent)] rounded-full text-sm">
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section-wise Comparison Chart */}
        {partnerScore && (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">
              Section-wise Comparison
            </h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--text-muted)"
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card-bg)',
                      border: '1px solid var(--card-border)',
                      borderRadius: '8px',
                      color: 'var(--foreground)',
                    }}
                  />
                  <Bar dataKey="you" name="You" fill={COLORS.you} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="partner" name={partnerScore.user.name} fill={COLORS.partner} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Per-Question Feedback */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">
            Question Feedback
          </h2>
          <div className="space-y-4">
            {userScore?.per_question_feedback.map((feedback: any, index: number) => (
              <div
                key={feedback.question_id}
                className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleQuestion(feedback.question_id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-[var(--card-border)] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="bg-[var(--accent)] text-white text-sm font-medium px-3 py-1 rounded">
                      Q{index + 1}
                    </span>
                    <span className="text-[var(--foreground)] font-medium">
                      {feedback.question.substring(0, 80)}...
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-2xl font-bold ${
                      feedback.score >= 8 ? 'text-[var(--success)]' :
                      feedback.score >= 5 ? 'text-[var(--warning)]' :
                      'text-[var(--danger)]'
                    }`}>
                      {feedback.score}/10
                    </span>
                    {expandedQuestions[feedback.question_id] ? (
                      <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
                    )}
                  </div>
                </button>

                {expandedQuestions[feedback.question_id] && (
                  <div className="px-6 py-4 border-t border-[var(--card-border)] space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-[var(--text-muted)] mb-2">
                        Your Answer:
                      </h4>
                      <p className="text-[var(--foreground)] whitespace-pre-wrap">
                        {feedback.user_answer || 'No answer provided'}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-[var(--text-muted)] mb-2">
                        Correct Answer Summary:
                      </h4>
                      <p className="text-[var(--foreground)] whitespace-pre-wrap">
                        {feedback.correct_answer_summary}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-[var(--text-muted)] mb-2">
                        Feedback:
                      </h4>
                      <p className="text-[var(--foreground)] whitespace-pre-wrap">
                        {feedback.feedback}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

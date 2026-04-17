'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardLayout from '@/components/DashboardLayout'
import { Clock, ChevronRight, Play, AlertCircle } from 'lucide-react'
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface Question {
  id: string
  type: 'mcq' | 'code' | 'text'
  question: string
  options?: string[]
  expected_answer: string
  difficulty: string
  explanation: string
}

interface Section {
  name: string
  time_limit_seconds: number
  questions: Question[]
}

export default function TestPage() {
  const [test, setTest] = useState<any>(null)
  const [currentSection, setCurrentSection] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [codeAnswers, setCodeAnswers] = useState<Record<string, { code: string; language: string }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [testStarted, setTestStarted] = useState(false)
  const [currentLanguage, setCurrentLanguage] = useState('python')
  const supabase = createClient()

  useEffect(() => {
    const loadTest = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user's pair
      const { data: userData } = await supabase
        .from('users')
        .select('pair_id')
        .eq('id', user.id)
        .single()

      let testData = null
      let testError = null

      // Try to get test by pair_id (partner mode) or user_id (solo mode)
      if (userData?.pair_id) {
        const result = await supabase
          .from('tests')
          .select('*')
          .eq('pair_id', userData.pair_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        testData = result.data
        testError = result.error
      } else {
        // Solo mode: get test by user_id
        const result = await supabase
          .from('tests')
          .select('*')
          .eq('user_id', user.id)
          .eq('mode', 'solo')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        testData = result.data
        testError = result.error
      }

      if (testError || !testData) {
        setError('No test available for this week. Please generate a test from the Weekly Topics page first.')
        setLoading(false)
        return
      }

      // Check if user already submitted
      const { data: existingResponse } = await supabase
        .from('responses')
        .select('*')
        .eq('test_id', testData.id)
        .eq('user_id', user.id)

      if (existingResponse && existingResponse.length > 0) {
        // Load existing answers
        const loadedAnswers: Record<string, string> = {}
        const loadedCodeAnswers: Record<string, { code: string; language: string }> = {}
        existingResponse.forEach(r => {
          if (r.question_id.startsWith('dsa')) {
            try {
              const parsed = JSON.parse(r.answer)
              loadedCodeAnswers[r.question_id] = parsed
            } catch {
              loadedCodeAnswers[r.question_id] = { code: r.answer, language: 'python' }
            }
          } else {
            loadedAnswers[r.question_id] = r.answer
          }
        })
        setAnswers(loadedAnswers)
        setCodeAnswers(loadedCodeAnswers)
      }

      setTest(testData)
      setLoading(false)
    }

    loadTest()
  }, [supabase])

  // Timer effect
  useEffect(() => {
    if (!testStarted || !test || timeRemaining <= 0) return

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleSectionSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [testStarted, timeRemaining])

  // Auto-save effect
  useEffect(() => {
    if (!test || !testStarted) return

    const autoSave = setInterval(async () => {
      await saveAnswers(true)
    }, 30000)

    return () => clearInterval(autoSave)
  }, [answers, codeAnswers, test, testStarted])

  const startTest = () => {
    setTestStarted(true)
    const firstSection = test.generated_questions.sections[0]
    setTimeRemaining(firstSection.time_limit_seconds)
  }

  const handleSectionSubmit = async () => {
    await saveAnswers(false)

    if (currentSection < test.generated_questions.sections.length - 1) {
      setCurrentSection(currentSection + 1)
      const nextSection = test.generated_questions.sections[currentSection + 1]
      setTimeRemaining(nextSection.time_limit_seconds)
    } else {
      // Submit entire test
      await submitTest()
    }
  }

  const saveAnswers = async (isAutoSave: boolean) => {
    if (!test) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const section = test.generated_questions.sections[currentSection]

    for (const question of section.questions) {
      let answer = ''
      if (question.type === 'code') {
        const codeData = codeAnswers[question.id] || { code: '', language: 'python' }
        answer = JSON.stringify(codeData)
      } else {
        answer = answers[question.id] || ''
      }

      if (answer) {
        await supabase.from('responses').upsert({
          test_id: test.id,
          user_id: user.id,
          question_id: question.id,
          answer,
        })
      }
    }
  }

  const submitTest = async () => {
    setSubmitted(true)
    // Trigger evaluation
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !test) return

    try {
      await fetch('/api/evaluate-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId: test.id, userId: user.id }),
      })
    } catch (err) {
      console.error('Error triggering evaluation:', err)
    }

    // Redirect to results
    window.location.href = `/results/${test.id}`
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-[var(--foreground)]">Loading test...</div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="bg-[var(--danger)]/10 border border-[var(--danger)] text-[var(--danger)] px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (submitted) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-2xl text-[var(--foreground)] mb-4">Submitting test...</div>
            <div className="text-[var(--text-muted)]">Your answers are being evaluated</div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const sections = test.generated_questions.sections
  const currentSectionData = sections[currentSection]
  const progress = ((currentSection + 1) / sections.length) * 100

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col">
        {/* Header with timer and progress */}
        <div className="bg-[var(--card-bg)] border-b border-[var(--card-border)] p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-[var(--foreground)]">
              {testStarted ? currentSectionData.name : 'Ready to Start?'}
            </h1>
            {testStarted && (
              <div className="flex items-center gap-2 text-[var(--foreground)]">
                <Clock className="w-5 h-5" />
                <span className="text-2xl font-mono font-bold">{formatTime(timeRemaining)}</span>
              </div>
            )}
          </div>

          {testStarted && (
            <div className="w-full bg-[var(--background)] rounded-full h-2">
              <div
                className="bg-[var(--accent)] h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {testStarted && (
            <div className="text-sm text-[var(--text-muted)] mt-2">
              Section {currentSection + 1} of {sections.length}
            </div>
          )}
        </div>

        {/* Test content */}
        <div className="flex-1 overflow-auto p-8">
          {!testStarted ? (
            <div className="max-w-2xl mx-auto">
              <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-8">
                <h2 className="text-2xl font-bold text-[var(--foreground)] mb-4">
                  Test Instructions
                </h2>
                <ul className="space-y-3 text-[var(--text-muted)] mb-6">
                  <li>• This test has {sections.length} sections with time limits</li>
                  <li>• You cannot go back to previous sections</li>
                  <li>• Answers are auto-saved every 30 seconds</li>
                  <li>• For coding questions, use the built-in code editor</li>
                  <li>• When time runs out, the section auto-submits</li>
                </ul>

                <div className="space-y-4 mb-6">
                  {sections.map((section: Section, index: number) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-[var(--background)] rounded-lg">
                      <div>
                        <div className="font-medium text-[var(--foreground)]">{section.name}</div>
                        <div className="text-sm text-[var(--text-muted)]">{section.questions.length} questions</div>
                      </div>
                      <div className="text-[var(--accent)] font-mono">
                        {formatTime(section.time_limit_seconds)}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={startTest}
                  className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Start Test
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
              {currentSectionData.questions.map((question: Question, qIndex: number) => (
                <div
                  key={question.id}
                  className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6"
                >
                  <div className="flex items-start gap-3 mb-4">
                    <span className="bg-[var(--accent)] text-white text-sm font-medium px-2 py-1 rounded">
                      Q{qIndex + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-[var(--foreground)] whitespace-pre-wrap">{question.question}</p>
                      <span className="inline-block mt-2 text-xs px-2 py-1 bg-[var(--card-border)] text-[var(--text-muted)] rounded">
                        {question.difficulty}
                      </span>
                    </div>
                  </div>

                  {question.type === 'mcq' && question.options && (
                    <div className="space-y-2 ml-8">
                      {question.options.map((option, oIndex) => (
                        <label
                          key={oIndex}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                            answers[question.id] === option
                              ? 'bg-[var(--accent)]/20 border border-[var(--accent)]'
                              : 'bg-[var(--background)] border border-[var(--card-border)] hover:border-[var(--card-border)]'
                          }`}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            value={option}
                            checked={answers[question.id] === option}
                            onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                            className="w-4 h-4"
                          />
                          <span className="text-[var(--foreground)]">{option}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {question.type === 'code' && (
                    <div className="ml-8">
                      <div className="mb-3">
                        <select
                          value={codeAnswers[question.id]?.language || currentLanguage}
                          onChange={(e) => {
                            setCurrentLanguage(e.target.value)
                            setCodeAnswers({
                              ...codeAnswers,
                              [question.id]: {
                                ...(codeAnswers[question.id] || { code: '' }),
                                language: e.target.value,
                              },
                            })
                          }}
                          className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        >
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                        </select>
                      </div>
                      <MonacoEditor
                        height="300px"
                        language={codeAnswers[question.id]?.language || currentLanguage}
                        theme="vs-dark"
                        value={codeAnswers[question.id]?.code || ''}
                        onChange={(value) =>
                          setCodeAnswers({
                            ...codeAnswers,
                            [question.id]: {
                              code: value || '',
                              language: codeAnswers[question.id]?.language || currentLanguage,
                            },
                          })
                        }
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          scrollBeyondLastLine: false,
                        }}
                      />
                    </div>
                  )}

                  {question.type === 'text' && (
                    <textarea
                      value={answers[question.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                      placeholder="Type your answer here..."
                      className="ml-8 w-full h-32 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                    />
                  )}
                </div>
              ))}

              <button
                onClick={handleSectionSubmit}
                className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {currentSection < sections.length - 1 ? (
                  <>
                    Next Section
                    <ChevronRight className="w-5 h-5" />
                  </>
                ) : (
                  'Submit Test'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

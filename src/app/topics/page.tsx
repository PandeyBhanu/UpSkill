'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardLayout from '@/components/DashboardLayout'
import { Clock, CheckCircle, XCircle, Loader2, Sparkles } from 'lucide-react'

export default function WeeklyTopicsPage() {
  const [user, setUser] = useState<any>(null)
  const [partner, setPartner] = useState<any>(null)
  const [topicsText, setTopicsText] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [partnerSubmitted, setPartnerSubmitted] = useState(false)
  const [userSubmitted, setUserSubmitted] = useState(false)
  const [testGenerated, setTestGenerated] = useState(false)
  const [partnerEmail, setPartnerEmail] = useState('')
  const [linkingPartner, setLinkingPartner] = useState(false)
  const [mode, setMode] = useState<'partner' | 'solo'>('partner')
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      console.log('Authenticated user ID:', authUser.id)
      console.log('Authenticated user email:', authUser.email)

      // Get user details
      let { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      console.log('Database user query result:', { userData, userError })

      // If user doesn't exist in users table, create them
      if (userError || !userData) {
        console.log('User record not found, creating one...')
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            id: authUser.id,
            email: authUser.email,
            name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
          })
          .select()
          .single()

        if (createError) {
          console.error('Error creating user:', createError)
        } else {
          userData = newUser
        }
      }

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

      // Get this week's topics
      const startOfWeek = new Date()
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      startOfWeek.setHours(0, 0, 0, 0)

      const { data: userTopics } = await supabase
        .from('weekly_topics')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('week_start_date', startOfWeek.toISOString().split('T')[0])
        .single()

      if (userTopics) {
        setTopicsText(userTopics.topics_text)
        setTags(userTopics.tags || [])
        setUserSubmitted(true)
      }

      // Check if partner submitted
      if (partner) {
        const { data: partnerTopics } = await supabase
          .from('weekly_topics')
          .select('*')
          .eq('user_id', partner.id)
          .eq('week_start_date', startOfWeek.toISOString().split('T')[0])
          .single()

        setPartnerSubmitted(!!partnerTopics)
      }

      // Check if test generated
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

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleSaveTopics = async () => {
    if (!user || !topicsText.trim()) {
      console.log('Cannot save: user or topicsText missing', { user, topicsText })
      return
    }

    setSaving(true)
    try {
      const startOfWeek = new Date()
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      startOfWeek.setHours(0, 0, 0, 0)

      const payload = {
        user_id: user.id,
        week_start_date: startOfWeek.toISOString().split('T')[0],
        topics_text: topicsText,
        tags: tags,
        mode: mode,
      }

      console.log('Saving topics with payload:', payload)

      const { error, data } = await supabase
        .from('weekly_topics')
        .upsert(payload)
        .select()

      if (error) {
        console.error('Supabase error:', error)
        throw error
      }

      console.log('Save successful:', data)
      setUserSubmitted(true)
    } catch (err: any) {
      console.error('Error saving topics:', err)
      alert(`Failed to save topics: ${err.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateTest = async () => {
    if (mode === 'partner' && (!user?.pair_id || !partnerSubmitted)) return
    if (mode === 'solo' && !userSubmitted) return

    setGenerating(true)
    try {
      const response = await fetch('/api/generate-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairId: user?.pair_id,
          userId: user.id,
          mode: mode,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate test')

      setTestGenerated(true)
    } catch (err: any) {
      console.error('Error generating test:', err)
      alert('Failed to generate test')
    } finally {
      setGenerating(false)
    }
  }

  const handleLinkPartner = async () => {
    if (!partnerEmail.trim() || !user) return

    setLinkingPartner(true)
    try {
      // Find partner by email
      const { data: partnerUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', partnerEmail.trim())
        .single()

      if (!partnerUser) {
        alert('No user found with that email. Ask your partner to sign up first.')
        return
      }

      if (partnerUser.id === user.id) {
        alert('You cannot link with yourself.')
        return
      }

      // Check if partner already has a pair
      if (partnerUser.pair_id) {
        alert('This user is already linked with a partner.')
        return
      }

      // Create a new pair
      const { data: pairData, error: pairError } = await supabase
        .from('pairs')
        .insert({
          user1_id: user.id,
          user2_id: partnerUser.id,
        })
        .select()
        .single()

      if (pairError) throw pairError

      // Update both users with pair_id
      await supabase.from('users').update({ pair_id: pairData.id }).eq('id', user.id)
      await supabase.from('users').update({ pair_id: pairData.id }).eq('id', partnerUser.id)

      // Reload the page to refresh data
      window.location.reload()
    } catch (err: any) {
      console.error('Error linking partner:', err)
      alert('Failed to link partner. Please try again.')
    } finally {
      setLinkingPartner(false)
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

  return (
    <DashboardLayout>
      <div className="p-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
            Weekly Topics
          </h1>
          <p className="text-[var(--text-muted)] mb-4">
            What topics did you study this week?
          </p>
          
          {/* Mode Selector */}
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setMode('partner')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                mode === 'partner'
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] hover:border-[var(--accent)]'
              }`}
            >
              Partner Mode
            </button>
            <button
              onClick={() => setMode('solo')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                mode === 'solo'
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] hover:border-[var(--accent)]'
              }`}
            >
              Solo Mode
            </button>
          </div>
          
          <p className="text-sm text-[var(--text-muted)]">
            {mode === 'partner'
              ? 'Partner Mode: Your topics will be combined with your partner\'s topics to generate a test.'
              : 'Solo Mode: Test yourself with topics you submit alone.'}
          </p>
        </div>

        {/* Status Cards */}
        <div className={`grid gap-4 mb-8 ${mode === 'partner' ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-4">
            <div className="flex items-center gap-3">
              {userSubmitted ? (
                <CheckCircle className="w-5 h-5 text-[var(--success)]" />
              ) : (
                <XCircle className="w-5 h-5 text-[var(--warning)]" />
              )}
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Your Topics</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {userSubmitted ? 'Submitted' : 'Not submitted'}
                </p>
              </div>
            </div>
          </div>

          {mode === 'partner' && (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-4">
              <div className="flex items-center gap-3">
                {partnerSubmitted ? (
                  <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                ) : (
                  <Clock className="w-5 h-5 text-[var(--warning)]" />
                )}
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">Partner's Topics</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {partnerSubmitted ? `Submitted by ${partner?.name}` : 'Waiting for partner...'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Topics Form */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 mb-6">
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
            Topics Studied
          </label>
          <textarea
            value={topicsText}
            onChange={(e) => setTopicsText(e.target.value)}
            placeholder="e.g., I studied binary trees, dynamic programming, and database normalization. Also practiced some SQL queries..."
            className="w-full h-32 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
          />

          <label className="block text-sm font-medium text-[var(--foreground)] mt-4 mb-2">
            Tags (Optional)
          </label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
              placeholder="e.g., Trees, DP, SQL"
              className="flex-1 px-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <button
              onClick={handleAddTag}
              className="px-4 py-2 bg-[var(--card-border)] hover:bg-[var(--text-muted)] text-[var(--foreground)] rounded-lg transition-colors"
            >
              Add
            </button>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-[var(--accent)]/20 text-[var(--accent)] rounded-full text-sm flex items-center gap-2"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-[var(--accent-hover)]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleSaveTopics}
            disabled={saving || !topicsText.trim()}
            className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Topics'
            )}
          </button>

          {userSubmitted && !testGenerated && (
            (mode === 'partner' && partnerSubmitted || mode === 'solo') && (
              <button
                onClick={handleGenerateTest}
                disabled={generating}
                className="flex-1 bg-[var(--success)] hover:bg-[var(--success)]/80 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Test
                  </>
                )}
              </button>
            )
          )}

          {testGenerated && (
            <button
              disabled
              className="flex-1 bg-[var(--card-border)] text-[var(--text-muted)] font-medium py-3 px-6 rounded-lg cursor-not-allowed flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Test Generated
            </button>
          )}
        </div>

        {mode === 'partner' && !partner && (
          <div className="mt-6 p-4 bg-[var(--warning)]/10 border border-[var(--warning)] rounded-lg">
            <p className="text-sm text-[var(--warning)] mb-4">
              You don't have a partner linked. Link a partner to generate tests together, or switch to Solo Mode.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                placeholder="Partner's email"
                className="flex-1 px-4 py-2 bg-[var(--background)] border border-[var(--warning)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <button
                onClick={handleLinkPartner}
                disabled={linkingPartner || !partnerEmail.trim()}
                className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {linkingPartner ? 'Linking...' : 'Link Partner'}
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

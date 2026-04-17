import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'

export async function POST(request: NextRequest) {
  try {
    const { testId, userId } = await request.json()

    if (!testId || !userId) {
      return NextResponse.json({ error: 'Test ID and User ID are required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get test details
    const { data: test, error: testError } = await supabase
      .from('tests')
      .select('*')
      .eq('id', testId)
      .single()

    if (testError || !test) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 })
    }

    // Get user's responses
    const { data: responses, error: responsesError } = await supabase
      .from('responses')
      .select('*')
      .eq('test_id', testId)
      .eq('user_id', userId)

    if (responsesError || !responses) {
      return NextResponse.json({ error: 'Responses not found' }, { status: 404 })
    }

    // Initialize Groq
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

    const sections = test.generated_questions.sections
    const sectionScores: Record<string, number> = {}
    const perQuestionFeedback: any[] = []
    let totalScore = 0

    // Evaluate each section
    for (const section of sections) {
      let sectionTotal = 0

      for (const question of section.questions) {
        const response = responses.find((r: any) => r.question_id === question.id)
        const userAnswer = response?.answer || ''

        const evaluation = await evaluateQuestion(groq, question, userAnswer)
        
        sectionTotal += evaluation.score
        perQuestionFeedback.push({
          question_id: question.id,
          question: question.question,
          user_answer: userAnswer,
          expected_answer: question.expected_answer,
          score: evaluation.score,
          feedback: evaluation.feedback,
          correct_answer_summary: evaluation.correct_answer_summary,
        })
      }

      sectionScores[section.name] = sectionTotal
      totalScore += sectionTotal
    }

    // Calculate badges
    const badges = await calculateBadges(supabase, userId, testId, perQuestionFeedback, sectionScores, totalScore)

    // Store score in Supabase
    const { data: scoreData, error: scoreError } = await supabase
      .from('scores')
      .insert({
        test_id: testId,
        user_id: userId,
        total_score: totalScore,
        section_scores: sectionScores,
        per_question_feedback: perQuestionFeedback,
        badges,
      })
      .select()
      .single()

    if (scoreError) {
      console.error('Error storing score:', scoreError)
      return NextResponse.json({ error: 'Failed to store score' }, { status: 500 })
    }

    return NextResponse.json({ success: true, score: scoreData })
  } catch (error: any) {
    console.error('Error evaluating test:', error)
    return NextResponse.json({ error: error.message || 'Failed to evaluate test' }, { status: 500 })
  }
}

async function evaluateQuestion(groq: Groq, question: any, userAnswer: string) {
  const prompt = `
You are an expert interviewer evaluating a candidate's answer.

Question:
${question.question}

Expected Answer:
${question.expected_answer}

Candidate's Answer:
${userAnswer}

Evaluate the answer and provide a JSON response with the following structure:
{
  "score": <number from 0 to 10>,
  "feedback": "<2-3 lines on what was right/wrong>",
  "correct_answer_summary": "<brief summary of what the ideal answer should cover>"
}

Scoring guidelines:
- 10: Perfect answer, covers all key points
- 8-9: Good answer, covers most key points with minor issues
- 6-7: Adequate answer, covers some key points but missing important aspects
- 4-5: Poor answer, minimal understanding
- 0-3: Incorrect or no answer

Return ONLY valid JSON, no additional text.
  `

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const responseText = completion.choices[0]?.message?.content || '{}'
    const evaluation = JSON.parse(responseText)

    return {
      score: Math.min(10, Math.max(0, evaluation.score || 0)),
      feedback: evaluation.feedback || 'No feedback available',
      correct_answer_summary: evaluation.correct_answer_summary || question.expected_answer,
    }
  } catch (error) {
    console.error('Error evaluating question:', error)
    // Fallback to basic evaluation
    return {
      score: 5,
      feedback: 'Unable to evaluate answer due to an error',
      correct_answer_summary: question.expected_answer,
    }
  }
}

async function calculateBadges(supabase: any, userId: string, testId: string, feedback: any[], sectionScores: Record<string, number>, totalScore: number) {
  const badges: string[] = []

  // Perfect HR badge
  const hrScore = sectionScores['HR / Behavioural'] || 0
  if (hrScore >= 18) {
    badges.push('Perfect HR ✨')
  }

  // Code Warrior badge
  const dsaScore = sectionScores['DSA / Coding'] || 0
  if (dsaScore >= 25) {
    badges.push('Code Warrior 💻')
  }

  // First Win badge (if total score >= 80)
  if (totalScore >= 80) {
    badges.push('First Win 🥇')
  }

  // Consistent Streak badge (3 weeks in a row with 70+ score)
  const { data: userScores } = await supabase
    .from('scores')
    .select('total_score, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(4)

  if (userScores && userScores.length >= 3) {
    const recentScores = userScores.slice(0, 3)
    const allAbove70 = recentScores.every((s: { total_score: number }) => s.total_score >= 70)
    if (allAbove70) {
      badges.push('Consistent Streak 🔥')
    }
  }

  return badges
}

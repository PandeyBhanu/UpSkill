import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'

export async function POST(request: NextRequest) {
  try {
    const { pairId, userId, mode = 'partner' } = await request.json()

    const supabase = await createClient()

    // Get this week's topics
    const startOfWeek = new Date()
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    let combinedTopics = ''
    let generatedQuestions = null

    if (mode === 'solo') {
      // Solo mode: use only the user's topics
      if (!userId) {
        return NextResponse.json({ error: 'User ID is required for solo mode' }, { status: 400 })
      }

      const { data: userTopics } = await supabase
        .from('weekly_topics')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!userTopics) {
        return NextResponse.json({ error: 'No topics found for this week' }, { status: 400 })
      }

      combinedTopics = `
User topics:
${userTopics.topics_text}
Tags: ${userTopics.tags?.join(', ') || 'None'}
      `.trim()

      // Generate questions for solo mode
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

      const prompt = `
You are an expert placement interview test generator. Generate a comprehensive test based on the following study topics:

${combinedTopics}

Generate a JSON response with the following structure:
{
  "sections": [
    {
      "name": "CS Fundamentals",
      "time_minutes": 20,
      "questions": [
        {
          "id": "unique_id",
          "type": "mcq" | "code" | "text",
          "question": "question text",
          "options": ["option1", "option2", "option3", "option4"],
          "expected_answer": "correct answer or explanation",
          "difficulty": "easy" | "medium" | "hard"
        }
      ]
    }
  ]
}

Test structure:
- Section 1: CS Fundamentals (20 minutes, 6 questions: 4 MCQ, 2 short answer)
- Section 2: DSA / Coding (35 minutes, 3 questions: 1 MCQ, 2 coding problems)
- Section 3: System Design (20 minutes, 1 open-ended question)
- Section 4: HR / Behavioural (10 minutes, 2 situational questions)

For coding questions, include a problem statement and expected approach in expected_answer.
Make questions relevant to the topics provided.
Return ONLY valid JSON, no additional text.
      `

      const result = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert placement interview test generator. Always return valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      })

      const responseText = result.choices[0].message.content || '{}'
      generatedQuestions = JSON.parse(responseText)

      // Store test for solo user
      const { data: soloTestData, error: soloTestError } = await supabase
        .from('tests')
        .insert({
          pair_id: null,
          user_id: userId,
          week_start_date: startOfWeek.toISOString().split('T')[0],
          generated_questions: generatedQuestions,
          status: 'ready',
          mode: 'solo',
        })
        .select()
        .single()

      if (soloTestError) {
        console.error('Error storing test:', soloTestError)
        return NextResponse.json({ error: 'Failed to store test' }, { status: 500 })
      }

      return NextResponse.json({ success: true, test: soloTestData })

    } else {
      // Partner mode: use both users' topics
      if (!pairId) {
        return NextResponse.json({ error: 'Pair ID is required for partner mode' }, { status: 400 })
      }

      const { data: pairData, error: pairError } = await supabase
        .from('pairs')
        .select('*')
        .eq('id', pairId)
        .single()

      if (pairError || !pairData) {
        return NextResponse.json({ error: 'Pair not found' }, { status: 404 })
      }

      const { data: user1Topics } = await supabase
        .from('weekly_topics')
        .select('*')
        .eq('user_id', pairData.user1_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const { data: user2Topics } = await supabase
        .from('weekly_topics')
        .select('*')
        .eq('user_id', pairData.user2_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!user1Topics || !user2Topics) {
        return NextResponse.json({ error: 'Both users must submit topics before generating test' }, { status: 400 })
      }

      combinedTopics = `
User 1 topics:
${user1Topics.topics_text}
Tags: ${user1Topics.tags?.join(', ') || 'None'}

User 2 topics:
${user2Topics.topics_text}
Tags: ${user2Topics.tags?.join(', ') || 'None'}
      `.trim()

      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

      const prompt = `
You are an expert placement interview test generator. Generate a comprehensive test based on the following study topics:

${combinedTopics}

Generate a JSON response with the following structure:
{
  "sections": [
    {
      "name": "CS Fundamentals",
      "time_minutes": 20,
      "questions": [
        {
          "id": "unique_id",
          "type": "mcq" | "code" | "text",
          "question": "question text",
          "options": ["option1", "option2", "option3", "option4"],
          "expected_answer": "correct answer or explanation",
          "difficulty": "easy" | "medium" | "hard"
        }
      ]
    }
  ]
}

Test structure:
- Section 1: CS Fundamentals (20 minutes, 6 questions: 4 MCQ, 2 short answer)
- Section 2: DSA / Coding (35 minutes, 3 questions: 1 MCQ, 2 coding problems)
- Section 3: System Design (20 minutes, 1 open-ended question)
- Section 4: HR / Behavioural (10 minutes, 2 situational questions)

For coding questions, include a problem statement and expected approach in expected_answer.
Make questions relevant to the topics provided.
Return ONLY valid JSON, no additional text.
      `

      const result = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert placement interview test generator. Always return valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      })

      const responseText = result.choices[0].message.content || '{}'
      generatedQuestions = JSON.parse(responseText)

      const { data: partnerTestData, error: partnerTestError } = await supabase
        .from('tests')
        .insert({
          pair_id: pairId,
          week_start_date: startOfWeek.toISOString().split('T')[0],
          generated_questions: generatedQuestions,
          status: 'ready',
          mode: 'partner',
        })
        .select()
        .single()

      if (partnerTestError) {
        console.error('Error storing test:', partnerTestError)
        return NextResponse.json({ error: 'Failed to store test' }, { status: 500 })
      }

      return NextResponse.json({ success: true, test: partnerTestData })
    }
  } catch (error: any) {
    console.error('Error generating test:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate test' }, { status: 500 })
  }
}


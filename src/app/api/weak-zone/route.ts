import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

export async function POST(request: NextRequest) {
  try {
    const { scores } = await request.json()

    if (!scores || scores.length === 0) {
      return NextResponse.json({ error: 'No scores provided' }, { status: 400 })
    }

    // Initialize Groq
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

    // Prepare score data for analysis
    const scoreSummary = scores.map((score: any) => ({
      date: new Date(score.test?.week_start_date || score.created_at).toLocaleDateString(),
      total: score.total_score,
      sections: score.section_scores,
    }))

    const prompt = `
You are an expert career coach and placement preparation advisor. Analyze the following test score data for a student and provide a concise weak zone analysis.

Score Data (last ${scores.length} tests):
${JSON.stringify(scoreSummary, null, 2)}

Provide a brief paragraph (2-3 sentences) that:
1. Identifies the student's weakest areas based on the data
2. Suggests specific topics to focus on next week
3. Provides actionable advice for improvement

Be specific and practical. Focus on patterns in the data rather than individual test variations.

Return ONLY the analysis paragraph, no additional text or JSON formatting.
    `

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
    })

    const summary = completion.choices[0]?.message?.content || 'Unable to generate analysis at this time.'

    return NextResponse.json({ summary })
  } catch (error: any) {
    console.error('Error generating weak zone summary:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate analysis' }, { status: 500 })
  }
}

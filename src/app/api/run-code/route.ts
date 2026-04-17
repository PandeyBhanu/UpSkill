import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { code, language, input } = await request.json()

    if (!code || !language) {
      return NextResponse.json({ error: 'Code and language are required' }, { status: 400 })
    }

    // Map language names to Piston language names
    const languageMap: Record<string, string> = {
      python: 'python',
      java: 'java',
      cpp: 'c++',
    }

    const pistonLanguage = languageMap[language.toLowerCase()]
    if (!pistonLanguage) {
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })
    }

    // Call Piston API (public instance)
    const response = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        language: pistonLanguage,
        version: '*',
        files: [
          {
            content: code,
          },
        ],
        stdin: input || '',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Piston API error:', errorText)
      return NextResponse.json({ error: 'Failed to execute code' }, { status: 500 })
    }

    const result = await response.json()

    return NextResponse.json({
      stdout: result.run?.stdout || '',
      stderr: result.run?.stderr || '',
      compile_output: result.compile?.output || '',
      status: result.run?.code === 0 ? 'Success' : 'Error',
      time: result.run?.stdout ? (result.run.stdout.length / 1000).toFixed(3) : '0',
      memory: 'N/A',
    })
  } catch (error: any) {
    console.error('Error running code:', error)
    return NextResponse.json({ error: error.message || 'Failed to run code' }, { status: 500 })
  }
}

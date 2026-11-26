export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const hfToken = process.env.HF_TOKEN;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!hfToken && !geminiKey) {
    return new Response(
      JSON.stringify({ error: 'No LLM API key configured (set HF_TOKEN for Hugging Face Llama 3 or GEMINI_API_KEY)' }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { mode, prompt, workspaceContext } = await req.json();

    const systemInstruction = `You are CircuitFab AI, an expert electrical engineering & digital logic tutor embedded inside the CircuitFab web simulator.
You are grounded in CircuitFab's exact physics engine and component catalog:
- Shockley PN-junction diode/LED model (Red LED Vf=1.8V, 30mA max; Si diode Vf=0.7V)
- Ebers-Moll BJT model (NPN/PNP with Early effect VA=100V) and Level-1 MOSFET model
- ATmega328P Arduino Uno R3 (5V rail, D13/D11/D9 digital/PWM outputs with 40mA max/pin, A0 10-bit ADC)
- iCE40-style FPGA LUT4 (16-row 2-output Look-Up Table I0..I3 -> Y0, Y1)
- 0.25W 1/4W resistors, 16V electrolytic capacitors, 5.1V Zener diodes, 3-pin potentiometers, resettable fuses, piezo buzzers, SR latches, 4-bit counters, and shift registers.

Mode: ${mode || 'explain'}
- If mode is "explain": Explain how the user's LIVE circuit works using the exact voltages, currents, power, and wiring netlist provided below. Diagnose any blown/overloaded or unwired parts. If the user just says "hi" or greets you, greet them warmly and give a 1-2 sentence overview of what's on their board.
- If mode is "brainstorm": Suggest 2-3 creative, practical projects tailored to the parts currently on the user's board.
- If mode is "parts": Thoroughly explain the requested component's physics, pinout, ratings, and how any instances on the board are behaving.

Keep your answer clear, educational, accurate, and concise (under 180 words). Do not use emojis.

LIVE WORKSPACE STATE:
${workspaceContext || 'Empty workspace'}`;

    // Prefer Hugging Face Llama 3 if HF_TOKEN is configured
    if (hfToken) {
      const hfRes = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/Llama-3.1-8B-Instruct',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt?.trim() || `Analyze my current circuit in ${mode} mode.` },
          ],
          temperature: 0.4,
          max_tokens: 400,
        }),
      });

      if (hfRes.ok) {
        const hfData = await hfRes.json();
        const replyText = hfData?.choices?.[0]?.message?.content?.trim();
        if (replyText) {
          return new Response(JSON.stringify({ reply: replyText, provider: 'llama3' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Fallback to Gemini API if GEMINI_API_KEY is configured
    if (geminiKey) {
      const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
      let lastDetail = '';
      for (const model of models) {
        const genConfig: Record<string, unknown> = {
          temperature: 0.4,
          maxOutputTokens: 500,
        };
        if (model === 'gemini-2.5-flash') {
          genConfig.thinkingConfig = { thinkingBudget: 0 };
        }
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemInstruction }] },
              contents: [
                {
                  role: 'user',
                  parts: [{ text: prompt?.trim() || `Analyze my current circuit in ${mode} mode.` }],
                },
              ],
              generationConfig: genConfig,
            }),
          }
        );

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (replyText) {
            return new Response(JSON.stringify({ reply: replyText, provider: model }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        } else {
          lastDetail = `${model}: ${geminiRes.status} ${await geminiRes.text()}`;
        }
      }
      return new Response(
        JSON.stringify({ error: 'Upstream LLM provider returned an error', detail: lastDetail }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Upstream LLM provider returned an error' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

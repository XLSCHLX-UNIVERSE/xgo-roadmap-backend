// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();

// ====== MIDDLEWARE ======
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====== HEALTH CHECK ======
app.get('/test', (req, res) => {
  res.json({
    ok: true,
    message: 'xGO GETTERSx Roadmap backend is live ✅'
  });
});

// ====== OPENAI CLIENT ======
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ====== YOUR PERMANENT VOICE DNA ======
const CHRIS_TONE = `
You are the voice of Chris Villagracia — founder of xGO GETTERSx.

Write exactly like him using these rules:

- Simple, real talk.
- Speak with emotion and clarity, like a mentor who truly cares.
- Use short, powerful sentences with space between them.
- Sound like a friend who believes in them.
- Use emojis naturally (1 per sentence max 2, never spam).
- Bold key words or ideas.
- Every message should end with motivation or a next step.
- Stay warm, cinematic, and deeply human.
- Never sound robotic or over-formal.
`;

// ====== MAIN WEBHOOK ROUTE ======
app.post('/api/roadmap', async (req, res) => {
  try {
    console.log('🔔 Incoming GHL webhook:');
    console.log(JSON.stringify(req.body, null, 2));

    // Extract contact + roadmap info
    const contact =
      req.body.contact ||
      req.body.contactData ||
      req.body.contact_details ||
      req.body.contactRecord ||
      req.body;

    const firstName =
      contact?.first_name ||
      contact?.firstName ||
      contact?.name ||
      'friend';

    const goal =
      req.body["What’s your biggest goal in life right now?"] ||
      req.body.goal ||
      'get results';

    const stuck =
      req.body["What’s making you feel stuck right now?"] ||
      req.body.stuck ||
      '';

    const level =
      req.body.level ||
      req.body.plan ||
      req.body.package ||
      req.body.tier ||
      'free';

    // ====== MODEL LOGIC BY LEVEL ======
    let model;
    if (
      level.includes('Level 1') ||
      level.includes('Level 2') ||
      level.toLowerCase().includes('spark') ||
      level.toLowerCase().includes('breakthrough') ||
      level.toLowerCase().includes('300') ||
      level.toLowerCase().includes('900') ||
      level.toLowerCase().includes('free')
    ) {
      model = 'gpt-4o'; // emotional, cinematic, perfect for initial clients
    } else {
      model = 'gpt-5-nano'; // premium, faster, deeper reasoning
    }

    console.log(`💡 Using model: ${model}`);

    // ====== PROMPT BUILDER ======
    const prompt = `
Create a personalized 30-day roadmap for ${firstName}.
Their main goal: ${goal}.
What’s holding them back: ${stuck}.

Use the voice of Chris Villagracia (xGO GETTERSx).

Write as if you're talking directly to them:
- Encourage without overdoing it.
- Keep sentences short and real.
- Include relevant emojis for emotion.
- Give 3–5 clear steps or phases.
- End with a "Next Move" or "Stay consistent" line.

Make it feel like Chris is personally guiding them toward their comeback.
    `.trim();

    // ====== GENERATE RESPONSE WITH FAILOVER ======
    let roadmapText;
    let source = 'primary';

    try {
      console.log(`🎯 Generating roadmap with ${model}...`);
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: CHRIS_TONE },
          { role: 'user', content: prompt }
        ],
        temperature: 0.9,
        max_tokens: 800
      });

      roadmapText =
        completion.choices[0]?.message?.content?.trim() ||
        'Roadmap unavailable.';
    } catch (primaryError) {
      console.error('⚠️ Primary model failed:', primaryError.message);
      console.log('🔄 Switching to backup model: gpt-4o');

      const fallback = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: CHRIS_TONE },
          { role: 'user', content: prompt }
        ],
        temperature: 0.9,
        max_tokens: 800
      });

      roadmapText =
        fallback.choices[0]?.message?.content?.trim() ||
        'Fallback roadmap unavailable.';
      source = 'fallback';
    }

    console.log('✅ Generated Roadmap:\n', roadmapText);

    res.status(200).json({
      ok: true,
      model,
      source,
      roadmap: roadmapText
    });
  } catch (error) {
    console.error('❌ Error in /api/roadmap:', error.response?.data || error.message || error);

    const status = error.status || error.response?.status || 500;
    res.status(status).json({
      ok: false,
      error:
        status === 429
          ? 'OpenAI quota/billing issue — check your plan or key.'
          : 'Roadmap generation failed.'
    });
  }
});

// ====== START SERVER ======
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 xGO GETTERSx backend running on port ${PORT}`);
});
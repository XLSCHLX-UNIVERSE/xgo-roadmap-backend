// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const axios = require('axios');

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

Rules:
- Simple, real talk.
- Speak with emotion and clarity, like a mentor who truly cares.
- Use short, punchy sentences with breathing room.
- Sound like a close friend who believes in them.
- Use emojis naturally (about 1 per sentence, never spam).
- Bold key words or lines that should hit.
- Always end with a clear "Next Move" or encouragement.
- Warm, cinematic, human. Never robotic or corporate.
`;

// ====== HELPERS ======

function extractContactInfo(body) {
  const contact =
    body.contact ||
    body.contactData ||
    body.contact_details ||
    body.contactRecord ||
    body;

  const firstName =
    contact?.first_name ||
    contact?.firstName ||
    contact?.full_name ||
    contact?.name ||
    body.first_name ||
    'friend';

  const goal =
    body["What’s your biggest goal in life right now?"] ||
    body["What's your biggest goal in life right now?"] ||
    body.goal ||
    'get clear and move forward';

  const stuck =
    body["What’s making you feel stuck right now?"] ||
    body["What's making you feel stuck right now?"] ||
    body.stuck ||
    '';

  const level =
    body.level ||
    body.plan ||
    body.package ||
    body.tier ||
    'free';

  // GHL contact id can appear in a few spots
  const contactId =
    body.contact_id ||
    contact?.id ||
    contact?.contact_id ||
    null;

  return { firstName, goal, stuck, level, contactId };
}

function chooseModel(levelRaw = '') {
  const level = String(levelRaw || '').toLowerCase();

  // Free / 300 / 900 tiers → GPT-4o
  if (
    level.includes('level 1') ||
    level.includes('spark') ||
    level.includes('300') ||
    level.includes('free') ||
    level.includes('level 2') ||
    level.includes('breakthrough') ||
    level.includes('900')
  ) {
    return 'gpt-4o';
  }

  // Higher tiers → GPT-5-nano (cheaper/faster w/ failover)
  return 'gpt-5-nano';
}

function buildPrompt({ firstName, goal, stuck, level }) {
  return `
The person just filled out Chris Villagracia's xGO GETTERSx roadmap form.

Name to speak to: ${firstName}
Main goal (their words): ${goal}
Current struggle / what's making them feel stuck: ${stuck}
Program level or offer they came through: ${level}

You are Chris. Create a **simple, real, 3-goal roadmap** in his exact style:

Format & style rules:
- Start with 1–2 supportive lines that show you see them.
- Then give 3 clear Goals (Goal 1, Goal 2, Goal 3).
- Under each goal, give 3 concrete Ideas / actions.
- Make it feel doable for the next 30 days.
- Use bold for key phrases.
- Short paragraphs. No walls of text.
- Use emojis for emotion & energy, but never spam.
- No therapy talk, no corporate talk. Straight, kind, practical.
- End with a **Next Move** line that tells them exactly what to do today.

This should feel like:
"Good. Let’s hit it. 🧠🔥
Here’s your roadmap…"
  `.trim();
}

async function generateRoadmap({ model, prompt }) {
  try {
    console.log(`🎯 Generating roadmap with ${model}...`);

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: CHRIS_TONE },
        { role: 'user', content: prompt }
      ],
      temperature: 0.9,
      max_tokens: 900
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (text) return { text, model, source: 'primary' };

    throw new Error('Empty completion from primary model');
  } catch (err) {
    console.error('⚠️ Primary model error:', err.message || err);

    // Failover to GPT-4o
    try {
      console.log('🔄 Falling back to gpt-4o...');
      const fallback = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: CHRIS_TONE },
          { role: 'user', content: prompt }
        ],
        temperature: 0.9,
        max_tokens: 900
      });

      const text = fallback.choices[0]?.message?.content?.trim();
      if (!text) throw new Error('Empty completion from fallback model');

      return { text, model: 'gpt-4o', source: 'fallback' };
    } catch (fallbackErr) {
      console.error('❌ Fallback model error:', fallbackErr.message || fallbackErr);
      return { text: null, model: null, source: 'failed' };
    }
  }
}

async function saveRoadmapToGHL(contactId, roadmapText) {
  if (!contactId) {
    console.warn('⚠️ No contactId provided; cannot push roadmap to GHL.');
    return;
  }
  if (!process.env.GHL_API_KEY) {
    console.warn('⚠️ Missing GHL_API_KEY env var; cannot push roadmap to GHL.');
    return;
  }
  if (!roadmapText) {
    console.warn('⚠️ No roadmap text to save.');
    return;
  }

  try {
    console.log(`📨 Pushing roadmap to GHL contact ${contactId}...`);

    // For GHL: use your AI Roadmap custom field unique key.
    // From your screenshots / merge tag it's: {{contact.ai_roadmap}}
    // So we send: customField: { ai_roadmap: "..." }
    await axios({
      method: 'put',
      url: `https://rest.gohighlevel.com/v1/contacts/${contactId}`,
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        customField: {
          ai_roadmap: roadmapText
        }
      }
    });

    console.log('✅ Roadmap saved to GHL contact field ai_roadmap.');
  } catch (err) {
    console.error(
      '❌ Failed to save roadmap to GHL:',
      err.response?.data || err.message || err
    );
  }
}

// ====== MAIN WEBHOOK ROUTE (ASYNC, FIRE-AND-FORGET) ======
app.post('/api/roadmap', (req, res) => {
  console.log('🔔 Incoming GHL webhook:');
  console.log(JSON.stringify(req.body, null, 2));

  const { firstName, goal, stuck, level, contactId } = extractContactInfo(req.body);
  const model = chooseModel(level);
  const prompt = buildPrompt({ firstName, goal, stuck, level });

  // 1) Immediately acknowledge to GHL so it doesn't timeout.
  res.status(200).json({
    ok: true,
    message: 'Roadmap request received. AI is generating their custom roadmap now.'
  });

  // 2) Generate & push roadmap in the background.
  (async () => {
    const { text: roadmapText, model: usedModel, source } =
      await generateRoadmap({ model, prompt });

    if (!roadmapText) {
      console.error('🚫 No roadmap generated; skipping GHL update.');
      return;
    }

    console.log('✅ Generated Roadmap with', usedModel, `(${source}):\n`, roadmapText);

    await saveRoadmapToGHL(contactId, roadmapText);
  })().catch((err) => {
    console.error('🔥 Unhandled error in background roadmap task:', err);
  });
});

// ====== START SERVER ======
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 xGO GETTERSx backend running on port ${PORT}`);
});
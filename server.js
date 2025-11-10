// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');

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

// ====== HELPER: Extract contact info from GHL webhook ======
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

  const contactId =
    body.contact_id ||
    contact?.id ||
    contact?.contact_id ||
    null;

  return { firstName, goal, stuck, level, contactId };
}

// ====== HELPER: Choose model by tier ======
function chooseModel(levelRaw = '') {
  const level = String(levelRaw || '').toLowerCase();

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

  return 'gpt-5-nano';
}

// ====== HELPER: Build roadmap prompt ======
function buildPrompt({ firstName, goal, stuck, level }) {
  return `
The person just filled out Chris Villagracia's xGO GETTERSx roadmap form.

Name to speak to: ${firstName}
Main goal (their words): ${goal}
Current struggle / what's making them feel stuck: ${stuck}
Program level or offer they came through: ${level}

You are Chris. Create a **simple, real, 3-goal roadmap** in his exact style.

Format & style rules:
- Start with 1–2 supportive lines that show you see them.
- Then give **Goal 1, Goal 2, Goal 3**.
- Under each goal, give **3 concrete ideas / actions**.
- Make it feel doable for the next 30 days.
- Short paragraphs. No walls of text.
- Bold key phrases that should hit.
- Use emojis naturally for emotion & energy, never spam.
- No therapy-speak. No corporate-speak.
- End with a bold **Next Move** that tells them exactly what to do today.
- It should feel like: "Good. Let’s hit it. 🧠🔥 Here’s your roadmap..."
  `.trim();
}

// ====== HELPER: Generate roadmap with failover ======
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

    // Failover → GPT-4o
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

// ====== EMAIL TRANSPORT (OPTIONAL) ======
let transporter = null;

if (
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.ROADMAP_NOTIFY_EMAIL
) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  console.log('📨 SMTP configured: roadmap emails enabled.');
} else {
  console.log(
    '⚠️ SMTP not configured. Roadmaps will be logged only (no auto emails).'
  );
}

// ====== HELPER: Email roadmap to you (if SMTP configured) ======
async function emailRoadmapToOwner({
  firstName,
  contactId,
  clientEmail,
  goal,
  stuck,
  roadmapText
}) {
  if (!transporter) return;

  const to = process.env.ROADMAP_NOTIFY_EMAIL;
  if (!to) return;

  const from = process.env.EMAIL_FROM || to;
  const subject = `New Simple Roadmap - ${firstName || 'New Lead'}`;

  const text = `
You’ve got a new roadmap to review and send. 🚀

--- CONTACT INFO ---
Name: ${firstName || 'N/A'}
Contact ID: ${contactId || 'N/A'}
Client Email: ${clientEmail || 'N/A'}
Main Goal: ${goal || 'N/A'}
Stuck On: ${stuck || 'N/A'}

--- ROADMAP (COPY/PASTE TO CLIENT) ---
${roadmapText}

— xGO GETTERSx Auto-System
`.trim();

  try {
    await transporter.sendMail({ from, to, subject, text });
    console.log(`📧 Roadmap emailed to ${to}`);
  } catch (err) {
    console.error('❌ Error sending roadmap email:', err.message || err);
  }
}

// ====== MAIN WEBHOOK ROUTE ======
app.post('/api/roadmap', (req, res) => {
  console.log('🔔 Incoming GHL webhook:');
  console.log(JSON.stringify(req.body, null, 2));

  const { firstName, goal, stuck, level, contactId } = extractContactInfo(req.body);
  const model = chooseModel(level);
  const prompt = buildPrompt({ firstName, goal, stuck, level });

  const clientEmail =
    req.body.email ||
    req.body.contact?.email ||
    req.body.contact_details?.email ||
    null;

  // Respond fast so GHL is happy
  res.status(200).json({
    ok: true,
    message: 'Roadmap request received. AI is generating their custom roadmap now.'
  });

  // Generate roadmap (and optionally email/log it)
  (async () => {
    const { text: roadmapText, model: usedModel, source } =
      await generateRoadmap({ model, prompt });

    if (!roadmapText) {
      console.error('🚫 No roadmap generated; skipping.');
      return;
    }

    console.log('✅ Generated Roadmap with', usedModel, `(${source})`);
    console.log('✉️ ROADMAP READY (copy this to send to client):');
    console.log('--- CONTACT INFO ---');
    console.log('Name:', firstName || 'N/A');
    console.log('Contact ID:', contactId || 'N/A');
    console.log('Client Email:', clientEmail || 'N/A');
    console.log('--- ROADMAP ---');
    console.log(roadmapText);
    console.log('--------------------');

    await emailRoadmapToOwner({
      firstName,
      contactId,
      clientEmail,
      goal,
      stuck,
      roadmapText
    });
  })().catch((err) => {
    console.error('🔥 Unhandled error in background roadmap task:', err);
  });
});

// ====== START SERVER ======
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 xGO GETTERSx backend running on port ${PORT}`);
});
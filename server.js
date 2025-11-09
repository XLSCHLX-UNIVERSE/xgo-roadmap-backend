// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();

// ----- MIDDLEWARE -----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----- HEALTH CHECK / TEST -----
app.get('/test', (req, res) => {
  res.json({
    ok: true,
    message: 'Webhook reached the backend successfully.'
  });
});

// ----- OPENAI CLIENT -----
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ----- MAIN WEBHOOK ROUTE -----
app.post('/api/roadmap', async (req, res) => {
  try {
    console.log('🔔 Incoming GHL webhook:');
    console.log(JSON.stringify(req.body, null, 2));

    // Try to normalize contact data from GHL/webhook.site
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
      req.body.Goal ||
      'get results';

    const stuck =
      req.body["What’s making you feel stuck right now?"] ||
      req.body.stuck ||
      req.body.challenge ||
      '';

    // Build the prompt for OpenAI
    const prompt = `
You are an expert coach creating a clear, encouraging 30-day roadmap.

User name: ${firstName}
Main goal: ${goal}
Current struggle: ${stuck}

Write a short, punchy roadmap email they’ll receive immediately after filling out the form.

Requirements:
- Warm, confident tone.
- 3–5 clear phases or steps (with time frames).
- Bullet points where helpful.
- End with a simple call-to-action to reply or book a call.
    `.trim();

    // Call OpenAI
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: 'You write concise, clear, highly practical roadmaps.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 600
    });

    const roadmapText = completion.choices[0]?.message?.content || '';

    // Log for debugging
    console.log('✅ Generated roadmap:\n', roadmapText);

    // Respond to the webhook caller (GHL)
    return res.status(200).json({
      ok: true,
      message: 'Roadmap generated successfully.',
      roadmap: roadmapText
    });

  } catch (error) {
    console.error('❌ Error in /api/roadmap:', error.response?.data || error.message || error);
    return res.status(500).json({
      ok: false,
      message: 'Failed to generate roadmap.',
      error: error.message || 'Unknown error'
    });
  }
});

// ----- START SERVER -----
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`xGO GETTERSx Roadmap API running on port ${PORT}`);
});

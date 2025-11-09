require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== HEALTH CHECK / TEST =====
app.get('/test', (req, res) => {
  res.json({
    ok: true,
    message: 'Webhook reached the backend successfully.'
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`xGO GETTERSx Roadmap API running on port ${PORT}`);
});

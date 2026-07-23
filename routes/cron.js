const express = require('express');
const router = express.Router();
const { sendDailySummaries } = require('../services/dailySummaryJob');

// Triggered by Vercel Cron (see vercel.json "crons") once daily, in place of the
// in-process node-cron scheduler used when this runs as a traditional always-on
// server — a serverless function can't hold a setInterval-style scheduler alive
// between invocations. Optionally protected by CRON_SECRET so the endpoint can't
// be triggered by anyone who finds the URL; set it in Vercel's project settings
// and it'll automatically send it as a Bearer token on scheduled invocations.
router.get('/daily-summary', async (req, res) => {
  const providedSecret = req.headers['authorization']?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    await sendDailySummaries();
    res.json({ success: true, message: 'Daily summaries sent' });
  } catch (err) {
    console.error('Daily summary cron failed:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

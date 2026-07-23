const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const sequelize = require('./config/database');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/violations', require('./routes/violations'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/telemetry', require('./routes/telemetry'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/cron', require('./routes/cron'));

app.get('/', (req, res) => {
  res.send('DMS Backend API is running.');
});

// "On Break" was dropped from the Driver.status enum — fold any existing rows
// into "Off Duty" *before* sync/alter rewrites the table with the narrower
// CHECK constraint, otherwise the rewrite would reject those old rows.
const syncDb = () =>
  sequelize.query("UPDATE \"Drivers\" SET status = 'Off Duty' WHERE status = 'On Break'")
    .catch(() => { /* table may not exist yet on a brand-new database */ })
    .then(() => sequelize.sync({ alter: true }))
    .then(() => console.log('Database synced'))
    .catch(err => console.error('Database sync warning (non-fatal):', err.message));

if (require.main === module) {
  // Running as a traditional always-on server (plain `node index.js`, or hosts
  // like Render/Railway) — sync the schema, start the in-process daily-summary
  // scheduler, and listen. On Vercel, this file is imported (require.main !==
  // module) rather than run directly: schema sync still happens below, but there's
  // no persistent process to hold a cron scheduler or Firestore listener open, so
  // neither starts — the daily summary instead runs via Vercel Cron hitting
  // /api/cron/daily-summary (see routes/cron.js + vercel.json).
  const { startDailySummaryJob } = require('./services/dailySummaryJob');
  syncDb().finally(() => {
    startDailySummaryJob();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  });
} else {
  syncDb();
}

module.exports = app;

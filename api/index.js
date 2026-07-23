// Vercel serverless entrypoint. All requests get routed here via vercel.json's
// rewrite; this just hands them to the same Express app used for traditional
// hosting (Render/Railway/local) — index.js exports it without calling
// app.listen() when it's `require`d instead of run directly.
module.exports = require('../index.js');

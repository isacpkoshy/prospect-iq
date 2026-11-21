import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { getServerConfig } from './config.js';
import { initBrevoEmailConfig } from './services/brevoEmail.js';
import { apiRouter } from './routes/api.js';

const app = express();
const config = getServerConfig();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Initialize Brevo DPAPI / env credentials on startup
initBrevoEmailConfig();

app.use('/api', apiRouter);

// Serve built Vite frontend in production (single-link deployment)
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const host = process.env.HOST || '0.0.0.0';
app.listen(config.port, host, () => {
  console.log(`ProspectIQ API server listening at http://${host}:${config.port}`);
});

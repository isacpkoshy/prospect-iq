import express from 'express';
import cors from 'cors';
import { getServerConfig } from './config.js';
import { initBrevoEmailConfig } from './services/brevoEmail.js';
import { apiRouter } from './routes/api.js';

const app = express();
const config = getServerConfig();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Initialize Brevo DPAPI credentials on startup
initBrevoEmailConfig();

app.use('/api', apiRouter);

app.listen(config.port, '127.0.0.1', () => {
  console.log(`ProspectIQ API server listening at http://127.0.0.1:${config.port}`);
});

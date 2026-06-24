import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes';
import profileRoutes from './routes/profileRoutes';
import resumeRoutes from './routes/resumeRoutes';
import jobRoutes from './routes/jobRoutes';
import workflowRoutes from './routes/workflowRoutes';
import coverLetterRoutes from './routes/coverLetterRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
// Local dev: frontend on :5501, API on :5000 — avoid headers that make the browser hide the response body.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false
  })
);
app.use(express.json());

// Avoid "API is down" when opening the server root in a browser (otherwise Express returns 404).
app.get('/', (_req, res) => {
  res.json({
    service: 'resume-api',
    health: '/health',
    hint: 'REST routes live under /api — e.g. POST /api/auth/login, GET /api/profile (with Bearer token).'
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', profileRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/cover-letters', coverLetterRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
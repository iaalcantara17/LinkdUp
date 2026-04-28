import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { supabaseAdmin } from './db';
import { errorHandler } from './middleware/error';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import schoolsRoutes from './routes/schools';
import partyRoutes from './routes/party';
import voteRoutes from './routes/vote';
import matchRoutes from './routes/match';
import datesRoutes from './routes/dates';
import calendarRoutes from './routes/calendar';
import discoverRoutes from './routes/discover';
import feedRoutes from './routes/feed';
import friendsRoutes from './routes/friends';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
// Raised to 5 MB to accommodate base64-encoded avatar images
app.use(express.json({ limit: '5mb' }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '0.1.0', env: config.nodeEnv });
});

app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/party', partyRoutes);
app.use('/api/party', voteRoutes);
app.use('/api/party', matchRoutes);
app.use('/api/party', datesRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/discover', discoverRoutes);
app.use('/api/discover', feedRoutes);
app.use('/api/friends', friendsRoutes);

app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
});

app.use(errorHandler);

// Ensure storage buckets exist. Fire-and-forget: safe to re-run on restart.
supabaseAdmin.storage
    .createBucket('avatars', { public: true, fileSizeLimit: 5 * 1024 * 1024 })
    .catch(() => { /* bucket already exists — ignore */ });
supabaseAdmin.storage
    .createBucket('feed-photos', { public: true, fileSizeLimit: 10 * 1024 * 1024 })
    .catch(() => { /* bucket already exists — ignore */ });

app.listen(config.port, () => {
    console.log(`LinkdUp API listening on http://localhost:${config.port}`);
});

// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const profileRoutes = require('./routes/profile');
const videoRoutes = require('./routes/videos');
const certificateRoutes = require('./routes/certificate');

const app = express();

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g., curl, Postman)
    if (!origin) return callback(null, true);

    const isChromeExtension = origin.startsWith('chrome-extension://');
    const isYouTube = /^(https:\/\/)([a-z0-9-]+\.)*youtube\.com$/i.test(origin) || /^(https:\/\/)([a-z0-9-]+\.)*studio\.youtube\.com$/i.test(origin);
    const isLocalhost = /^http:\/\/localhost(?::\d+)?$/i.test(origin) || /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin);

    if (isChromeExtension || isYouTube || isLocalhost) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // we do not use cookies
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // handle preflight requests globally

app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

app.use('/profile', profileRoutes);        // POST /profile/save, GET /profile/:email
app.use('/video', videoRoutes);            // POST /video/complete, GET /video/completed/:email
app.use('/certificate', certificateRoutes);// GET /certificate/:email/:id

app.get('/', (req, res) => res.send('YT backend running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const profileRoutes = require('./routes/profile');
const videoRoutes = require('./routes/videos');
const certificateRoutes = require('./routes/certificate');

const app = express();

// Enhanced CORS configuration for Render deployment
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g., curl, Postman)
    if (!origin) return callback(null, true);

    const isChromeExtension = origin.startsWith('chrome-extension://');
    const isYouTube = /^(https:\/\/)([a-z0-9-]+\.)*youtube\.com$/i.test(origin) || /^(https:\/\/)([a-z0-9-]+\.)*studio\.youtube\.com$/i.test(origin);
    const isLocalhost = /^http:\/\/localhost(?::\d+)?$/i.test(origin) || /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin);
    const isRender = /^https:\/\/.*\.onrender\.com$/i.test(origin);

    if (isChromeExtension || isYouTube || isLocalhost || isRender) {
      return callback(null, true);
    }

    // Log blocked origins for debugging
    console.log(`CORS blocked for origin: ${origin}`);
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
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development',
    port: PORT
  });
});

// MongoDB connection with better error handling
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  // Don't exit immediately in production, let the app try to reconnect
  if (process.env.NODE_ENV === 'production') {
    console.log('🔄 Attempting to reconnect to MongoDB...');
    setTimeout(() => {
      mongoose.connect(MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }).catch(console.error);
    }, 5000);
  } else {
    process.exit(1);
  }
});

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

app.use('/profile', profileRoutes);        // POST /profile/save, GET /profile/:email
app.use('/video', videoRoutes);            // POST /video/complete, GET /video/completed/:email
app.use('/certificate', certificateRoutes);// GET /certificate/:email/:id

app.get('/', (req, res) => res.send('YT backend running on Render'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check available at: /health`);
});

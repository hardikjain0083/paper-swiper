// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const profileRoutes = require('./routes/profile');
const videoRoutes = require('./routes/videos');
const certificateRoutes = require('./routes/certificate');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

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

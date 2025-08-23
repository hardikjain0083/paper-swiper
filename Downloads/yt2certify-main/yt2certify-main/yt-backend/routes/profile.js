// routes/profile.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Save or update profile
router.post('/save', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!email) return res.status(400).json({ message: 'email required' });

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ name: name || '', email, completedVideos: [], playlists: [] });
    } else {
      user.name = name || user.name;
    }
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving profile' });
  }
});

// Get profile by email
router.get('/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

module.exports = router;

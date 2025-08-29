// routes/videos.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// POST /video/complete
// payload: { email, videoId, title, playlistId(optional), playlistTitle(optional), totalVideos(optional) }
router.post('/complete', async (req, res) => {
  try {
    const { email, videoId, title, playlistId, playlistTitle, totalVideos } = req.body;
    if (!email || !videoId || !title) return res.status(400).json({ message: 'email/videoId/title required' });

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ name: '', email, completedVideos: [], playlists: [] });
    }

    // Single video (not playlist)
    if (!playlistId) {
      const exists = user.completedVideos.some(v => v.videoId === videoId);
      if (!exists) {
        user.completedVideos.push({ videoId, title, completedAt: new Date() });
        await user.save();
      }
      return res.json({ success: true, message: 'Single video saved' });
    }

    // Playlist mode
    let playlist = user.playlists.find(p => p.playlistId === playlistId);
    if (!playlist) {
      playlist = {
        playlistId,
        playlistTitle: playlistTitle || '',
        completedVideos: [],
        totalVideos: totalVideos || 0
      };
      user.playlists.push(playlist);
    }

    if (!playlist.completedVideos.includes(videoId)) {
      playlist.completedVideos.push(videoId);
      if (playlist.totalVideos && playlist.completedVideos.length === playlist.totalVideos) {
        playlist.completedAt = new Date();
      }
      await user.save();
    }

    return res.json({ success: true, message: 'Playlist progress saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving completion' });
  }
});

// GET /video/completed/:email -> return completedVideos + playlists summary
router.get('/completed/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const playlists = (user.playlists || []).map(p => ({
      playlistId: p.playlistId,
      playlistTitle: p.playlistTitle,
      completedCount: p.completedVideos.length,
      totalVideos: p.totalVideos || 0,
      completedAt: p.completedAt || null
    }));

    res.json({
      completedVideos: user.completedVideos || [],
      playlists
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching completed list' });
  }
});

module.exports = router;

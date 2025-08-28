// models/User.js
const mongoose = require('mongoose');

const CompletedVideoSchema = new mongoose.Schema({
  videoId: String,
  title: String,
  playlistId: String,
  completedAt: Date
}, { _id: false });

const PlaylistSchema = new mongoose.Schema({
  playlistId: String,
  playlistTitle: String,
  completedVideos: [String], // array of videoIds
  totalVideos: { type: Number, default: 0 },
  completedAt: Date
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  email: { type: String, required: true, unique: true },
  completedVideos: [CompletedVideoSchema],
  playlists: [PlaylistSchema]
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);

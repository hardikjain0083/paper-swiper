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

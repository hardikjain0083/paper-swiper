// routes/certificate.js
const express = require('express');
const PDFDocument = require('pdfkit');
const User = require('../models/User');
const router = express.Router();

// GET /certificate/:email/:id
// id may be a videoId or a playlistId
router.get('/:email/:id', async (req, res) => {
  try {
    const { email, id } = req.params;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // playlist?
    const playlist = (user.playlists || []).find(p => p.playlistId === id);
    let title = '';
    let completedAt = null;

    if (playlist) {
      if (!playlist.totalVideos || playlist.completedVideos.length < playlist.totalVideos) {
        return res.status(400).json({ message: 'Playlist not fully completed' });
      }
      title = `Playlist: ${playlist.playlistTitle || playlist.playlistId}`;
      completedAt = playlist.completedAt || new Date();
    } else {
      const video = (user.completedVideos || []).find(v => v.videoId === id);
      if (!video) return res.status(400).json({ message: 'Video not completed' });
      title = `Video: ${video.title}`;
      completedAt = video.completedAt || new Date();
    }

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate_${id}.pdf"`);

    doc.pipe(res);

    const pageWidth = doc.page.width;
    doc.rect(20, 20, pageWidth - 40, doc.page.height - 40).stroke('#2b7cff');

    doc.fontSize(36).fillColor('#102a43').text('Certificate of Completion', { align: 'center' });
    doc.moveDown(1.2);
    doc.fontSize(18).fillColor('#334e68').text('This is to certify that', { align: 'center' });
    doc.moveDown(0.8);
    doc.fontSize(32).fillColor('#09203f').text(user.name || user.email, { align: 'center' });
    doc.moveDown(0.8);
    doc.fontSize(16).fillColor('#334e68').text(`has completed: ${title}`, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(14).fillColor('#334e68').text(`Date: ${new Date(completedAt).toLocaleDateString()}`, { align: 'center' });

    doc.moveDown(3.5);
    const sigX = pageWidth / 2 - 120;
    doc.moveTo(sigX, doc.y).lineTo(sigX + 240, doc.y).stroke('#888');
    doc.fontSize(10).text('Authorized Signature', sigX, doc.y + 4, { width: 240, align: 'center' });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error generating certificate' });
  }
});

module.exports = router;

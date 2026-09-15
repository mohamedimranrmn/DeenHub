// backend/routes/quranAudioRoutes.js
// Mount with: app.use('/api/quran/audio', require('./routes/quranAudioRoutes'));

const express = require('express');
const { listChapterReciters, getChapterAudio } = require('../services/quranFoundation');

const router = express.Router();

router.get('/reciters', async (_req, res) => {
  try {
    const data = await listChapterReciters();
    const reciters = Array.isArray(data?.reciters) ? data.reciters : [];

    res.json({
      data: {
        reciters: reciters.map(r => ({
          id: r.id,
          name: r.name,
          style: r.style?.name ?? null,
          language: r.style?.language_name ?? null,
          qirat: r.qirat?.name ?? null,
          source: 'quran-foundation',
        })),
      },
    });
  } catch (error) {
    console.error('[QF] reciters:', error.message);
    res.status(error.status || 502).json({ error: 'Failed to fetch Quran Foundation reciters' });
  }
});

router.get('/chapter/:reciterId/:chapterNumber', async (req, res) => {
  try {
    const data = await getChapterAudio(
      req.params.reciterId,
      req.params.chapterNumber,
      true,
    );

    const audioFile = data?.audio_file;
    if (!audioFile?.audio_url) {
      return res.status(404).json({ error: 'No chapter audio available' });
    }

    // Return only the data the mobile app needs.
    res.json({
      data: {
        audioUrl: audioFile.audio_url,
        audioFileId: audioFile.id,
        chapterId: audioFile.chapter_id,
        format: audioFile.format,
        fileSize: audioFile.file_size,
        timestamps: Array.isArray(audioFile.timestamps)
          ? audioFile.timestamps
          : [],
      },
    });
  } catch (error) {
    console.error('[QF] chapter audio:', error.message);
    res.status(error.status || 502).json({ error: 'Failed to fetch Quran chapter audio' });
  }
});

module.exports = router;

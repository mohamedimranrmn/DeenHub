import express from "express";

import {
  getChapterAudio,
  getChapterReciters,
  getChapters,
} from "../services/quranFoundation.js";

const router = express.Router();

/**
 * ----------------------------------------------------
 * GET /api/quran/audio/health
 * ----------------------------------------------------
 *
 * Simple route to verify that the Quran audio
 * router itself is mounted correctly.
 */
router.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "Quran Audio API",
  });
});

/**
 * ----------------------------------------------------
 * GET /api/quran/audio/chapters
 * ----------------------------------------------------
 *
 * Test authenticated communication with
 * Quran Foundation.
 */
router.get("/chapters", async (req, res) => {
  try {
    const data = await getChapters();

    res.json(data);
  } catch (error) {
    console.error(
        "Quran Foundation chapters error:",
        error.message
    );

    res.status(502).json({
      success: false,
      error:
          "Failed to fetch chapters from Quran Foundation.",
      message: error.message,
    });
  }
});

/**
 * ----------------------------------------------------
 * GET /api/quran/audio/reciters
 * ----------------------------------------------------
 *
 * Returns Chapter Reciters.
 *
 * IMPORTANT:
 * These IDs are specifically for chapter
 * recitations. Do not use ayah-recitation IDs here.
 */
router.get("/reciters", async (req, res) => {
  try {
    const language =
        typeof req.query.language === "string"
            ? req.query.language
            : "en";

    const data =
        await getChapterReciters(language);

    res.json(data);
  } catch (error) {
    console.error(
        "Quran Foundation reciters error:",
        error.message
    );

    res.status(502).json({
      success: false,
      error:
          "Failed to fetch Quran Foundation chapter reciters.",
      message: error.message,
    });
  }
});

/**
 * ----------------------------------------------------
 * GET /api/quran/audio/chapter/:reciterId/:chapterNumber
 * ----------------------------------------------------
 *
 * Example:
 *
 * /api/quran/audio/chapter/7/1
 *
 * Returns the Quran Foundation chapter audio
 * information for:
 *
 * - reciter
 * - chapter
 * - audio URL
 * - timing information
 * - segments when available
 */
router.get(
    "/chapter/:reciterId/:chapterNumber",
    async (req, res) => {
      try {
        const reciterId = Number(
            req.params.reciterId
        );

        const chapterNumber = Number(
            req.params.chapterNumber
        );

        /**
         * Validate reciter ID.
         */
        if (
            !Number.isInteger(reciterId) ||
            reciterId <= 0
        ) {
          return res.status(400).json({
            success: false,
            error: "Invalid reciter ID.",
          });
        }

        /**
         * Validate Quran chapter.
         *
         * There are exactly 114 surahs.
         */
        if (
            !Number.isInteger(chapterNumber) ||
            chapterNumber < 1 ||
            chapterNumber > 114
        ) {
          return res.status(400).json({
            success: false,
            error:
                "Chapter number must be between 1 and 114.",
          });
        }

        /**
         * Request the complete chapter source.
         */
        const data = await getChapterAudio(
            reciterId,
            chapterNumber,
            true
        );

        res.json(data);
      } catch (error) {
        console.error(
            "Quran Foundation chapter audio error:",
            error.message
        );

        res.status(502).json({
          success: false,
          error:
              "Failed to fetch Quran chapter audio.",
          message: error.message,
        });
      }
    }
);

export default router;
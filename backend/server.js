import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import quranAudioRoutes from "./routes/quranAudio.js";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3000);

app.use(
    cors({
        origin: "*",
    })
);

app.use(express.json());

/**
 * Health check
 */
app.get("/", (req, res) => {
    res.json({
        success: true,
        service: "Deen Hub Backend",
        environment: process.env.QF_ENV || "prelive",
    });
});

/**
 * Quran audio API
 */
app.use(
    "/api/quran/audio",
    quranAudioRoutes
);

/**
 * 404
 */
app.use((req, res) => {
    res.status(404).json({
        error: "Route not found",
        path: req.originalUrl,
    });
});

/**
 * Error handler
 */
app.use((error, req, res, next) => {
    console.error("Backend error:", error);

    res.status(500).json({
        error: "Internal server error",
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("=================================");
    console.log("      DEEN HUB BACKEND");
    console.log("=================================");
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.QF_ENV || "prelive"}`);
    console.log("");
});
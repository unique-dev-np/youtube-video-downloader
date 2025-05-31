const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const helmet = require("helmet");
const compression = require("compression");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const config = require("./config/config");
const logger = require("./middleware/logger");
const rateLimiters = require("./middleware/rateLimiter");
const VideoProcessor = require("./utils/videoProcessor");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: config.cors,
});

// Ensure required directories exist
const requiredDirs = ["downloads", "logs", "public/css", "public/js"];
requiredDirs.forEach((dir) => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Initialize video processor
const videoProcessor = new VideoProcessor(io);

// Trust the first proxy (Render's proxy)
app.set("trust proxy", 1);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

app.use(compression());
app.use(cors(config.cors));
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// Apply rate limiting
app.use("/api/info", rateLimiters.info);
app.use("/api/download", rateLimiters.download);
app.use(rateLimiters.general);

// Socket.IO connection handling
io.on("connection", (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });

  socket.on("join_room", (room) => {
    socket.join(room);
  });
});

// API Routes
app.post("/api/info", async (req, res) => {
  try {
    const { url, socketId } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const videoData = await videoProcessor.getVideoInfo(url, socketId);
    res.json({ success: true, data: videoData });
  } catch (error) {
    logger.error("Video info error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get video information",
    });
  }
});

// Update the download endpoint in server.js
app.post("/api/download", async (req, res) => {
  try {
    const { url, formatItag, socketId } = req.body;

    if (!url || !formatItag || !socketId) {
      return res
        .status(400)
        .json({ error: "URL, formatItag, and socketId are required" });
    }

    const { downloadId, info, formatOptions, title, selectedFormat } =
      await videoProcessor.downloadVideo(url, formatItag, socketId);

    const extension = selectedFormat.container || "mp4";
    const filename = `${title}.${extension}`;

    // Set appropriate content type based on format
    const contentType = selectedFormat.hasVideo ? "video/mp4" : "audio/mpeg";

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", contentType);

    const stream = videoProcessor.createDownloadStream(
      url,
      formatOptions,
      downloadId,
      socketId
    );
    stream.pipe(res);
  } catch (error) {
    logger.error("Download error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Download failed",
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    activeDownloads: videoProcessor.getActiveDownloads().length,
    uptime: process.uptime(),
  });
});

app.get("/api/stats", (req, res) => {
  res.json({
    activeDownloads: videoProcessor.getActiveDownloads(),
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

server.listen(config.port, () => {
  logger.info(
    `🚀 Yuganta Tech YouTube Downloader running on port ${config.port}`
  );
  logger.info(`📱 Environment: ${config.nodeEnv}`);
  logger.info(`🔧 Health check: http://localhost:${config.port}/api/health`);
});

module.exports = { app, server, io };

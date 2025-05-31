const ytdl = require("@distube/ytdl-core");
const { v4: uuidv4 } = require("uuid");
const logger = require("../middleware/logger");

class VideoProcessor {
  constructor(io) {
    this.io = io;
    this.activeDownloads = new Map();
  }

  async getVideoInfo(url, socketId = null) {
    try {
      logger.info(`Fetching video info for: ${url}`);

      if (socketId) {
        this.io.to(socketId).emit("progress", {
          stage: "fetching_info",
          message: "Fetching video information...",
          percent: 10,
        });
      }

      const info = await Promise.race([
        ytdl.getInfo(url, {
          requestOptions: {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), 30000)
        ),
      ]);

      const videoDetails = info.videoDetails;
      const formats = this.processFormats(info.formats);

      if (socketId) {
        this.io.to(socketId).emit("progress", {
          stage: "info_complete",
          message: "Video information loaded successfully",
          percent: 100,
        });
      }

      return {
        id: videoDetails.videoId,
        title: videoDetails.title,
        author: {
          name: videoDetails.author.name,
          channel_url: videoDetails.author.channel_url,
        },
        duration: parseInt(videoDetails.lengthSeconds),
        thumbnail: this.getBestThumbnail(videoDetails.thumbnails),
        description: videoDetails.description?.substring(0, 500) + "...",
        viewCount: parseInt(videoDetails.viewCount) || 0,
        uploadDate: videoDetails.uploadDate,
        category: videoDetails.category,
        formats: formats,
        stats: {
          likes: videoDetails.likes || 0,
          rating: videoDetails.averageRating || 0,
        },
      };
    } catch (error) {
      logger.error("Error fetching video info:", error);
      throw error;
    }
  }

  processFormats(formats) {
    // Separate formats by type
    const videoAndAudioFormats = formats
      .filter((f) => f.hasVideo && f.hasAudio && f.container === "mp4")
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    const audioOnlyFormats = formats
      .filter((f) => f.hasAudio && !f.hasVideo)
      .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

    const videoOnlyFormats = formats
      .filter((f) => f.hasVideo && !f.hasAudio && f.container === "mp4")
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    // Process video+audio formats
    const processedVideoFormats = videoAndAudioFormats.map((f) => ({
      itag: f.itag,
      quality: f.qualityLabel || `${f.height}p`,
      height: f.height || 0,
      width: f.width || 0,
      container: f.container,
      size: f.contentLength ? this.formatFileSize(f.contentLength) : "Unknown",
      fps: f.fps || 30,
      type: "video+audio",
      bitrate: f.audioBitrate || "Unknown",
      videoBitrate: f.bitrate || "Unknown",
      hasVideo: true,
      hasAudio: true,
      mimeType: f.mimeType,
      codec: this.extractCodec(f.mimeType),
    }));

    // Process audio-only formats
    const processedAudioFormats = audioOnlyFormats.slice(0, 5).map((f) => ({
      itag: f.itag,
      quality: f.audioBitrate ? `${f.audioBitrate}kbps` : "Unknown",
      container: f.container,
      size: f.contentLength ? this.formatFileSize(f.contentLength) : "Unknown",
      type: "audio only",
      bitrate: f.audioBitrate || "Unknown",
      hasVideo: false,
      hasAudio: true,
      mimeType: f.mimeType,
      codec: this.extractCodec(f.mimeType),
      audioSampleRate: f.audioSampleRate,
    }));

    // Process video-only formats (high quality)
    const processedVideoOnlyFormats = videoOnlyFormats.slice(0, 3).map((f) => ({
      itag: f.itag,
      quality: f.qualityLabel || `${f.height}p`,
      height: f.height || 0,
      width: f.width || 0,
      container: f.container,
      size: f.contentLength ? this.formatFileSize(f.contentLength) : "Unknown",
      fps: f.fps || 30,
      type: "video only",
      bitrate: "No Audio",
      videoBitrate: f.bitrate || "Unknown",
      hasVideo: true,
      hasAudio: false,
      mimeType: f.mimeType,
      codec: this.extractCodec(f.mimeType),
    }));

    return {
      videoAndAudio: processedVideoFormats,
      audioOnly: processedAudioFormats,
      videoOnly: processedVideoOnlyFormats,
      all: [
        ...processedVideoFormats,
        ...processedAudioFormats,
        ...processedVideoOnlyFormats,
      ],
    };
  }

  extractCodec(mimeType) {
    if (!mimeType) return "Unknown";
    const codecMatch = mimeType.match(/codecs="([^"]+)"/);
    return codecMatch ? codecMatch[1].split(",")[0].trim() : "Unknown";
  }

  getBestThumbnail(thumbnails) {
    if (!thumbnails || thumbnails.length === 0) return "";
    return thumbnails.find((t) => t.width >= 480)?.url || thumbnails[0].url;
  }

  formatFileSize(bytes) {
    if (!bytes) return "Unknown";
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Bytes";
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  }

  async downloadVideo(url, formatItag, socketId) {
    const downloadId = uuidv4();

    try {
      logger.info(
        `Starting download: ${downloadId} for ${url}, format: ${formatItag}`
      );

      this.activeDownloads.set(downloadId, { socketId, status: "starting" });

      const info = await ytdl.getInfo(url);
      const title = info.videoDetails.title
        .replace(/[^\w\s-]/gi, "")
        .substring(0, 50);

      // Find the specific format
      const selectedFormat = info.formats.find((f) => f.itag == formatItag);

      if (!selectedFormat) {
        throw new Error(`Format ${formatItag} not found`);
      }

      this.io.to(socketId).emit("download_started", {
        downloadId,
        filename: `${title}.${selectedFormat.container || "mp4"}`,
        stage: "initializing",
      });

      // Set up format options based on the selected format
      const formatOptions = {
        quality: formatItag,
        requestOptions: {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        },
      };

      return { downloadId, info, formatOptions, title, selectedFormat };
    } catch (error) {
      this.activeDownloads.delete(downloadId);
      logger.error(`Download initialization failed: ${downloadId}`, error);
      throw error;
    }
  }

  createDownloadStream(url, formatOptions, downloadId, socketId) {
    const stream = ytdl(url, formatOptions);
    let downloadedBytes = 0;
    let totalBytes = 0;
    let startTime = Date.now();

    stream.on("progress", (chunkLength, downloaded, total) => {
      downloadedBytes = downloaded;
      totalBytes = total;

      const percent = Math.floor((downloaded / total) * 100);
      const speed = this.calculateSpeed(downloaded, startTime);
      const eta = this.calculateETA(downloaded, total, speed);

      this.io.to(socketId).emit("download_progress", {
        downloadId,
        percent,
        downloaded: this.formatFileSize(downloaded),
        total: this.formatFileSize(total),
        speed: this.formatFileSize(speed) + "/s",
        eta: eta,
      });
    });

    stream.on("end", () => {
      this.activeDownloads.delete(downloadId);
      this.io.to(socketId).emit("download_complete", {
        downloadId,
        message: "Download completed successfully!",
      });
      logger.info(`Download completed: ${downloadId}`);
    });

    stream.on("error", (error) => {
      this.activeDownloads.delete(downloadId);
      this.io.to(socketId).emit("download_error", {
        downloadId,
        error: error.message,
      });
      logger.error(`Download failed: ${downloadId}`, error);
    });

    return stream;
  }

  calculateSpeed(downloaded, startTime) {
    const elapsed = (Date.now() - startTime) / 1000;
    return elapsed > 0 ? downloaded / elapsed : 0;
  }

  calculateETA(downloaded, total, speed) {
    if (speed === 0) return "Unknown";
    const remaining = total - downloaded;
    const seconds = Math.floor(remaining / speed);

    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor(
      (seconds % 3600) / 60
    )}m`;
  }

  getActiveDownloads() {
    return Array.from(this.activeDownloads.entries()).map(([id, data]) => ({
      id,
      ...data,
    }));
  }
}

module.exports = VideoProcessor;

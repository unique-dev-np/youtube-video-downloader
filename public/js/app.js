class YouTubeDownloaderApp {
  constructor() {
    this.socket = null;
    this.currentVideo = null;
    this.selectedFormat = null;
    this.activeDownloads = new Map();
    this.currentFormatType = "video"; // 'video' or 'audio'

    this.initializeSocket();
    this.initializeElements();
    this.attachEventListeners();
    this.checkConnection();
    this.initializeAnimations();
  }

  initializeSocket() {
    this.socket = io({
      transports: ["websocket", "polling"],
    });

    this.socket.on("connect", () => {
      this.updateConnectionStatus(true);
      NotificationSystem.show("Connected to server", "success");
    });

    this.socket.on("disconnect", () => {
      this.updateConnectionStatus(false);
      NotificationSystem.show("Disconnected from server", "error");
    });

    this.socket.on("progress", (data) => {
      this.updateProgress(data);
    });

    this.socket.on("download_started", (data) => {
      this.handleDownloadStarted(data);
    });

    this.socket.on("download_progress", (data) => {
      this.updateDownloadProgress(data);
    });

    this.socket.on("download_complete", (data) => {
      this.handleDownloadComplete(data);
    });

    this.socket.on("download_error", (data) => {
      this.handleDownloadError(data);
    });
  }

  initializeElements() {
    this.urlInput = document.getElementById("urlInput");
    this.analyzeBtn = document.getElementById("analyzeBtn");
    this.clearBtn = document.getElementById("clearBtn");
    this.downloadBtn = document.getElementById("downloadBtn");

    this.progressSection = document.getElementById("progressSection");
    this.progressTitle = document.getElementById("progressTitle");
    this.progressPercentage = document.getElementById("progressPercentage");
    this.progressFill = document.getElementById("progressFill");
    this.progressDetails = document.getElementById("progressDetails");

    this.videoSection = document.getElementById("videoSection");
    this.downloadSection = document.getElementById("downloadSection");
    this.downloadsList = document.getElementById("downloadsList");
    this.downloadsContainer = document.getElementById("downloadsContainer");

    this.connectionStatus = document.getElementById("connectionStatus");
    this.activeDownloadsCount = document.getElementById("activeDownloads");

    this.formatsGrid = document.getElementById("formatsGrid");
    this.formatBtns = document.querySelectorAll(".format-btn");
  }

  attachEventListeners() {
    this.analyzeBtn.addEventListener("click", () => this.analyzeVideo());
    this.clearBtn.addEventListener("click", () => this.clearInput());
    this.downloadBtn.addEventListener("click", () => this.downloadVideo());

    this.urlInput.addEventListener("input", () => this.validateInput());
    this.urlInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.analyzeVideo();
    });

    this.formatBtns.forEach((btn) => {
      btn.addEventListener("click", (e) =>
        this.toggleFormatType(e.target.dataset.type)
      );
    });

    // Add smooth scrolling for better UX
    document.addEventListener("scroll", () => this.handleScroll());
  }

  initializeAnimations() {
    // Add staggered animation delays to elements
    const animatedElements = document.querySelectorAll(".animate-on-scroll");
    animatedElements.forEach((el, index) => {
      setTimeout(() => {
        el.classList.add("visible");
      }, index * 100);
    });
  }

  handleScroll() {
    const elements = document.querySelectorAll(
      ".animate-on-scroll:not(.visible)"
    );
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.8) {
        el.classList.add("visible");
      }
    });
  }

  updateConnectionStatus(connected) {
    const indicator = this.connectionStatus.querySelector(".status-indicator");
    const text = this.connectionStatus.querySelector("span");

    if (connected) {
      indicator.classList.remove("disconnected");
      text.textContent = "Connected";
    } else {
      indicator.classList.add("disconnected");
      text.textContent = "Disconnected";
    }
  }

  validateInput() {
    const url = this.urlInput.value.trim();
    const isValid = this.isValidYouTubeURL(url);

    this.analyzeBtn.disabled = !isValid || !url;

    if (url && !isValid) {
      this.urlInput.style.borderColor = "var(--danger-color)";
      this.urlInput.style.boxShadow = "0 0 20px rgba(239, 68, 68, 0.3)";
    } else {
      this.urlInput.style.borderColor = "";
      this.urlInput.style.boxShadow = "";
    }
  }

  isValidYouTubeURL(url) {
    const patterns = [
      /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/,
      /^(https?:\/\/)?(www\.)?youtube\.com\/embed\//,
    ];
    return patterns.some((pattern) => pattern.test(url));
  }

  clearInput() {
    this.urlInput.value = "";
    this.urlInput.style.borderColor = "";
    this.urlInput.style.boxShadow = "";
    this.analyzeBtn.disabled = true;
    this.hideAllSections();
  }

  hideAllSections() {
    this.progressSection.classList.remove("visible");
    this.videoSection.classList.remove("visible");
    this.downloadSection.classList.remove("visible");
  }

  async analyzeVideo() {
    const url = this.urlInput.value.trim();

    if (!url || !this.isValidYouTubeURL(url)) {
      NotificationSystem.show("Please enter a valid YouTube URL", "error");
      return;
    }

    this.showProgress("Analyzing video...", 0);
    this.analyzeBtn.disabled = true;
    this.analyzeBtn.innerHTML =
      '<div class="loading-spinner" style="width: 16px; height: 16px; margin-right: 8px;"></div>Analyzing...';

    try {
      const response = await fetch("/api/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          socketId: this.socket.id,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      this.currentVideo = result.data;
      this.displayVideoInfo();
      this.displayDownloadOptions();

      NotificationSystem.show("Video analyzed successfully!", "success");
    } catch (error) {
      NotificationSystem.show(error.message, "error");
      this.hideAllSections();
    } finally {
      this.analyzeBtn.disabled = false;
      this.analyzeBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="M21 21l-4.35-4.35"></path>
          </svg>
          Analyze Video
        `;
      setTimeout(() => {
        this.progressSection.classList.remove("visible");
      }, 1000);
    }
  }

  showProgress(title, percent, details = "") {
    this.progressSection.classList.add("visible");
    this.progressTitle.textContent = title;
    this.progressPercentage.textContent = `${percent}%`;
    this.progressFill.style.width = `${percent}%`;
    this.progressDetails.textContent = details;
  }

  updateProgress(data) {
    this.showProgress(
      data.message || "Processing...",
      data.percent || 0,
      data.details || ""
    );
  }

  displayVideoInfo() {
    const video = this.currentVideo;

    document.getElementById("videoThumbnail").src = video.thumbnail;
    document.getElementById("videoTitle").textContent = video.title;
    document.getElementById(
      "videoAuthor"
    ).textContent = `By: ${video.author.name}`;
    document.getElementById("videoDuration").textContent = this.formatDuration(
      video.duration
    );
    document.getElementById("videoViews").textContent = `${this.formatNumber(
      video.viewCount
    )} views`;
    document.getElementById("videoUploadDate").textContent = `Uploaded: ${
      video.uploadDate || "Unknown"
    }`;
    document.getElementById("videoDescription").textContent =
      video.description || "No description available";

    this.videoSection.classList.add("visible");
  }

  displayDownloadOptions() {
    this.formatsGrid.innerHTML = "";

    // Get formats based on current type
    let formats = [];
    if (this.currentFormatType === "video") {
      formats = this.currentVideo.formats.videoAndAudio || [];
    } else {
      formats = this.currentVideo.formats.audioOnly || [];
    }

    if (formats.length === 0) {
      this.formatsGrid.innerHTML = `
          <div class="no-formats">
            <p>No ${this.currentFormatType} formats available for this video.</p>
          </div>
        `;
      this.downloadBtn.disabled = true;
      return;
    }

    formats.forEach((format, index) => {
      const formatCard = this.createFormatCard(format, index === 0);
      this.formatsGrid.appendChild(formatCard);

      // Add staggered animation
      setTimeout(() => {
        formatCard.style.opacity = "1";
        formatCard.style.transform = "translateY(0)";
      }, index * 100);
    });

    if (formats.length > 0) {
      this.selectedFormat = formats[0];
      this.downloadBtn.disabled = false;
    }

    this.downloadSection.classList.add("visible");
  }

  createFormatCard(format, isSelected = false) {
    const card = document.createElement("div");
    card.className = `format-card ${isSelected ? "selected" : ""}`;
    card.dataset.itag = format.itag;
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    card.style.transition = "var(--transition)";

    // Enhanced format display
    const qualityDisplay =
      this.currentFormatType === "video"
        ? `${format.quality}${format.fps > 30 ? ` • ${format.fps}fps` : ""}`
        : format.quality;

    const typeDisplay =
      this.currentFormatType === "video"
        ? `${format.container.toUpperCase()} • ${format.codec}`
        : `${format.container.toUpperCase()} • ${format.codec}`;

    card.innerHTML = `
        <div class="format-header">
          <div class="format-quality">${qualityDisplay}</div>
          <div class="format-size">${format.size}</div>
        </div>
        <div class="format-details">
          <span>${typeDisplay}</span>
          <span>${format.type}</span>
          ${
            format.bitrate !== "Unknown"
              ? `<span>${format.bitrate}${
                  this.currentFormatType === "audio" ? "" : " audio"
                }</span>`
              : ""
          }
        </div>
      `;

    card.addEventListener("click", () => this.selectFormat(card, format));

    return card;
  }

  selectFormat(card, format) {
    document.querySelectorAll(".format-card").forEach((c) => {
      c.classList.remove("selected");
    });
    card.classList.add("selected");
    this.selectedFormat = format;

    // Add selection feedback
    card.style.transform = "scale(1.05)";
    setTimeout(() => {
      card.style.transform = "";
    }, 150);
  }

  toggleFormatType(type) {
    if (this.currentFormatType === type) return;

    this.currentFormatType = type;

    document
      .querySelectorAll(".format-btn")
      .forEach((btn) => btn.classList.remove("active"));
    document.querySelector(`[data-type="${type}"]`).classList.add("active");

    // Animate format cards out then in
    const cards = document.querySelectorAll(".format-card");
    cards.forEach((card, index) => {
      setTimeout(() => {
        card.style.opacity = "0";
        card.style.transform = "translateY(-20px)";
      }, index * 50);
    });

    setTimeout(() => {
      this.displayDownloadOptions();
    }, cards.length * 50 + 200);
  }

  async downloadVideo() {
    if (!this.currentVideo || !this.selectedFormat) {
      NotificationSystem.show("Please select a format first", "warning");
      return;
    }

    this.downloadBtn.disabled = true;
    this.downloadBtn.innerHTML = `
        <div class="loading-spinner" style="width: 16px; height: 16px; margin-right: 8px;"></div>
        Starting Download...
      `;

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: this.urlInput.value.trim(),
          formatItag: this.selectedFormat.itag,
          socketId: this.socket.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Download failed");
      }

      // Create download link
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;

      const extension =
        this.selectedFormat.container ||
        (this.currentFormatType === "audio" ? "m4a" : "mp4");
      a.download = `${this.currentVideo.title.replace(
        /[^\w\s-]/gi,
        ""
      )}.${extension}`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      NotificationSystem.show(error.message, "error");
    } finally {
      this.downloadBtn.disabled = false;
      this.downloadBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
            <polyline points="7,10 12,15 17,10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Download Selected Format
        `;
    }
  }

  handleDownloadStarted(data) {
    this.activeDownloads.set(data.downloadId, {
      id: data.downloadId,
      filename: data.filename,
      status: "downloading",
      progress: 0,
    });

    this.updateActiveDownloadsList();
    this.downloadsList.classList.add("visible");

    NotificationSystem.show(`Download started: ${data.filename}`, "info");
  }

  updateDownloadProgress(data) {
    const download = this.activeDownloads.get(data.downloadId);
    if (download) {
      download.progress = data.percent;
      download.downloaded = data.downloaded;
      download.total = data.total;
      download.speed = data.speed;
      download.eta = data.eta;

      this.updateActiveDownloadsList();
    }
  }

  handleDownloadComplete(data) {
    const download = this.activeDownloads.get(data.downloadId);
    if (download) {
      download.status = "completed";
      download.progress = 100;

      setTimeout(() => {
        this.activeDownloads.delete(data.downloadId);
        this.updateActiveDownloadsList();
      }, 5000);

      NotificationSystem.show("Download completed successfully!", "success");
    }
  }

  handleDownloadError(data) {
    const download = this.activeDownloads.get(data.downloadId);
    if (download) {
      download.status = "error";
      download.error = data.error;

      setTimeout(() => {
        this.activeDownloads.delete(data.downloadId);
        this.updateActiveDownloadsList();
      }, 10000);

      NotificationSystem.show(`Download failed: ${data.error}`, "error");
    }
  }

  updateActiveDownloadsList() {
    this.activeDownloadsCount.textContent = this.activeDownloads.size;

    this.downloadsContainer.innerHTML = "";

    if (this.activeDownloads.size === 0) {
      this.downloadsList.classList.remove("visible");
      return;
    }

    this.activeDownloads.forEach((download, index) => {
      const downloadElement = this.createDownloadElement(download);
      setTimeout(() => {
        this.downloadsContainer.appendChild(downloadElement);
      }, index * 100);
    });
  }

  createDownloadElement(download) {
    const element = document.createElement("div");
    element.className = "download-item";

    element.innerHTML = `
        <div class="download-item-header">
          <div class="download-filename">${download.filename}</div>
          <div class="download-status ${download.status}">${
      download.status
    }</div>
        </div>
        ${
          download.status === "downloading"
            ? `
          <div class="download-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${
                download.progress
              }%"></div>
            </div>
            <div class="download-info">
              <span>${download.downloaded || "0 MB"} / ${
                download.total || "Unknown"
              }</span>
              <span>${download.speed || "0 MB/s"} • ETA: ${
                download.eta || "Unknown"
              }</span>
            </div>
          </div>
        `
            : download.status === "error"
            ? `
          <div class="error-message" style="color: var(--danger-color); margin-top: 0.5rem; font-size: 0.875rem;">${download.error}</div>
        `
            : ""
        }
      `;

    return element;
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num.toString();
  }

  async checkConnection() {
    try {
      const response = await fetch("/api/health");
      const data = await response.json();
      console.log("Health check:", data);
    } catch (error) {
      console.error("Health check failed:", error);
    }
  }
}

// Initialize app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.app = new YouTubeDownloaderApp();
});

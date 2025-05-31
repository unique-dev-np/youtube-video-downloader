class YouTubeDownloader {
  constructor() {
    this.initializeElements();
    this.attachEventListeners();
    this.checkAPIHealth();
  }

  initializeElements() {
    this.urlInput = document.getElementById("urlInput");
    this.getInfoBtn = document.getElementById("getInfoBtn");
    this.downloadBtn = document.getElementById("downloadBtn");
    this.loading = document.getElementById("loading");
    this.videoInfo = document.getElementById("videoInfo");
    this.error = document.getElementById("error");
    this.errorMessage = document.getElementById("errorMessage");
    this.thumbnail = document.getElementById("thumbnail");
    this.title = document.getElementById("title");
    this.author = document.getElementById("author");
    this.duration = document.getElementById("duration");
    this.qualitySelect = document.getElementById("qualitySelect");
  }

  attachEventListeners() {
    this.getInfoBtn.addEventListener("click", () => this.getVideoInfo());
    this.downloadBtn.addEventListener("click", () => this.downloadVideo());
    this.urlInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.getVideoInfo();
    });
    this.urlInput.addEventListener("paste", (e) => {
      setTimeout(() => this.validateURL(), 100);
    });
  }

  async checkAPIHealth() {
    try {
      const response = await fetch("/api/test");
      const data = await response.json();
      console.log("API Health:", data);

      if (!data.ytdlWorking) {
        this.showError(
          "Service temporarily unavailable. Please try again later."
        );
      }
    } catch (error) {
      console.error("Health check failed:", error);
    }
  }

  validateURL() {
    const url = this.urlInput.value.trim();
    const patterns = [
      /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/,
      /^(https?:\/\/)?(www\.)?youtube\.com\/embed\//,
    ];

    const isValid = patterns.some((pattern) => pattern.test(url));
    this.getInfoBtn.disabled = !isValid || !url;

    if (url && !isValid) {
      this.showError("Please enter a valid YouTube URL");
    } else if (isValid) {
      this.error.classList.add("hidden");
    }
  }

  showLoading(message = "Loading video information...") {
    this.loading.querySelector("p").textContent = message;
    this.loading.classList.remove("hidden");
    this.videoInfo.classList.add("hidden");
    this.error.classList.add("hidden");
  }

  hideLoading() {
    this.loading.classList.add("hidden");
  }

  showError(message) {
    this.error.classList.remove("hidden");
    this.errorMessage.textContent = message;
    this.videoInfo.classList.add("hidden");
    this.hideLoading();
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

  async getVideoInfo() {
    const url = this.urlInput.value.trim();

    if (!url) {
      this.showError("Please enter a YouTube URL");
      return;
    }

    this.showLoading("Fetching video information...");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get video information");
      }

      this.displayVideoInfo(data);
    } catch (error) {
      if (error.name === "AbortError") {
        this.showError("Request timed out. Please try again.");
      } else {
        this.showError(error.message);
      }
    }
  }

  displayVideoInfo(data) {
    this.hideLoading();

    // Update video information
    this.thumbnail.src = data.thumbnail;
    this.title.textContent = data.title;
    this.author.textContent = `By: ${data.author}`;
    this.duration.textContent = `Duration: ${this.formatDuration(
      parseInt(data.duration)
    )}`;

    // Update quality options
    this.qualitySelect.innerHTML =
      '<option value="highest">Best Available Quality</option>';

    data.formats.forEach((format) => {
      if (format.quality && format.hasVideo && format.hasAudio) {
        const option = document.createElement("option");
        option.value = format.itag;
        option.textContent = `${format.quality} (${format.container}) - ${format.type}`;
        this.qualitySelect.appendChild(option);
      }
    });

    this.videoInfo.classList.remove("hidden");
    this.error.classList.add("hidden");
  }

  async downloadVideo() {
    const url = this.urlInput.value.trim();
    const quality = this.qualitySelect.value;

    if (!url) {
      this.showError("Please enter a YouTube URL");
      return;
    }

    try {
      this.downloadBtn.textContent = "⏳ Preparing download...";
      this.downloadBtn.disabled = true;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        this.showError("Download timed out. Please try again.");
        this.resetDownloadButton();
      }, 300000); // 5 minutes timeout

      const response = await fetch("/api/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, quality }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Download failed");
      }

      this.downloadBtn.textContent = "📥 Downloading...";

      // Create download link
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = this.title.textContent.replace(/[^\w\s-]/gi, "") + ".mp4";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      this.downloadBtn.textContent = "✅ Downloaded!";
      setTimeout(() => {
        this.resetDownloadButton();
      }, 3000);
    } catch (error) {
      if (error.name !== "AbortError") {
        this.showError(error.message);
      }
      this.resetDownloadButton();
    }
  }

  resetDownloadButton() {
    this.downloadBtn.textContent = "📥 Download Video";
    this.downloadBtn.disabled = false;
  }
}

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new YouTubeDownloader();
});

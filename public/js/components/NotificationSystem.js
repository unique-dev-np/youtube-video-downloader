class NotificationSystem {
  static container = null;

  static init() {
    this.container = document.getElementById("notifications");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "notifications";
      this.container.className = "notifications";
      document.body.appendChild(this.container);
    }
  }

  static show(message, type = "info", duration = 5000) {
    if (!this.container) this.init();

    const notification = document.createElement("div");
    notification.className = `notification ${type}`;

    notification.innerHTML = `
        <div class="notification-content">
          <div class="notification-icon">
            ${this.getIcon(type)}
          </div>
          <div class="notification-message">${message}</div>
          <button class="notification-close">×</button>
        </div>
      `;

    const closeBtn = notification.querySelector(".notification-close");
    closeBtn.addEventListener("click", () => this.remove(notification));

    this.container.appendChild(notification);

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => this.remove(notification), duration);
    }

    return notification;
  }

  static remove(notification) {
    if (notification && notification.parentNode) {
      notification.style.animation = "slideOut 0.3s ease";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  }

  static getIcon(type) {
    const icons = {
      success: "✅",
      error: "❌",
      warning: "⚠️",
      info: "ℹ️",
    };
    return icons[type] || icons.info;
  }

  static clear() {
    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}

// Add slideOut animation to CSS
const style = document.createElement("style");
style.textContent = `
    @keyframes slideOut {
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
    
    .notification-content {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    .notification-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
    }
    
    .notification-message {
      flex: 1;
      font-weight: 500;
    }
    
    .notification-close {
      background: none;
      border: none;
      font-size: 1.25rem;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s ease;
      flex-shrink: 0;
    }
    
    .notification-close:hover {
      opacity: 1;
    }
  `;
document.head.appendChild(style);

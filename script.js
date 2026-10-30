
const BACKEND_URL = "https://GANTI-DENGAN-URL-BACKEND";

let socket = null;
let totalMessages = 0;

const chat = document.getElementById("chat");
const count = document.getElementById("count");

function connectLive() {
    const tiktok = document.getElementById("tiktok").value.trim();
    const youtube = document.getElementById("youtube").value.trim();

    if (!tiktok && !youtube) {
        alert("Masukkan username TikTok atau YouTube!");
        return;
    }

    if (socket) {
        socket.disconnect();
    }

    chat.innerHTML = '<div class="empty">Menghubungkan...</div>';
    totalMessages = 0;
    count.textContent = "0 pesan";

    socket = io(BACKEND_URL);

    socket.on("connect", () => {
        socket.emit("connect-platforms", {
            tiktok: tiktok,
            youtube: youtube
        });
    });

    socket.on("connect_error", () => {
        alert("Tidak bisa terhubung ke server.");
    });

    socket.on("platform-status", data => {
        updateStatus(data.platform, data.status);
    });

    socket.on("chat-message", data => {
        addMessage(data);
    });
}

function disconnectLive() {
    if (socket) {
        socket.emit("disconnect-platforms");
        socket.disconnect();
        socket = null;
    }

    updateStatus("tiktok", "idle");
    updateStatus("youtube", "idle");
}

function updateStatus(platform, status) {
    const id = platform === "tiktok"
        ? "ttStatus"
        : "ytStatus";

    const element = document.getElementById(id);

    element.textContent = status.toUpperCase();
    element.className =
        status === "live" ? "live" :
        status === "offline" ? "offline" : "";
}

function addMessage(data) {
    if (chat.querySelector(".empty")) {
        chat.innerHTML = "";
    }

    const item = document.createElement("div");
    item.className = "msg";

    const logo = document.createElement("div");
    logo.className = "logo " +
        (data.platform === "tiktok" ? "tt" : "yt");

    logo.textContent =
        data.platform === "tiktok" ? "TT" : "YT";

    const content = document.createElement("div");

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = data.username || "Unknown";

    const platform = document.createElement("div");
    platform.className = "platform-name";
    platform.textContent =
        data.platform === "tiktok" ? "TikTok" : "YouTube";

    const message = document.createElement("div");
    message.className = "text";
    message.textContent = data.message;

    content.append(name, platform, message);
    item.append(logo, content);
    chat.append(item);

    totalMessages++;
    count.textContent = totalMessages + " pesan";

    chat.scrollTop = chat.scrollHeight;
}

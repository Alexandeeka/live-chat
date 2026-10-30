
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const tiktokConnections = new Map();
const youtubeJobs = new Map();

function status(socket, platform, state, detail = "") {
  socket.emit("platform-status", {
    platform,
    status: state,
    detail
  });
}

function sendChat(socket, platform, username, message) {
  socket.emit("chat-message", {
    platform,
    username,
    message,
    time: new Date().toISOString()
  });
}

// YOUTUBE API
async function youtubeRequest(endpoint, params) {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YouTube API Key belum dipasang.");
  }

  const url = new URL(
    "https://www.googleapis.com/youtube/v3/" + endpoint
  );

  Object.entries({
    ...params,
    key: YOUTUBE_API_KEY
  }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || "YouTube API error"
    );
  }

  return data;
}

async function findYoutubeLive(input) {
  const handle = input.trim().replace(/^@/, "");
  let channelId = handle;

  if (!handle.startsWith("UC")) {
    const channel = await youtubeRequest("channels", {
      part: "id",
      forHandle: handle
    });

    channelId = channel.items?.[0]?.id;
  }

  if (!channelId) {
    throw new Error("Channel YouTube tidak ditemukan.");
  }

  const search = await youtubeRequest("search", {
    part: "id",
    channelId,
    eventType: "live",
    type: "video",
    maxResults: "1"
  });

  const videoId = search.items?.[0]?.id?.videoId;

  if (!videoId) return null;

  const video = await youtubeRequest("videos", {
    part: "liveStreamingDetails,snippet",
    id: videoId
  });

  const item = video.items?.[0];
  const liveChatId =
    item?.liveStreamingDetails?.activeLiveChatId;

  if (!liveChatId) return null;

  return {
    liveChatId,
    title: item.snippet?.title || "YouTube LIVE"
  };
}

function stopYoutube(id) {
  const job = youtubeJobs.get(id);

  if (job) {
    job.stopped = true;
    clearTimeout(job.timer);
  }

  youtubeJobs.delete(id);
}

async function startYoutube(socket, input) {
  stopYoutube(socket.id);

  try {
    status(socket, "youtube", "checking", "Memeriksa channel...");

    const live = await findYoutubeLive(input);

    if (!live) {
      status(socket, "youtube", "offline", "Tidak sedang LIVE.");
      return;
    }

    status(socket, "youtube", "live", live.title);

    const job = {
      stopped: false,
      timer: null
    };

    youtubeJobs.set(socket.id, job);

    async function poll() {
      if (job.stopped) return;

      try {
        const data = await youtubeRequest(
          "liveChat/messages",
          {
            liveChatId: live.liveChatId,
            part: "snippet,authorDetails",
            maxResults: "200"
          }
        );

        for (const item of data.items || []) {
          if (item.snippet?.type === "textMessageEvent") {
            sendChat(
              socket,
              "youtube",
              item.authorDetails?.displayName,
              item.snippet?.textMessageDetails?.messageText
            );
          }
        }

        if (!job.stopped) {
          job.timer = setTimeout(
            poll,
            Math.max(data.pollingIntervalMillis || 5000, 2000)
          );
        }

      } catch (error) {
        status(socket, "youtube", "error", error.message);
        stopYoutube(socket.id);
      }
    }

    poll();

  } catch (error) {
    status(socket, "youtube", "error", error.message);
  }
}

// TIKTOK
function stopTiktok(id) {
  const connection = tiktokConnections.get(id);

  if (connection) {
    try {
      connection.disconnect();
    } catch {}
  }

  tiktokConnections.delete(id);
}

async function startTiktok(socket, username) {
  stopTiktok(socket.id);

  const handle = username.trim().replace(/^@/, "");

  if (!handle) return;

  status(socket, "tiktok", "checking", "Memeriksa akun...");

  const connection = new TikTokLiveConnection(handle);

  tiktokConnections.set(socket.id, connection);

  connection.on(WebcastEvent.CHAT, data => {
    sendChat(
      socket,
      "tiktok",
      data.user?.nickname || data.user?.uniqueId,
      data.comment
    );
  });

  connection.on("streamEnd", () => {
    status(socket, "tiktok", "offline", "LIVE berakhir.");
    stopTiktok(socket.id);
  });

  connection.on("error", error => {
    status(
      socket,
      "tiktok",
      "error",
      error?.message || "Koneksi bermasalah."
    );
  });

  try {
    await connection.connect();

    status(
      socket,
      "tiktok",
      "live",
      "Terhubung ke @" + handle
    );

  } catch (error) {
    stopTiktok(socket.id);

    status(
      socket,
      "tiktok",
      "offline",
      error?.message || "Tidak bisa terhubung."
    );
  }
}

// SOCKET CONNECTION
io.on("connection", socket => {

  socket.on("connect-platforms", data => {
    if (data.tiktok?.trim()) {
      startTiktok(socket, data.tiktok);
    } else {
      status(socket, "tiktok", "idle");
    }

    if (data.youtube?.trim()) {
      startYoutube(socket, data.youtube);
    } else {
      status(socket, "youtube", "idle");
    }
  });

  socket.on("disconnect-platforms", () => {
    stopTiktok(socket.id);
    stopYoutube(socket.id);

    status(socket, "tiktok", "idle", "Terputus.");
    status(socket, "youtube", "idle", "Terputus.");
  });

  socket.on("disconnect", () => {
    stopTiktok(socket.id);
    stopYoutube(socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("Multi Live Chat Backend is running!");
});

server.listen(PORT, () => {
  console.log("Server berjalan di port " + PORT);
});
      

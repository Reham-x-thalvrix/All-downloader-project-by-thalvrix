const express = require("express");
const rateLimit = require("express-rate-limit");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const YTDLP = process.env.YTDLP_PATH || "yt-dlp";
const MAX_ACTIVE = Number(process.env.MAX_ACTIVE_DOWNLOADS || 2);
let activeDownloads = 0;

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));

function validateUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return "একটি সঠিক URL দিন।";
  let parsed;
  try { parsed = new URL(value); } catch { return "URL সঠিক নয়।"; }
  if (!["http:", "https:"].includes(parsed.protocol)) return "শুধু HTTP/HTTPS URL গ্রহণযোগ্য।";
  const host = parsed.hostname.toLowerCase();
  if (["localhost", "localhost.localdomain"].includes(host) ||
      host.endsWith(".local") || host.endsWith(".internal") ||
      /^127\\./.test(host) || /^10\\./.test(host) ||
      /^192\\.168\\./.test(host) || /^169\\.254\\./.test(host) ||
      /^172\\.(1[6-9]|2\\d|3[01])\\./.test(host) || host === "::1") {
    return "এই ধরনের লোকাল নেটওয়ার্ক URL গ্রহণযোগ্য নয়।";
  }
  return null;
}

function runYtDlp(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, ["--ignore-config", "--no-playlist", "--no-warnings", ...args], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("সময় শেষ হয়েছে। পরে আবার চেষ্টা করুন।"));
    }, timeoutMs);
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", err => { clearTimeout(timer); reject(new Error("yt-dlp চালু করা যায়নি: " + err.message)); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || "ডাউনলোড ব্যর্থ হয়েছে।").slice(-1400)));
    });
  });
}

app.post("/api/info", async (req, res) => {
  const url = req.body && req.body.url;
  const invalid = validateUrl(url);
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    const { stdout } = await runYtDlp(["--dump-single-json", "--skip-download", "--socket-timeout", "20", url]);
    const data = JSON.parse(stdout);
    res.json({
      title: data.title || "Untitled",
      uploader: data.uploader || data.channel || "Unknown",
      duration: data.duration || null,
      thumbnail: data.thumbnail || null,
      webpage_url: data.webpage_url || url
    });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

app.post("/api/download", async (req, res) => {
  const url = req.body && req.body.url;
  const format = req.body && req.body.format;
  const invalid = validateUrl(url);
  if (invalid) return res.status(400).json({ error: invalid });
  const formats = {
    "best": "bv*+ba/b",
    "1080": "bv*[height<=1080]+ba/b[height<=1080]",
    "720": "bv*[height<=720]+ba/b[height<=720]",
    "480": "bv*[height<=480]+ba/b[height<=480]",
    "360": "bv*[height<=360]+ba/b[height<=360]",
    "audio": "ba/b"
  };
  if (!Object.prototype.hasOwnProperty.call(formats, format)) {
    return res.status(400).json({ error: "Format নির্বাচন করুন।" });
  }
  if (activeDownloads >= MAX_ACTIVE) {
    return res.status(429).json({ error: "সার্ভারে এখন বেশি ডাউনলোড চলছে। একটু পরে চেষ্টা করুন।" });
  }

  activeDownloads++;
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "all-downloader-"));
  try {
    const args = [
      "-f", formats[format],
      "--socket-timeout", "25",
      "--retries", "2",
      "--fragment-retries", "2",
      "--merge-output-format", format === "audio" ? "mp3" : "mp4",
      "-o", path.join(dir, "%(title).80s.%(ext)s")
    ];
    if (format === "audio") args.push("-x", "--audio-format", "mp3", "--audio-quality", "5");
    args.push(url);
    await runYtDlp(args, 5 * 60 * 1000);

    const names = await fs.promises.readdir(dir);
    const fileName = names.find(name => !name.endsWith(".part") && !name.endsWith(".ytdl"));
    if (!fileName) throw new Error("ডাউনলোড ফাইল পাওয়া যায়নি।");
    const filePath = path.join(dir, fileName);
    res.download(filePath, fileName, async () => {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      activeDownloads--;
    });
  } catch (err) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    activeDownloads--;
    if (!res.headersSent) res.status(422).json({ error: err.message });
  }
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`All Downloader running on port ${PORT}`));

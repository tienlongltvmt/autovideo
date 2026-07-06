import express from "express";
import path from "node:path";
import fsp from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { Queue } from "./queue.js";
import { instanceInfo } from "./cobalt.js";
import { createJob, getJob, allJobs, deleteJob, publicJob, emitJob, jobEvents } from "./jobs.js";
import { runJob, cancelJob, resetJob } from "./downloader.js";
import { extractLinks } from "./extract-links.js";
import { customServices } from "./resolvers/index.js";
import { loadJobs, initPersistence } from "./persist.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const queue = new Queue(config.concurrency);

// bảo vệ bằng mật khẩu khi deploy công khai (đặt APP_PASSWORD trong .env)
if (config.appPassword) {
    const safeEqual = (a, b) => {
        const ha = crypto.createHash("sha256").update(String(a)).digest();
        const hb = crypto.createHash("sha256").update(String(b)).digest();
        return crypto.timingSafeEqual(ha, hb);
    };
    app.use((req, res, next) => {
        const [scheme, token] = (req.headers.authorization ?? "").split(" ");
        if (scheme === "Basic" && token) {
            const password = Buffer.from(token, "base64").toString().split(":").slice(1).join(":");
            if (safeEqual(password, config.appPassword)) return next();
        }
        res.set("WWW-Authenticate", 'Basic realm="downloadauto"');
        res.status(401).send("Cần đăng nhập");
    });
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/files", express.static(config.downloadDir, { dotfiles: "deny" }));

// module bắt link dùng chung với giao diện
app.get("/extract-links.js", (_req, res) => {
    res.sendFile(path.join(__dirname, "extract-links.js"));
});

// chỉ nhận các option hợp lệ theo schema của cobalt
const ALLOWED_OPTIONS = new Set([
    "audioBitrate", "audioFormat", "downloadMode", "filenameStyle",
    "videoQuality", "disableMetadata", "alwaysProxy", "subtitleLang",
    "youtubeVideoCodec", "youtubeVideoContainer", "youtubeDubLang",
    "convertGif", "allowH265", "tiktokFullAudio", "youtubeBetterAudio",
    "youtubeHLS",
]);

function cleanOptions(options) {
    const out = {};
    for (const [k, v] of Object.entries(options ?? {})) {
        if (ALLOWED_OPTIONS.has(k) && v !== "" && v != null) out[k] = v;
    }
    return out;
}

// đưa job vào hàng đợi; delayMs > 0 dùng cho tự thử lại lỗi tạm thời
function schedule(job, delayMs = 0) {
    const run = () =>
        queue.push(() => runJob(job, enqueue, schedule)).catch(() => {});
    if (delayMs > 0) setTimeout(run, delayMs).unref();
    else run();
}

function enqueue(input) {
    const job = createJob(input);
    emitJob(job, true);
    schedule(job);
    return job;
}

app.post("/api/jobs", (req, res) => {
    const { urls, text, options } = req.body ?? {};
    // nhận cả mảng `urls` lẫn `text` tự do — tự bắt link trong văn bản
    const raw = [
        Array.isArray(urls) ? urls.join("\n") : String(urls ?? ""),
        String(text ?? ""),
    ].join("\n");
    const list = extractLinks(raw);

    if (!list.length) {
        return res.status(400).json({ error: "Không bắt được link hợp lệ nào trong nội dung" });
    }

    const opts = cleanOptions(options);
    // tùy chọn riêng của app — không gửi sang cobalt
    const appOptions = { brand: options?.brand === true };
    const created = list.map((url) =>
        publicJob(enqueue({ url, options: opts, appOptions }))
    );
    res.json({ jobs: created });
});

// gắn khung thương hiệu cho một job video đã tải xong
app.post("/api/jobs/:id/brand", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Không tìm thấy job" });
    if (job.status !== "done" || !job.filePath) {
        return res.status(400).json({ error: "Chỉ gắn khung được cho job đã tải xong" });
    }
    const child = enqueue({
        url: job.url,
        brand: { input: job.filePath },
        label: "gắn khung thương hiệu",
    });
    res.json({ job: publicJob(child) });
});

app.get("/api/jobs", (_req, res) => {
    res.json({ jobs: allJobs() });
});

app.post("/api/jobs/:id/cancel", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Không tìm thấy job" });
    cancelJob(job);
    res.json({ job: publicJob(job) });
});

app.post("/api/jobs/:id/retry", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Không tìm thấy job" });
    if (!["error", "canceled"].includes(job.status)) {
        return res.status(400).json({ error: "Chỉ thử lại được job lỗi hoặc đã hủy" });
    }
    resetJob(job);
    schedule(job);
    res.json({ job: publicJob(job) });
});

// ?deleteFile=1 để xóa cả file đã tải trên đĩa
app.delete("/api/jobs/:id", async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Không tìm thấy job" });
    cancelJob(job);
    if (req.query.deleteFile === "1" && job.filePath) {
        await fsp.rm(job.filePath, { force: true }).catch(() => {});
    }
    deleteJob(job.id);
    res.json({ ok: true });
});

// dọn các job đã kết thúc khỏi danh sách
app.post("/api/jobs/clear-finished", (_req, res) => {
    let count = 0;
    for (const job of allJobs()) {
        if (["done", "error", "canceled", "expanded"].includes(job.status)) {
            deleteJob(job.id);
            count++;
        }
    }
    res.json({ removed: count });
});

// hủy mọi mục đang tải và xóa toàn bộ hàng đợi
app.post("/api/jobs/clear-all", (_req, res) => {
    let count = 0;
    for (const j of allJobs()) {
        const job = getJob(j.id);
        if (job) {
            cancelJob(job);
            deleteJob(job.id);
            count++;
        }
    }
    res.json({ removed: count });
});

app.get("/api/status", async (_req, res) => {
    let cobalt = null;
    try {
        cobalt = await instanceInfo();
    } catch {
        // instance chưa chạy — trả về null để UI hiển thị cảnh báo
    }
    res.json({
        cobalt,
        customServices,
        config: {
            cobaltUrl: config.cobaltUrl,
            concurrency: config.concurrency,
            downloadDir: config.downloadDir,
        },
        queue: { running: queue.running, pending: queue.pending },
    });
});

// SSE: đẩy tiến độ realtime cho UI
app.get("/api/events", (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    });
    res.write(`event: snapshot\ndata: ${JSON.stringify(allJobs())}\n\n`);

    const onJob = (job) => res.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);
    const onRemove = (id) => res.write(`event: remove\ndata: ${JSON.stringify({ id })}\n\n`);
    jobEvents.on("job", onJob);
    jobEvents.on("remove", onRemove);

    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => {
        clearInterval(ping);
        jobEvents.off("job", onJob);
        jobEvents.off("remove", onRemove);
    });
});

await fsp.mkdir(config.downloadDir, { recursive: true });

const restored = await loadJobs();
initPersistence();

app.listen(config.port, () => {
    console.log(`downloadauto chạy tại  http://localhost:${config.port}`);
    console.log(`cobalt API:            ${config.cobaltUrl}`);
    console.log(`thư mục tải về:        ${config.downloadDir}`);
    console.log(`tải đồng thời tối đa:  ${config.concurrency}`);
    if (restored) console.log(`khôi phục lịch sử:     ${restored} job`);
});

import express from "express";
import path from "node:path";
import fsSync from "node:fs";
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
import { templateInfo, logoPath, isVideoFile, musicDir, listFonts, fontPath, imagesDir } from "./branding.js";
import { previewVoice, voiceStatus } from "./voice.js";

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

// CORS - cho phép frontend tại localhost:5173 gọi API
app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        res.set("Access-Control-Allow-Origin", origin);
        res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.set("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

// trang HTML luôn lấy bản mới nhất, tránh trình duyệt cache giao diện cũ
app.use((req, res, next) => {
    if (req.path === "/" || req.path.endsWith(".html")) {
        res.set("Cache-Control", "no-store");
    }
    next();
});
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

// danh sách video trong thư mục tải về (cho tab Chỉnh sửa)
app.get("/api/files", async (_req, res) => {
    let names = [];
    try {
        names = await fsp.readdir(config.downloadDir);
    } catch {}
    const files = [];
    for (const name of names) {
        if (!isVideoFile(name)) continue;
        try {
            const st = await fsp.stat(path.join(config.downloadDir, name));
            if (st.isFile()) files.push({ name, size: st.size, mtime: st.mtimeMs });
        } catch {}
    }
    files.sort((a, b) => b.mtime - a.mtime);
    res.json({ files });
});

// xóa một file video trong thư mục tải về
app.delete("/api/files/:name", async (req, res) => {
    const name = path.basename(req.params.name);
    const full = path.join(config.downloadDir, name);
    if (!isVideoFile(name) || !fsSync.existsSync(full)) {
        return res.status(404).json({ error: "Không tìm thấy file" });
    }
    await fsp.rm(full, { force: true });
    res.json({ ok: true });
});

// danh sách font + file font cho preview của editor
app.get("/api/fonts", (_req, res) => {
    res.json({ fonts: listFonts() });
});

app.get("/api/fonts/file/:id", (req, res) => {
    const p = fontPath(req.params.id);
    if (!p) return res.status(404).end();
    res.sendFile(p);
});

// template khung thương hiệu cho preview của editor
app.get("/api/branding/template", (_req, res) => {
    res.json(templateInfo());
});

// lưu chỉnh sửa khung từ UI vào branding/template.json
const pick = (obj, keys) => {
    const out = {};
    for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k];
    return out;
};

app.post("/api/branding/template", async (req, res) => {
    const body = req.body ?? {};
    const tplFile = path.join(config.brandingDir, "template.json");
    let cur = {};
    try {
        cur = JSON.parse(fsSync.readFileSync(tplFile, "utf8"));
    } catch {}
    const merged = {
        ...cur,
        banner: {
            ...cur.banner,
            ...pick(body.banner, ["title", "titleColor", "titleSize", "background", "font"]),
        },
        watermark: {
            ...cur.watermark,
            ...pick(body.watermark, ["text", "subtext", "color", "opacity", "size", "subSize", "x", "y", "font"]),
        },
    };
    if (Array.isArray(body.overlays)) {
        merged.overlays = body.overlays.slice(0, 8)
            .map((o) => ({
                file: path.basename(String(o.file ?? "")),
                x: Math.round(Number(o.x)) || 0,
                y: Math.round(Number(o.y)) || 0,
                w: Math.max(20, Math.round(Number(o.w)) || 100),
            }))
            .filter((o) => o.file);
    }
    await fsp.mkdir(config.brandingDir, { recursive: true });
    await fsp.writeFile(tplFile, JSON.stringify(merged, null, 4));
    res.json(templateInfo());
});

// ảnh trang trí của khung (logo phụ, sticker...)
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

app.get("/api/branding/images", async (_req, res) => {
    let names = [];
    try {
        names = await fsp.readdir(imagesDir());
    } catch {}
    res.json({
        files: names.filter((n) => IMAGE_EXTS.has(path.extname(n).toLowerCase())).sort(),
    });
});

app.get("/api/branding/images/:name", (req, res) => {
    const name = path.basename(req.params.name);
    const full = path.join(imagesDir(), name);
    if (!IMAGE_EXTS.has(path.extname(name).toLowerCase()) || !fsSync.existsSync(full)) {
        return res.status(404).end();
    }
    res.sendFile(full);
});

app.put("/api/branding/images/:name",
    express.raw({ type: () => true, limit: "20mb" }),
    async (req, res) => {
        const name = path.basename(req.params.name);
        if (!IMAGE_EXTS.has(path.extname(name).toLowerCase())) {
            return res.status(400).json({ error: "Chỉ nhận file ảnh (png, jpg, webp, gif)" });
        }
        if (!req.body?.length) {
            return res.status(400).json({ error: "File rỗng" });
        }
        await fsp.mkdir(imagesDir(), { recursive: true });
        await fsp.writeFile(path.join(imagesDir(), name), req.body);
        res.json({ ok: true, name });
    });

app.get("/api/branding/logo", (_req, res) => {
    const p = logoPath();
    if (!p) return res.status(404).end();
    res.sendFile(p);
});

// xuất hàng loạt video đã chỉnh sửa: mỗi mục thành một job trong hàng đợi.
// body: { items: [{file, transform, trim, blur}], options: {speed, audio} }
app.post("/api/edit", (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const globalOpts = req.body?.options ?? {};
    const created = [];
    const errors = [];
    for (const item of items) {
        const name = path.basename(String(item?.file ?? ""));
        const full = path.join(config.downloadDir, name);
        if (!name || !isVideoFile(name) || !fsSync.existsSync(full)) {
            errors.push(`File không hợp lệ: ${name || "(trống)"}`);
            continue;
        }
        const tf = item.transform ?? {};
        created.push(publicJob(enqueue({
            url: name,
            brand: {
                input: full,
                edit: {
                    transform: {
                        z: Number(tf.z) || 1,
                        ox: Number(tf.ox) || 0,
                        oy: Number(tf.oy) || 0,
                    },
                    trim: item.trim ?? null,
                    blur: Array.isArray(item.blur) ? item.blur : [],
                    texts: Array.isArray(item.texts) ? item.texts : [],
                    speed: Number(globalOpts.speed) || 1,
                    audio: globalOpts.audio ?? { mode: "keep" },
                },
                suffix: " [edit]",
            },
            label: "chỉnh sửa video",
        })));
    }
    if (!created.length) {
        return res.status(400).json({ error: errors.join("; ") || "Không có video nào" });
    }
    res.json({ jobs: created, errors });
});

// ── tab Giọng nói: tạo giọng đọc AI qua Voicebox / OmniVoice Studio ──
app.get("/api/voice/status", async (_req, res) => {
    const status = await voiceStatus();
    res.json({
        ...status,
        config: {
            voiceboxUrl: config.voiceboxUrl,
            omnivoiceUrl: config.omnivoiceUrl,
        },
    });
});

app.post("/api/voice/preview", async (req, res) => {
    const text = String(req.body?.text ?? "").trim();
    const profileId = String(req.body?.profileId ?? "").trim();
    const language = String(req.body?.language ?? "en").trim().slice(0, 8);
    const engine = String(req.body?.engine ?? "").trim().slice(0, 50) || null;
    const provider = ["voicebox", "omnivoice", "vieneu"].includes(req.body?.provider)
        ? req.body.provider
        : "voicebox";
    if (!text) return res.status(400).json({ error: "Chưa nhập lời thoại" });
    if (!profileId) return res.status(400).json({ error: "Chưa chọn giọng (profile)" });

    const ac = new AbortController();
    req.on("aborted", () => ac.abort());
    try {
        const audio = await previewVoice({ provider, text, profileId, language, engine }, ac.signal);
        res.set({
            "Content-Type": audio.contentType,
            "Cache-Control": "no-store",
        });
        res.send(audio.buffer);
    } catch (err) {
        if (ac.signal.aborted) return;
        res.status(500).json({ error: err?.message || "Không tạo được bản nghe thử" });
    }
});

app.post("/api/voice/generate", (req, res) => {
    // không giới hạn độ dài — văn bản dài được tự chia đoạn và nối liền mạch
    const text = String(req.body?.text ?? "").trim();
    const profileId = String(req.body?.profileId ?? "").trim();
    const language = String(req.body?.language ?? "en").trim().slice(0, 8);
    const engine = String(req.body?.engine ?? "").trim().slice(0, 50) || null;
    const provider = ["voicebox", "omnivoice", "vieneu"].includes(req.body?.provider)
        ? req.body.provider
        : "voicebox";
    if (!text) return res.status(400).json({ error: "Chưa nhập lời thoại" });
    if (!profileId) return res.status(400).json({ error: "Chưa chọn giọng (profile)" });

    const job = enqueue({
        url: text.length > 70 ? text.slice(0, 70) + "…" : text,
        voice: { provider, text, profileId, language, engine },
        label: `tạo giọng nói (${provider})`,
    });
    res.json({ job: publicJob(job) });
});

// nhạc nền cho chức năng thay âm thanh
const AUDIO_EXTS = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"]);

// nghe thử / xóa file trong kho âm thanh
app.get("/api/music/:name", (req, res) => {
    const name = path.basename(req.params.name);
    const full = path.join(musicDir(), name);
    if (!AUDIO_EXTS.has(path.extname(name).toLowerCase()) || !fsSync.existsSync(full)) {
        return res.status(404).end();
    }
    res.sendFile(full);
});

app.delete("/api/music/:name", async (req, res) => {
    const name = path.basename(req.params.name);
    const full = path.join(musicDir(), name);
    if (!AUDIO_EXTS.has(path.extname(name).toLowerCase()) || !fsSync.existsSync(full)) {
        return res.status(404).json({ error: "Không tìm thấy file" });
    }
    await fsp.rm(full, { force: true });
    res.json({ ok: true });
});

app.get("/api/music", async (_req, res) => {
    let names = [];
    try {
        names = await fsp.readdir(musicDir());
    } catch {}
    res.json({
        files: names.filter((n) => AUDIO_EXTS.has(path.extname(n).toLowerCase())).sort(),
    });
});

app.put("/api/music/:name",
    express.raw({ type: () => true, limit: "80mb" }),
    async (req, res) => {
        const name = path.basename(req.params.name);
        if (!AUDIO_EXTS.has(path.extname(name).toLowerCase())) {
            return res.status(400).json({ error: "Chỉ nhận file âm thanh (mp3, m4a, aac, wav, ogg, flac)" });
        }
        if (!req.body?.length) {
            return res.status(400).json({ error: "File rỗng" });
        }
        await fsp.mkdir(musicDir(), { recursive: true });
        await fsp.writeFile(path.join(musicDir(), name), req.body);
        res.json({ ok: true, name });
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

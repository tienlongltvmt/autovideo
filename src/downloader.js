import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { resolveMedia } from "./cobalt.js";
import { emitJob } from "./jobs.js";
import { findResolver } from "./resolvers/index.js";
import { findExpander } from "./expanders/index.js";
import { brandVideo, isVideoFile } from "./branding.js";

const controllers = new Map();

const EXT_BY_TYPE = { photo: "jpg", video: "mp4", gif: "gif" };

const ERROR_MESSAGES = {
    "error.api.link.invalid": "Link không hợp lệ hoặc không nhận diện được",
    "error.api.link.unsupported": "Nền tảng này chưa được hỗ trợ",
    "error.api.service.disabled": "Dịch vụ này bị tắt trên instance",
    "error.api.content.too_long": "Video dài quá giới hạn cho phép của instance",
    "error.api.content.video.unavailable": "Video không khả dụng (riêng tư hoặc giới hạn vùng)",
    "error.api.content.video.private": "Video ở chế độ riêng tư",
    "error.api.content.video.age": "Video bị giới hạn độ tuổi",
    "error.api.content.post.unavailable": "Bài đăng không khả dụng",
    "error.api.fetch.fail": "Không lấy được dữ liệu từ nền tảng, thử lại sau",
    "error.api.fetch.empty": "Nền tảng không trả về dữ liệu",
    "error.api.fetch.rate": "Nền tảng đang giới hạn truy cập, thử lại sau",
    "error.api.rate_exceeded": "Vượt giới hạn tốc độ của cobalt instance, chờ chút rồi thử lại",
    "error.api.capacity": "Instance đang quá tải, thử lại sau",
    "error.api.youtube.login": "YouTube yêu cầu đăng nhập (instance cần cấu hình cookies/token)",
    "error.api.youtube.token_expired": "Token YouTube của instance đã hết hạn",
};

// các lỗi tạm thời — đáng để tự thử lại thay vì báo lỗi ngay
const TRANSIENT_CODES = new Set([
    "error.api.fetch.fail",
    "error.api.fetch.rate",
    "error.api.rate_exceeded",
    "error.api.capacity",
]);
const TRANSIENT_NET_CODES = new Set([
    "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_SOCKET",
]);
const MAX_AUTO_RETRIES = 2;

function friendlyError(code, context) {
    let msg = ERROR_MESSAGES[code];
    if (!msg && code?.startsWith("error.api.auth")) {
        msg = "Instance yêu cầu xác thực — điền COBALT_API_KEY vào .env";
    }
    if (!msg) msg = `Lỗi từ cobalt: ${code || "không rõ"}`;
    if (context?.limit) msg += ` (giới hạn: ${context.limit})`;
    return msg;
}

function sanitizeFilename(name) {
    const clean = String(name)
        .replace(/[/\\:*?"<>|\x00-\x1f]/g, "_")
        .replace(/^\.+/, "")
        .trim()
        .slice(0, 200);
    return clean || "file";
}

async function uniquePath(dir, filename) {
    const ext = path.extname(filename);
    const base = filename.slice(0, filename.length - ext.length);
    let candidate = path.join(dir, filename);
    for (let n = 1; fs.existsSync(candidate); n++) {
        candidate = path.join(dir, `${base} (${n})${ext}`);
    }
    return candidate;
}

function extFromUrl(u) {
    try {
        const ext = path.extname(new URL(u).pathname).slice(1).toLowerCase();
        return /^[a-z0-9]{2,5}$/.test(ext) ? ext : "";
    } catch {
        return "";
    }
}

function safeHost(u) {
    try {
        return new URL(u).hostname.replace(/^www\./, "").split(".")[0];
    } catch {
        return "media";
    }
}

export function cancelJob(job) {
    if (!["queued", "resolving", "downloading", "processing"].includes(job.status)) return false;
    job.status = "canceled";
    job.finishedAt = Date.now();
    controllers.get(job.id)?.abort();
    emitJob(job, true);
    return true;
}

export function resetJob(job) {
    Object.assign(job, {
        status: "queued",
        filename: null,
        filePath: null,
        received: 0,
        total: 0,
        speed: 0,
        error: null,
        note: null,
        attempts: 0,
        finishedAt: null,
    });
    emitJob(job, true);
}

async function downloadToFile(job, url, filename, signal, headers) {
    await fsp.mkdir(config.downloadDir, { recursive: true });

    const res = await fetch(url, { signal, headers });
    if (!res.ok || !res.body) {
        const e = new Error(`Tải file thất bại (HTTP ${res.status})`);
        e.transient = res.status === 429 || res.status >= 500;
        throw e;
    }

    const filePath = await uniquePath(
        config.downloadDir,
        sanitizeFilename(filename || `download_${job.id}`)
    );
    job.filename = path.basename(filePath);
    job.filePath = filePath;
    job.total =
        Number(res.headers.get("content-length")) ||
        Number(res.headers.get("estimated-content-length")) ||
        0;
    job.status = "downloading";
    job._lastTick = Date.now();
    job._lastReceived = 0;
    emitJob(job, true);

    const out = fs.createWriteStream(filePath);
    try {
        for await (const chunk of res.body) {
            job.received += chunk.length;
            const now = Date.now();
            if (now - job._lastTick >= 500) {
                job.speed = Math.round(
                    (job.received - job._lastReceived) / ((now - job._lastTick) / 1000)
                );
                job._lastTick = now;
                job._lastReceived = job.received;
                emitJob(job);
            }
            if (!out.write(chunk)) {
                await new Promise((r) => out.once("drain", r));
            }
        }
        await new Promise((resolve, reject) =>
            out.end((err) => (err ? reject(err) : resolve()))
        );
    } catch (err) {
        out.destroy();
        await fsp.rm(filePath, { force: true }).catch(() => {});
        throw err;
    }
}

// nếu job bật tùy chọn gắn khung và kết quả là video → tạo job gắn khung
function maybeBrand(job, enqueueChild) {
    if (job.appOptions?.brand && isVideoFile(job.filePath)) {
        enqueueChild({
            url: job.url,
            brand: { input: job.filePath },
            label: "gắn khung thương hiệu",
        });
    }
}

// chạy một job: phân giải qua cobalt rồi tải file.
// - enqueueChild: tách mục con (picker/playlist/local-processing) thành job riêng
// - requeue(job, delayMs): đưa job vào lại hàng đợi khi gặp lỗi tạm thời
export async function runJob(job, enqueueChild, requeue) {
    if (job.status === "canceled") return;

    const controller = new AbortController();
    controllers.set(job.id, controller);

    try {
        // job gắn khung thương hiệu cho file đã tải xong
        if (job.brand) {
            if (!fs.existsSync(job.brand.input)) {
                throw new Error("File nguồn không còn trên đĩa");
            }
            job.status = "processing";
            emitJob(job, true);

            const ext = path.extname(job.brand.input);
            const base = path.basename(job.brand.input, ext);
            const outPath = await uniquePath(config.downloadDir, `${base} [brand].mp4`);
            await brandVideo(job.brand.input, outPath, controller.signal);

            const st = await fsp.stat(outPath);
            job.filename = path.basename(outPath);
            job.filePath = outPath;
            job.received = st.size;
            job.total = st.size;
            job.status = "done";
            job.finishedAt = Date.now();
            emitJob(job, true);
            return;
        }

        // mục con đã có link trực tiếp — tải luôn không cần phân giải
        if (job.direct) {
            await downloadToFile(
                job, job.direct.url, job.direct.filename,
                controller.signal, job.direct.headers
            );
            job.status = "done";
            job.speed = 0;
            job.finishedAt = Date.now();
            emitJob(job, true);
            maybeBrand(job, enqueueChild);
            return;
        }

        job.status = "resolving";
        emitJob(job, true);

        // URL trỏ đến tập video (playlist...) → tách thành từng video
        const expander = findExpander(job.url);
        if (expander) {
            const { title, items, hasMore } = await expander.expand(job.url, controller.signal);
            if (controller.signal.aborted) return;
            if (!items.length) throw new Error("Playlist trống hoặc không đọc được nội dung");

            items.forEach((item, i) => {
                enqueueChild({
                    url: item.url,
                    options: job.options,
                    appOptions: job.appOptions,
                    label: `video ${i + 1}/${items.length}`,
                });
            });
            job.status = "expanded";
            job.note = `Playlist “${title}” — đã thêm ${items.length} video vào hàng đợi`
                + (hasMore ? " (chỉ lấy tối đa 100 video đầu)" : "");
            job.finishedAt = Date.now();
            emitJob(job, true);
            return;
        }

        // nền tảng cobalt chưa hỗ trợ nhưng app có resolver riêng
        const resolver = findResolver(job.url);
        if (resolver) {
            const { items } = await resolver.resolve(job.url, controller.signal);
            if (controller.signal.aborted) return;

            if (items.length === 1) {
                await downloadToFile(
                    job, items[0].url, items[0].filename,
                    controller.signal, items[0].headers
                );
                job.status = "done";
                maybeBrand(job, enqueueChild);
            } else {
                items.forEach((item, i) => {
                    enqueueChild({
                        url: job.url,
                        direct: item,
                        appOptions: job.appOptions,
                        label: `mục ${i + 1}/${items.length}`,
                    });
                });
                job.status = "expanded";
                job.note = `Bài đăng chứa ${items.length} media — đã tách thành các mục tải riêng`;
            }
            job.speed = 0;
            job.finishedAt = Date.now();
            emitJob(job, true);
            return;
        }

        const data = await resolveMedia(job.url, job.options);
        if (controller.signal.aborted) return;

        switch (data.status) {
            case "redirect":
            case "tunnel": {
                await downloadToFile(job, data.url, data.filename, controller.signal);
                job.status = "done";
                job.speed = 0;
                job.finishedAt = Date.now();
                emitJob(job, true);
                maybeBrand(job, enqueueChild);
                break;
            }

            case "picker": {
                const host = safeHost(job.url);
                const items = data.picker ?? [];
                items.forEach((item, i) => {
                    const ext = extFromUrl(item.url) || EXT_BY_TYPE[item.type] || "bin";
                    enqueueChild({
                        url: job.url,
                        direct: {
                            url: item.url,
                            filename: `${host}_${job.id}_${i + 1}.${ext}`,
                        },
                        appOptions: job.appOptions,
                        label: `mục ${i + 1}/${items.length}`,
                    });
                });
                if (data.audio) {
                    enqueueChild({
                        url: job.url,
                        direct: {
                            url: data.audio,
                            filename: data.audioFilename
                                ? sanitizeFilename(data.audioFilename)
                                : `${host}_${job.id}_audio.mp3`,
                        },
                        label: "âm thanh nền",
                    });
                }
                const count = items.length + (data.audio ? 1 : 0);
                job.status = "expanded";
                job.note = `Bài đăng chứa nhiều media — đã tách thành ${count} mục tải riêng`;
                job.finishedAt = Date.now();
                emitJob(job, true);
                break;
            }

            case "local-processing": {
                // instance yêu cầu xử lý cục bộ (ghép/chuyển mã) — tải các
                // luồng thô về, việc ghép cần ffmpeg làm thủ công
                const tunnels = data.tunnel ?? [];
                const base = data.output?.filename || `output_${job.id}`;
                tunnels.forEach((t, i) => {
                    const suffix = tunnels.length > 1 ? `.part${i + 1}` : "";
                    enqueueChild({
                        url: job.url,
                        direct: { url: t, filename: sanitizeFilename(base) + suffix },
                        label: `luồng ${i + 1}/${tunnels.length}`,
                    });
                });
                job.status = "expanded";
                job.note =
                    tunnels.length > 1
                        ? `Instance trả về ${tunnels.length} luồng thô (cần ffmpeg để ghép thành ${base})`
                        : "Instance trả về luồng thô";
                job.finishedAt = Date.now();
                emitJob(job, true);
                break;
            }

            case "error": {
                const code = data.error?.code;
                const e = new Error(friendlyError(code, data.error?.context));
                e.transient = TRANSIENT_CODES.has(code);
                throw e;
            }

            default:
                throw new Error(`Phản hồi không xác định từ cobalt: ${data.status}`);
        }
    } catch (err) {
        if (job.status === "canceled" || controller.signal.aborted) {
            job.status = "canceled";
        } else {
            const netCode = err?.cause?.code;
            const message = netCode === "ECONNREFUSED"
                ? "Không kết nối được cobalt API — chạy `docker compose up -d` trước"
                : err.message;
            const transient = err.transient || TRANSIENT_NET_CODES.has(netCode);

            // lỗi tạm thời → tự thử lại với backoff thay vì bắt bấm tay
            if (transient && job.attempts < MAX_AUTO_RETRIES && requeue) {
                job.attempts += 1;
                Object.assign(job, {
                    status: "queued",
                    filename: null,
                    filePath: null,
                    received: 0,
                    total: 0,
                    speed: 0,
                    note: `Lỗi tạm thời: ${message} — tự thử lại (lần ${job.attempts}/${MAX_AUTO_RETRIES})`,
                });
                emitJob(job, true);
                requeue(job, 5000 * job.attempts);
                return;
            }

            job.status = "error";
            job.error = message;
        }
        job.speed = 0;
        job.finishedAt = Date.now();
        emitJob(job, true);
    } finally {
        controllers.delete(job.id);
    }
}

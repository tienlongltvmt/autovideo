import { EventEmitter } from "node:events";
import crypto from "node:crypto";

export const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(100);

const jobs = new Map();

// trạng thái: queued | resolving | downloading | done | expanded | error | canceled
export function createJob({ url, options = {}, appOptions = {}, direct = null, brand = null, label = "" }) {
    const job = {
        id: crypto.randomBytes(6).toString("hex"),
        url,
        options,
        appOptions, // tùy chọn của app (không gửi sang cobalt), vd { brand: true }
        direct, // { url, filename } — link tải trực tiếp (mục con của picker)
        brand, // { input } — job gắn khung thương hiệu cho file đã tải
        label,
        status: "queued",
        filename: null,
        filePath: null,
        received: 0,
        total: 0,
        speed: 0,
        error: null,
        note: null,
        attempts: 0,
        createdAt: Date.now(),
        finishedAt: null,
        _lastEmit: 0,
        _lastReceived: 0,
        _lastTick: 0,
    };
    jobs.set(job.id, job);
    return job;
}

// khôi phục job từ file persistence khi khởi động lại server
export function restoreJob(data) {
    const job = {
        options: {},
        appOptions: {},
        direct: null,
        brand: null,
        label: "",
        speed: 0,
        attempts: 0,
        ...data,
        _lastEmit: 0,
        _lastReceived: 0,
        _lastTick: 0,
    };
    // job đang chạy dở lúc server tắt → đánh dấu lỗi, cho phép thử lại
    if (["queued", "resolving", "downloading", "processing"].includes(job.status)) {
        job.status = "error";
        job.error = "Bị gián đoạn do server khởi động lại — bấm Thử lại";
        job.finishedAt = job.finishedAt ?? Date.now();
    }
    jobs.set(job.id, job);
    return job;
}

export function internalJobs() {
    return [...jobs.values()];
}

export function publicJob(job) {
    const { _lastEmit, _lastReceived, _lastTick, options, direct, brand, ...pub } = job;
    return { ...pub, hasDirect: !!direct, isBrand: !!brand };
}

// throttle phát sự kiện tiến độ để không dội SSE
export function emitJob(job, force = false) {
    const now = Date.now();
    if (!force && now - job._lastEmit < 300) return;
    job._lastEmit = now;
    jobEvents.emit("job", publicJob(job));
}

export function getJob(id) {
    return jobs.get(id);
}

export function allJobs() {
    return [...jobs.values()].map(publicJob);
}

export function deleteJob(id) {
    const ok = jobs.delete(id);
    if (ok) jobEvents.emit("remove", id);
    return ok;
}

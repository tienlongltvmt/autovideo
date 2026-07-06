// lưu hàng đợi xuống đĩa để lịch sử tải không mất khi restart server
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { jobEvents, internalJobs, restoreJob } from "./jobs.js";

const FILE = path.join(config.dataDir, "jobs.json");
let dirty = false;

const PERSISTED_FIELDS = [
    "id", "url", "options", "appOptions", "direct", "brand", "label",
    "status", "filename", "filePath", "received", "total", "error",
    "note", "attempts", "createdAt", "finishedAt",
];

function serialize(job) {
    const out = {};
    for (const k of PERSISTED_FIELDS) out[k] = job[k];
    return out;
}

function payload() {
    return JSON.stringify(internalJobs().map(serialize));
}

export async function loadJobs() {
    let raw;
    try {
        raw = await fsp.readFile(FILE, "utf8");
    } catch {
        return 0;
    }
    let list;
    try {
        list = JSON.parse(raw);
    } catch {
        return 0;
    }
    for (const data of list) {
        if (!data?.id || !data?.url) continue;
        // job đang tải dở lúc server tắt → file trên đĩa không hoàn chỉnh, dọn luôn
        if (data.status === "downloading" && data.filePath) {
            await fsp.rm(data.filePath, { force: true }).catch(() => {});
            data.filename = null;
            data.filePath = null;
            data.received = 0;
            data.total = 0;
        }
        restoreJob(data);
    }
    return list.length;
}

async function flush() {
    if (!dirty) return;
    dirty = false;
    try {
        await fsp.writeFile(FILE, payload());
    } catch {
        dirty = true;
    }
}

export function initPersistence() {
    fs.mkdirSync(config.dataDir, { recursive: true });
    jobEvents.on("job", () => { dirty = true; });
    jobEvents.on("remove", () => { dirty = true; });
    setInterval(flush, 2000).unref();

    const flushSync = () => {
        try {
            if (dirty) fs.writeFileSync(FILE, payload());
        } catch {}
    };
    process.on("exit", flushSync);
    for (const sig of ["SIGINT", "SIGTERM"]) {
        process.on(sig, () => {
            flushSync();
            process.exit(0);
        });
    }
}

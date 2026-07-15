// tích hợp engine tạo giọng nói AI chạy local — hỗ trợ đồng thời 2 provider:
// 1) Voicebox (https://github.com/jamiepine/voicebox)        — cổng 17493, API async + SSE
// 2) OmniVoice Studio (https://github.com/debpalash/OmniVoice-Studio)
//    — cổng 3900, API tương thích OpenAI (/v1/audio/speech), đồng bộ
// Giọng đọc tạo ra được lưu vào kho nhạc nền để lồng tiếng video.
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { config } from "./config.js";
import { musicDir } from "./branding.js";

const GENERATION_TIMEOUT_MS = 15 * 60 * 1000; // model chạy CPU có thể chậm
// giới hạn của POST /v1/audio/speech là 4096 ký tự — cắt câu ở mức an toàn
const OMNIVOICE_CHUNK_CHARS = 3500;

// ═══════════ trạng thái chung ═══════════

export async function voiceStatus() {
    const [voicebox, omnivoice, vieneu] = await Promise.all([
        probeVoicebox(),
        probeOpenAICompat(config.omnivoiceUrl),
        probeOpenAICompat(config.vieneuUrl, { defaultVoice: false }),
    ]);
    return { providers: { voicebox, omnivoice, vieneu } };
}

// điều phối theo provider — trả về đường dẫn file đã lưu vào kho nhạc nền
export async function generateVoice(voice, signal, onNote) {
    if (voice.provider === "omnivoice") {
        return generateOpenAICompat(config.omnivoiceUrl, "OmniVoice", voice, signal, onNote);
    }
    if (voice.provider === "vieneu") {
        return generateOpenAICompat(config.vieneuUrl, "VieNeu", voice, signal, onNote);
    }
    return generateVoicebox(voice, signal, onNote);
}

// tạo mẫu nghe thử ngắn, trả audio trực tiếp và không lưu vào kho nhạc nền
export async function previewVoice(voice, signal) {
    const text = previewText(voice.text);
    const preview = { ...voice, text };
    if (preview.provider === "omnivoice") {
        return previewOpenAICompat(config.omnivoiceUrl, "OmniVoice", preview, signal);
    }
    if (preview.provider === "vieneu") {
        return previewOpenAICompat(config.vieneuUrl, "VieNeu", preview, signal);
    }
    return previewVoicebox(preview, signal);
}

// ═══════════ tiện ích chung ═══════════

function slugify(text) {
    return String(text)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32)
        .toLowerCase() || "voice";
}

async function uniqueMusicPath(filename) {
    const dir = musicDir();
    await fsp.mkdir(dir, { recursive: true });
    const ext = path.extname(filename);
    const base = filename.slice(0, filename.length - ext.length);
    let candidate = path.join(dir, filename);
    for (let n = 1; fs.existsSync(candidate); n++) {
        candidate = path.join(dir, `${base} (${n})${ext}`);
    }
    return candidate;
}

function extFromContentType(ctype) {
    const c = String(ctype ?? "");
    if (c.includes("mpeg")) return ".mp3";
    if (c.includes("ogg")) return ".ogg";
    if (c.includes("mp4") || c.includes("m4a")) return ".m4a";
    if (c.includes("flac")) return ".flac";
    return ".wav";
}

function connectionError(err, name, hint) {
    if (err?.cause?.code === "ECONNREFUSED") {
        return new Error(`Không kết nối được ${name} — ${hint}`);
    }
    return err;
}

function previewText(text) {
    const cleaned = String(text ?? "").trim().replace(/\s+/g, " ");
    return cleaned.length > 220 ? cleaned.slice(0, 220).trimEnd() : cleaned;
}

// ═══════════ Voicebox ═══════════

async function probeVoicebox() {
    try {
        const h = await fetch(config.voiceboxUrl + "/health", {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(4000),
        });
        if (!h.ok) throw new Error(`HTTP ${h.status}`);
        let profiles = [];
        try {
            const p = await fetch(config.voiceboxUrl + "/profiles", {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(6000),
            });
            if (p.ok) profiles = await p.json();
        } catch {}
        return {
            connected: true,
            profiles: (Array.isArray(profiles) ? profiles : []).map((p) => ({
                id: p.id,
                name: p.name,
                language: p.language ?? null,
                engine: p.default_engine ?? p.preset_engine ?? null,
            })),
        };
    } catch {
        return { connected: false, profiles: [] };
    }
}

// đọc SSE trạng thái generation cho tới khi hoàn thành hoặc lỗi
async function waitForVoicebox(genId, signal) {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);
    const res = await fetch(
        `${config.voiceboxUrl}/generate/${encodeURIComponent(genId)}/status`,
        { headers: { Accept: "text/event-stream" }, signal: combined }
    );
    if (!res.ok || !res.body) {
        throw new Error(`Voicebox không trả về trạng thái (HTTP ${res.status})`);
    }
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = block.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            let ev;
            try {
                ev = JSON.parse(line.slice(6));
            } catch {
                continue;
            }
            if (ev.status === "completed") return ev;
            if (ev.status === "failed") {
                throw new Error(`Voicebox tạo giọng thất bại: ${ev.error || "không rõ lý do"}`);
            }
            if (ev.status === "not_found") {
                throw new Error("Voicebox không tìm thấy generation này");
            }
        }
    }
    throw new Error("Voicebox đóng kết nối trước khi tạo xong giọng");
}

async function generateVoicebox({ text, profileId, language, engine }, signal, onNote) {
    let res;
    try {
        res = await fetch(config.voiceboxUrl + "/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                text,
                profile_id: profileId,
                language: language || "en",
                ...(engine ? { engine } : {}),
            }),
            signal,
        });
    } catch (err) {
        throw connectionError(err, "Voicebox", "mở app Voicebox hoặc kiểm tra VOICEBOX_API_URL");
    }
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
            detail = (await res.json()).detail ?? detail;
        } catch {}
        throw new Error(`Voicebox từ chối yêu cầu: ${detail}`);
    }
    const gen = await res.json();

    onNote?.("Voicebox đang tổng hợp giọng nói…");
    await waitForVoicebox(gen.id, signal);

    const audio = await fetch(`${config.voiceboxUrl}/audio/${encodeURIComponent(gen.id)}`, { signal });
    if (!audio.ok) {
        throw new Error(`Không tải được audio từ Voicebox (HTTP ${audio.status})`);
    }
    const ext = extFromContentType(audio.headers.get("content-type"));
    const filePath = await uniqueMusicPath(`voice_${slugify(text)}${ext}`);
    await fsp.writeFile(filePath, Buffer.from(await audio.arrayBuffer()));
    return filePath;
}

async function previewVoicebox({ text, profileId, language, engine }, signal) {
    let res;
    try {
        res = await fetch(config.voiceboxUrl + "/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                text,
                profile_id: profileId,
                language: language || "en",
                ...(engine ? { engine } : {}),
            }),
            signal,
        });
    } catch (err) {
        throw connectionError(err, "Voicebox", "mở app Voicebox hoặc kiểm tra VOICEBOX_API_URL");
    }
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
            detail = (await res.json()).detail ?? detail;
        } catch {}
        throw new Error(`Voicebox từ chối yêu cầu nghe thử: ${detail}`);
    }
    const gen = await res.json();
    await waitForVoicebox(gen.id, signal);

    const audio = await fetch(`${config.voiceboxUrl}/audio/${encodeURIComponent(gen.id)}`, { signal });
    if (!audio.ok) {
        throw new Error(`Không tải được audio nghe thử từ Voicebox (HTTP ${audio.status})`);
    }
    return {
        buffer: Buffer.from(await audio.arrayBuffer()),
        contentType: audio.headers.get("content-type") || "audio/wav",
    };
}

// ═══════════ engine chuẩn OpenAI (OmniVoice Studio, VieNeu-TTS) ═══════════

async function probeOpenAICompat(baseUrl, { defaultVoice = true } = {}) {
    try {
        const r = await fetch(baseUrl + "/v1/audio/voices", {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(4000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const profiles = (data.voices ?? [])
            .filter((v) => v.type === "profile")
            .map((v) => ({
                id: v.voice_id,
                name: v.name,
                language: v.language ?? null,
                engine: null,
            }));
        // OmniVoice luôn có giọng mặc định của engine đang chọn
        if (defaultVoice) {
            profiles.unshift({
                id: "default", name: "Giọng mặc định (engine đang chọn)",
                language: null, engine: null,
            });
        }
        return { connected: true, profiles };
    } catch {
        return { connected: false, profiles: [] };
    }
}

// cắt văn bản theo ranh giới câu, mỗi đoạn tối đa `max` ký tự
function chunkText(text, max = OMNIVOICE_CHUNK_CHARS) {
    const sentences = String(text).split(/(?<=[.!?。！？…])\s+|\n+/);
    const chunks = [];
    let cur = "";
    for (let s of sentences) {
        s = s.trim();
        if (!s) continue;
        // câu đơn lẻ dài hơn max → cắt cứng
        while (s.length > max) {
            if (cur) { chunks.push(cur); cur = ""; }
            chunks.push(s.slice(0, max));
            s = s.slice(max);
        }
        if (cur && cur.length + s.length + 1 > max) {
            chunks.push(cur);
            cur = s;
        } else {
            cur = cur ? cur + " " + s : s;
        }
    }
    if (cur) chunks.push(cur);
    return chunks.length ? chunks : [String(text).slice(0, max)];
}

async function openAISpeech(baseUrl, name, input, voice, signal) {
    let res;
    try {
        res = await fetch(baseUrl + "/v1/audio/speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "tts-1", // ánh xạ sang engine đang chọn của server
                voice: voice || "default",
                input,
                response_format: "wav",
            }),
            signal,
        });
    } catch (err) {
        throw connectionError(err, name, `mở app ${name} hoặc kiểm tra cấu hình URL trong .env`);
    }
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
            detail = (await res.json()).detail ?? detail;
        } catch {}
        throw new Error(`${name} từ chối yêu cầu: ${detail}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

async function previewOpenAICompat(baseUrl, name, { text, profileId }, signal) {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);
    return {
        buffer: await openAISpeech(baseUrl, name, text, profileId, combined),
        contentType: "audio/wav",
    };
}

// nối nhiều file wav thành một bằng ffmpeg (filter concat)
async function concatAudio(files, outPath) {
    const ffmpeg = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
    const args = [
        "-y", "-hide_banner", "-loglevel", "error",
        ...files.flatMap((f) => ["-i", f]),
        "-filter_complex",
        files.map((_, i) => `[${i}:a]`).join("") + `concat=n=${files.length}:v=0:a=1[out]`,
        "-map", "[out]",
        outPath,
    ];
    await new Promise((resolve, reject) => {
        const proc = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        proc.stderr.on("data", (d) => { stderr += d; });
        proc.on("error", reject);
        proc.on("close", (code) =>
            code === 0 ? resolve() : reject(new Error(`ffmpeg concat lỗi: ${stderr.slice(-200)}`))
        );
    });
}

async function generateOpenAICompat(baseUrl, name, { text, profileId }, signal, onNote) {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);
    const chunks = chunkText(text);
    const filePath = await uniqueMusicPath(`voice_${slugify(text)}.wav`);

    if (chunks.length === 1) {
        onNote?.(`${name} đang tổng hợp giọng nói…`);
        await fsp.writeFile(filePath, await openAISpeech(baseUrl, name, chunks[0], profileId, combined));
        return filePath;
    }

    // văn bản dài: tạo từng đoạn rồi nối liền mạch
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "voice-"));
    try {
        const parts = [];
        for (let i = 0; i < chunks.length; i++) {
            onNote?.(`${name} đang tổng hợp đoạn ${i + 1}/${chunks.length}…`);
            const buf = await openAISpeech(baseUrl, name, chunks[i], profileId, combined);
            const part = path.join(tmpDir, `c${i}.wav`);
            await fsp.writeFile(part, buf);
            parts.push(part);
        }
        await concatAudio(parts, filePath);
        return filePath;
    } catch (err) {
        await fsp.rm(filePath, { force: true }).catch(() => {});
        throw err;
    } finally {
        await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}

// gắn khung thương hiệu vào video bằng ffmpeg:
// banner trên cùng (nền màu + logo + tiêu đề) và watermark chìm đè lên video.
// Cấu hình trong branding/template.json — đổi chữ/màu/logo không cần sửa code.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { config } from "./config.js";

const DEFAULTS = {
    width: 1080,
    // khung cố định khi chỉnh sửa bố cục (tab Chỉnh sửa) — mặc định 9:16
    canvas: {
        height: 1920,
        background: "#000000",
    },
    banner: {
        height: 170,
        background: "#0E3226",
        title: "Đào Tạo Dưỡng Sinh",
        titleColor: "#F0C96A",
        titleSize: 68,
        font: null, // id font riêng cho tiêu đề (mặc định dùng font chung)
        logo: "logo.png",
        logoHeight: 130,
    },
    watermark: {
        subtext: "",
        text: "",
        color: "white",
        opacity: 0.55,
        size: 44,
        subSize: 34,
        x: 46,
        y: 60,
        font: null, // id font riêng cho watermark
    },
    // ảnh trang trí/logo phụ đặt lên khung: [{ file, x, y, w }]
    overlays: [],
    font: "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    fontItalic: "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
    suffix: " [brand]",
};

export const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);

export function isVideoFile(filePath) {
    return VIDEO_EXTS.has(path.extname(filePath ?? "").toLowerCase());
}

function loadTemplate() {
    let user = {};
    try {
        user = JSON.parse(
            fs.readFileSync(path.join(config.brandingDir, "template.json"), "utf8")
        );
    } catch {}
    return {
        ...DEFAULTS,
        ...user,
        canvas: { ...DEFAULTS.canvas, ...user.canvas },
        banner: { ...DEFAULTS.banner, ...user.banner },
        watermark: { ...DEFAULTS.watermark, ...user.watermark },
        overlays: Array.isArray(user.overlays) ? user.overlays : [],
    };
}

// thư mục ảnh trang trí của khung
export function imagesDir() {
    return path.join(config.brandingDir, "images");
}

function overlayPath(file) {
    if (!file) return null;
    const p = path.join(imagesDir(), path.basename(String(file)));
    return fs.existsSync(p) ? p : null;
}

// thông tin template cho giao diện editor (kèm URL logo nếu có)
export function templateInfo() {
    const t = loadTemplate();
    return {
        ...t,
        logoUrl: resolveAsset(t.banner.logo) ? "/api/branding/logo" : null,
    };
}

export function logoPath() {
    return resolveAsset(loadTemplate().banner.logo);
}

// đọc kích thước (đã tính xoay) + có audio hay không, từ stderr của ffmpeg -i
function probeMedia(ffmpeg, input) {
    return new Promise((resolve, reject) => {
        const proc = spawn(ffmpeg, ["-hide_banner", "-i", input], {
            stdio: ["ignore", "ignore", "pipe"],
        });
        let err = "";
        proc.stderr.on("data", (d) => { err += d; });
        proc.on("error", reject);
        proc.on("close", () => {
            const m = err.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
            if (!m) return reject(new Error("Không đọc được kích thước video"));
            let w = Number(m[1]), h = Number(m[2]);
            const rot = err.match(/rotation of (-?\d+(?:\.\d+)?) degrees/);
            if (rot && Math.abs(Math.abs(parseFloat(rot[1])) % 180 - 90) < 1) {
                [w, h] = [h, w];
            }
            const dm = err.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
            const duration = dm
                ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3])
                : 0;
            resolve({ w, h, duration, hasAudio: /Stream #.*Audio:/.test(err) });
        });
    });
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// đường dẫn trong template có thể tương đối so với thư mục branding/
function resolveAsset(p) {
    if (!p) return null;
    const abs = path.isAbsolute(p) ? p : path.join(config.brandingDir, p);
    return fs.existsSync(abs) ? abs : null;
}

function ffColor(hex) {
    return String(hex).replace(/^#/, "0x");
}

// dùng textfile thay vì text= để khỏi phải escape tiếng Việt/ký tự đặc biệt
async function textFile(dir, content) {
    const file = path.join(dir, `t${Math.random().toString(36).slice(2)}.txt`);
    await fsp.writeFile(file, content);
    return file;
}

// đường dẫn nhúng vào filtergraph: quote và escape ' lẫn :
function fq(p) {
    return `'${String(p).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:")}'`;
}

// thư mục chứa nhạc nền do người dùng tải lên
export function musicDir() {
    return path.join(config.dataDir, "music");
}

// ── font chữ cho chức năng thêm text ──
// gồm font người dùng bỏ vào branding/ + các font hệ thống phổ biến có sẵn
const SYSTEM_FONT_DIR = "/System/Library/Fonts/Supplemental";
const SYSTEM_FONT_CANDIDATES = [
    "Arial.ttf", "Arial Bold.ttf", "Arial Italic.ttf", "Arial Black.ttf",
    "Times New Roman.ttf", "Times New Roman Bold.ttf",
    "Georgia.ttf", "Georgia Bold.ttf", "Verdana.ttf", "Verdana Bold.ttf",
    "Tahoma.ttf", "Trebuchet MS.ttf", "Courier New.ttf", "Impact.ttf",
];

export function listFonts() {
    const fonts = [];
    const seen = new Set();
    try {
        for (const f of fs.readdirSync(config.brandingDir)) {
            if (/\.(ttf|otf)$/i.test(f)) {
                fonts.push({ id: f, label: f.replace(/\.(ttf|otf)$/i, "") + " (branding)" });
                seen.add(f.toLowerCase());
            }
        }
    } catch {}
    for (const f of SYSTEM_FONT_CANDIDATES) {
        if (!seen.has(f.toLowerCase()) && fs.existsSync(path.join(SYSTEM_FONT_DIR, f))) {
            fonts.push({ id: f, label: f.replace(/\.ttf$/i, "") });
        }
    }
    return fonts;
}

export function fontPath(id) {
    const name = path.basename(String(id ?? ""));
    if (!/\.(ttf|otf)$/i.test(name)) return null;
    for (const dir of [config.brandingDir, SYSTEM_FONT_DIR]) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function resolveMusic(name) {
    if (!name) return null;
    const p = path.join(musicDir(), path.basename(String(name)));
    return fs.existsSync(p) ? p : null;
}

// edit: {
//   transform: { z, ox, oy }         — zoom (1 = vừa khung) + độ lệch tâm (px khung xuất)
//   trim: { start, end }             — cắt đoạn (giây)
//   speed: 0.5–2                     — tốc độ phát
//   audio: { mode: keep|mute|music, volume, music } — xử lý âm thanh
//   blur: [{ x, y, w, h }]           — các vùng làm mờ (tọa độ khung xuất)
//   texts: [{ text, x, y, size, color, font }] — chữ thêm lên video
// }
export async function brandVideo(inputPath, outputPath, signal, edit = null) {
    const t = loadTemplate();
    const font = resolveAsset(t.font);
    if (!font) {
        throw new Error(`Không tìm thấy font: ${t.font} — chỉnh "font" trong branding/template.json`);
    }
    const fontItalic = resolveAsset(t.fontItalic) ?? font;
    const logo = resolveAsset(t.banner.logo);
    const ffmpeg = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
    // font riêng của tiêu đề banner / watermark (nếu người dùng chọn)
    const bannerFont = fontPath(t.banner.font) ?? font;
    const wmFont = fontPath(t.watermark.font) ?? font;
    const wmSubFont = fontPath(t.watermark.font) ?? fontItalic;
    // ảnh trang trí trên khung
    const overlays = (t.overlays ?? [])
        .map((o) => ({ ...o, path: overlayPath(o.file) }))
        .filter((o) => o.path)
        .slice(0, 8);

    const e = edit ?? {};
    const transform = e.transform ?? null;
    const speed = clamp(Number(e.speed) || 1, 0.5, 2);
    const audioOpt = e.audio ?? {};
    const audioMode = ["keep", "mute", "music"].includes(audioOpt.mode) ? audioOpt.mode : "keep";
    const volume = clamp(Number(audioOpt.volume ?? 1), 0, 2);
    const trim = e.trim && Number(e.trim.end) > (Number(e.trim.start) || 0)
        ? { start: Math.max(0, Number(e.trim.start) || 0), end: Number(e.trim.end) }
        : null;
    // vùng mờ chỉ có nghĩa trên khung cố định của editor
    const blurBoxes = transform ? (Array.isArray(e.blur) ? e.blur.slice(0, 8) : []) : [];
    const texts = Array.isArray(e.texts) ? e.texts.slice(0, 8) : [];

    const musicFile = audioMode === "music" ? resolveMusic(audioOpt.music) : null;
    if (audioMode === "music" && !musicFile) {
        throw new Error("Không tìm thấy file nhạc nền — tải nhạc lên trước");
    }

    const W = t.width;
    const BH = t.banner.height;
    const CH = t.canvas.height;
    const { w: iw, h: ih, duration, hasAudio } = await probeMedia(ffmpeg, inputPath);
    // thời lượng đầu ra = đoạn giữ lại / tốc độ — dùng để chặn nhạc nền lặp vô hạn
    const srcDur = trim ? trim.end - trim.start : duration;
    const outDur = srcDur > 0 ? srcDur / speed : 0;
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "brand-"));

    try {
        const filters = [];
        if (transform) {
            // khung cố định W×CH: video được zoom/di chuyển trong vùng dưới banner,
            // cùng công thức với preview trên giao diện editor
            const AW = W;
            const AH = CH - BH;
            const z = clamp(Number(transform.z) || 1, 0.2, 6);
            const ox = Math.round(Number(transform.ox) || 0);
            const oy = Math.round(Number(transform.oy) || 0);
            const s = Math.min(AW / iw, AH / ih) * z;
            const dw = Math.max(2, Math.round(iw * s));
            const dh = Math.max(2, Math.round(ih * s));
            const posX = Math.round((AW - dw) / 2) + ox;
            const posY = BH + Math.round((AH - dh) / 2) + oy;

            // cắt phần video nằm trong khung rồi đặt lên nền
            const visX = Math.max(0, -posX);
            const visY = Math.max(0, -posY);
            const visW = Math.min(dw - visX, W - Math.max(0, posX));
            const visH = Math.min(dh - visY, CH - Math.max(0, posY));
            if (visW < 2 || visH < 2) {
                throw new Error("Video nằm hoàn toàn ngoài khung — chỉnh lại vị trí/zoom");
            }

            filters.push(
                `[0:v]scale=${dw}:${dh},crop=${visW}:${visH}:${visX}:${visY},` +
                `pad=${W}:${CH}:${Math.max(0, posX)}:${Math.max(0, posY)}` +
                `:color=${ffColor(t.canvas.background)},setsar=1[padded]`
            );

            // các vùng làm mờ (che watermark gốc) — vẽ trước banner
            let cur = "padded";
            blurBoxes.forEach((b, i) => {
                const bx = clamp(Math.round(b.x) || 0, 0, W - 8);
                const by = clamp(Math.round(b.y) || 0, 0, CH - 8);
                const bw = clamp(Math.round(b.w) || 0, 8, W - bx);
                const bh = clamp(Math.round(b.h) || 0, 8, CH - by);
                const r = Math.max(2, Math.min(16, Math.floor(Math.min(bw, bh) / 2) - 1));
                filters.push(`[${cur}]split=2[u${i}][c${i}]`);
                filters.push(
                    `[c${i}]crop=${bw}:${bh}:${bx}:${by},` +
                    `boxblur=luma_radius=${r}:luma_power=2:chroma_radius=${Math.max(1, Math.floor(r / 2))}[f${i}]`
                );
                filters.push(`[u${i}][f${i}]overlay=${bx}:${by}[m${i}]`);
                cur = `m${i}`;
            });

            filters.push(
                `[${cur}]drawbox=x=0:y=0:w=${W}:h=${BH}` +
                `:color=${ffColor(t.banner.background)}:t=fill[bg]`
            );
        } else {
            // chế độ cũ: giữ nguyên khung hình video, chỉ nối thêm banner phía trên
            filters.push(`[0:v]scale=${W}:-2,setsar=1[v0]`);
            filters.push(`[v0]pad=${W}:ih+${BH}:0:${BH}:color=${ffColor(t.banner.background)}[bg]`);
        }

        let current = "bg";
        if (logo) {
            filters.push(`[1:v]scale=-1:${t.banner.logoHeight}[logo]`);
            filters.push(`[bg][logo]overlay=34:(${BH}-overlay_h)/2[withlogo]`);
            current = "withlogo";
        }

        // ảnh trang trí của khung (input xếp sau logo, trước nhạc nền)
        const overlayBase = logo ? 2 : 1;
        overlays.forEach((o, i) => {
            const ow = Math.max(20, Math.round(Number(o.w)) || 100);
            filters.push(`[${overlayBase + i}:v]scale=${ow}:-1[ov${i}]`);
            filters.push(
                `[${current}][ov${i}]overlay=${Math.round(Number(o.x)) || 0}:${Math.round(Number(o.y)) || 0}[ovd${i}]`
            );
            current = `ovd${i}`;
        });

        const draws = [];
        if (t.banner.title) {
            draws.push(
                `drawtext=textfile=${fq(await textFile(tmpDir, t.banner.title))}` +
                `:fontfile=${fq(bannerFont)}:fontsize=${t.banner.titleSize}` +
                `:fontcolor=${ffColor(t.banner.titleColor)}` +
                `:x=(w-text_w)/2:y=(${BH}-text_h)/2`
            );
        }
        const wm = t.watermark;
        const wmColor = `${wm.color}@${wm.opacity}`;
        if (wm.subtext) {
            draws.push(
                `drawtext=textfile=${fq(await textFile(tmpDir, wm.subtext))}` +
                `:fontfile=${fq(wmSubFont)}:fontsize=${wm.subSize}` +
                `:fontcolor=${wmColor}:x=${wm.x}:y=${BH}+${wm.y}`
            );
        }
        if (wm.text) {
            draws.push(
                `drawtext=textfile=${fq(await textFile(tmpDir, wm.text))}` +
                `:fontfile=${fq(wmFont)}:fontsize=${wm.size}` +
                `:fontcolor=${wmColor}:x=${wm.x}:y=${BH}+${wm.y}+${wm.subSize + 14}`
            );
        }

        // chữ người dùng thêm — vẽ sau cùng, nổi trên mọi lớp
        for (const tx of texts) {
            const content = String(tx.text ?? "").slice(0, 200);
            if (!content.trim()) continue;
            const txFont = fontPath(tx.font) ?? font;
            const size = clamp(Math.round(Number(tx.size)) || 54, 12, 300);
            const color = /^#?[0-9a-fA-F]{6}$/.test(String(tx.color ?? ""))
                ? "0x" + String(tx.color).replace("#", "")
                : "white";
            draws.push(
                `drawtext=textfile=${fq(await textFile(tmpDir, content))}` +
                `:fontfile=${fq(txFont)}:fontsize=${size}:fontcolor=${color}` +
                `:x=${Math.round(Number(tx.x)) || 0}:y=${Math.round(Number(tx.y)) || 0}` +
                `:shadowcolor=black@0.4:shadowx=2:shadowy=2`
            );
        }
        // đổi tốc độ video ở bước cuối
        if (speed !== 1) {
            filters.push(`[${current}]${draws.join(",") || "null"}[preout]`);
            filters.push(`[preout]setpts=PTS/${speed}[out]`);
        } else {
            filters.push(`[${current}]${draws.join(",") || "null"}[out]`);
        }

        // âm thanh: giữ nguyên / tắt / thay nhạc nền (lặp theo độ dài video)
        const musicIdx = (logo ? 2 : 1) + overlays.length;
        const audioArgs = [];
        if (audioMode === "mute" || (audioMode === "keep" && !hasAudio)) {
            audioArgs.push("-an");
        } else if (audioMode === "music") {
            filters.push(`[${musicIdx}:a]volume=${volume}[aout]`);
            audioArgs.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
            // -shortest không dừng được khi nhạc lặp vô hạn → ép thời lượng đầu ra
            if (outDur > 0) audioArgs.push("-t", outDur.toFixed(3));
            else audioArgs.push("-shortest");
        } else if (speed !== 1 || volume !== 1) {
            filters.push(`[0:a]volume=${volume},atempo=${speed}[aout]`);
            audioArgs.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
        } else {
            audioArgs.push("-map", "0:a?", "-c:a", "copy");
        }

        const args = [
            "-y", "-hide_banner", "-loglevel", "error",
            ...(trim ? ["-ss", String(trim.start), "-t", String(Math.max(0.1, trim.end - trim.start))] : []),
            "-i", inputPath,
            ...(logo ? ["-i", logo] : []),
            ...overlays.flatMap((o) => ["-i", o.path]),
            ...(musicFile ? ["-stream_loop", "-1", "-i", musicFile] : []),
            "-filter_complex", filters.join(";"),
            "-map", "[out]",
            ...audioArgs,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            outputPath,
        ];

        await new Promise((resolve, reject) => {
            const proc = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
            let stderr = "";
            proc.stderr.on("data", (d) => { stderr += d; });
            const onAbort = () => proc.kill("SIGKILL");
            signal?.addEventListener("abort", onAbort, { once: true });
            proc.on("error", reject);
            proc.on("close", (code) => {
                signal?.removeEventListener("abort", onAbort);
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg lỗi (code ${code}): ${stderr.slice(-300)}`));
            });
        });
    } catch (err) {
        await fsp.rm(outputPath, { force: true }).catch(() => {});
        throw err;
    } finally {
        await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}

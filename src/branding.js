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
    banner: {
        height: 170,
        background: "#0E3226",
        title: "Đào Tạo Dưỡng Sinh",
        titleColor: "#F0C96A",
        titleSize: 68,
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
    },
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
        banner: { ...DEFAULTS.banner, ...user.banner },
        watermark: { ...DEFAULTS.watermark, ...user.watermark },
    };
}

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

export async function brandVideo(inputPath, outputPath, signal) {
    const t = loadTemplate();
    const font = resolveAsset(t.font);
    if (!font) {
        throw new Error(`Không tìm thấy font: ${t.font} — chỉnh "font" trong branding/template.json`);
    }
    const fontItalic = resolveAsset(t.fontItalic) ?? font;
    const logo = resolveAsset(t.banner.logo);
    const ffmpeg = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";

    const W = t.width;
    const BH = t.banner.height;
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "brand-"));

    try {
        const filters = [];
        // chuẩn hóa bề rộng, chừa chỗ banner phía trên
        filters.push(`[0:v]scale=${W}:-2,setsar=1[v0]`);
        filters.push(`[v0]pad=${W}:ih+${BH}:0:${BH}:color=${ffColor(t.banner.background)}[bg]`);

        let current = "bg";
        if (logo) {
            filters.push(`[1:v]scale=-1:${t.banner.logoHeight}[logo]`);
            filters.push(`[bg][logo]overlay=34:(${BH}-overlay_h)/2[withlogo]`);
            current = "withlogo";
        }

        const draws = [];
        if (t.banner.title) {
            draws.push(
                `drawtext=textfile=${fq(await textFile(tmpDir, t.banner.title))}` +
                `:fontfile=${fq(font)}:fontsize=${t.banner.titleSize}` +
                `:fontcolor=${ffColor(t.banner.titleColor)}` +
                `:x=(w-text_w)/2:y=(${BH}-text_h)/2`
            );
        }
        const wm = t.watermark;
        const wmColor = `${wm.color}@${wm.opacity}`;
        if (wm.subtext) {
            draws.push(
                `drawtext=textfile=${fq(await textFile(tmpDir, wm.subtext))}` +
                `:fontfile=${fq(fontItalic)}:fontsize=${wm.subSize}` +
                `:fontcolor=${wmColor}:x=${wm.x}:y=${BH}+${wm.y}`
            );
        }
        if (wm.text) {
            draws.push(
                `drawtext=textfile=${fq(await textFile(tmpDir, wm.text))}` +
                `:fontfile=${fq(font)}:fontsize=${wm.size}` +
                `:fontcolor=${wmColor}:x=${wm.x}:y=${BH}+${wm.y}+${wm.subSize + 14}`
            );
        }
        filters.push(`[${current}]${draws.join(",") || "null"}[out]`);

        const args = [
            "-y", "-hide_banner", "-loglevel", "error",
            "-i", inputPath,
            ...(logo ? ["-i", logo] : []),
            "-filter_complex", filters.join(";"),
            "-map", "[out]", "-map", "0:a?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-c:a", "copy",
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

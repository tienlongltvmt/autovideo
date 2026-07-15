import fs from "node:fs";
import path from "node:path";

// nạp .env thủ công để không cần thêm dependency
function loadEnvFile(file) {
    let text;
    try {
        text = fs.readFileSync(file, "utf8");
    } catch {
        return;
    }
    for (const line of text.split("\n")) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) {
            process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
    }
}

loadEnvFile(path.resolve(process.cwd(), ".env"));

export const config = {
    port: Number(process.env.PORT) || 3000,
    cobaltUrl: (process.env.COBALT_API_URL || "http://localhost:9000").replace(/\/+$/, ""),
    cobaltApiKey: process.env.COBALT_API_KEY || "",
    concurrency: Math.max(1, Number(process.env.CONCURRENCY) || 3),
    downloadDir: path.resolve(process.env.DOWNLOAD_DIR || "./downloads"),
    dataDir: path.resolve(process.env.DATA_DIR || "./data"),
    brandingDir: path.resolve(process.env.BRANDING_DIR || "./branding"),
    // API của Voicebox (app desktop mặc định lắng nghe cổng 17493)
    voiceboxUrl: (process.env.VOICEBOX_API_URL || "http://localhost:17493").replace(/\/+$/, ""),
    // API của OmniVoice Studio (app desktop mặc định cổng 3900)
    omnivoiceUrl: (process.env.OMNIVOICE_API_URL || "http://localhost:3900").replace(/\/+$/, ""),
    // API của VieNeu-TTS (server_api.py — engine tiếng Việt, cổng 3901)
    vieneuUrl: (process.env.VIENEU_API_URL || "http://localhost:3901").replace(/\/+$/, ""),
    // nếu đặt, toàn bộ app yêu cầu đăng nhập Basic Auth (user bất kỳ + mật khẩu này)
    appPassword: process.env.APP_PASSWORD || "",
};

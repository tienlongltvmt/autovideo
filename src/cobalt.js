import { config } from "./config.js";

function headers() {
    const h = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    };
    if (config.cobaltApiKey) {
        h["Authorization"] = `Api-Key ${config.cobaltApiKey}`;
    }
    return h;
}

// gọi POST / của cobalt để phân giải URL thành link tải
export async function resolveMedia(url, options = {}) {
    const res = await fetch(config.cobaltUrl + "/", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ url, ...options }),
    });

    let data;
    try {
        data = await res.json();
    } catch {
        throw new Error(`cobalt API trả về phản hồi không hợp lệ (HTTP ${res.status})`);
    }
    return data;
}

// GET / trả về thông tin instance (version, danh sách dịch vụ hỗ trợ)
export async function instanceInfo() {
    const res = await fetch(config.cobaltUrl + "/", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// module bắt link từ văn bản bất kỳ — dùng chung cho server (Node) và trình duyệt

// map hostname → tên service của cobalt, dùng để nhận diện nền tảng
// và bắt cả link viết thiếu scheme (vd: "tiktok.com/@user/video/123")
export const HOST_SERVICE = {
    "youtube.com": "youtube", "youtu.be": "youtube", "music.youtube.com": "youtube",
    "tiktok.com": "tiktok", "vm.tiktok.com": "tiktok", "vt.tiktok.com": "tiktok",
    "twitter.com": "twitter", "x.com": "twitter",
    "instagram.com": "instagram",
    "facebook.com": "facebook", "fb.watch": "facebook", "fb.com": "facebook",
    "bilibili.com": "bilibili", "b23.tv": "bilibili",
    "soundcloud.com": "soundcloud", "on.soundcloud.com": "soundcloud",
    "vimeo.com": "vimeo",
    "reddit.com": "reddit", "redd.it": "reddit",
    "pinterest.com": "pinterest", "pin.it": "pinterest",
    "snapchat.com": "snapchat",
    "twitch.tv": "twitch clips", "clips.twitch.tv": "twitch clips",
    "vk.com": "vk", "vkvideo.ru": "vk",
    "ok.ru": "ok",
    "rutube.ru": "rutube",
    "dailymotion.com": "dailymotion", "dai.ly": "dailymotion",
    "bsky.app": "bluesky",
    "tumblr.com": "tumblr",
    "loom.com": "loom",
    "streamable.com": "streamable",
    "newgrounds.com": "newgrounds",
    // các nền tảng app tự hỗ trợ qua resolver riêng (cobalt không có)
    "xiaohongshu.com": "xiaohongshu", "xhslink.com": "xiaohongshu",
};

const SCHEME_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

const hostAlt = Object.keys(HOST_SERVICE)
    .map((h) => h.replace(/\./g, "\\."))
    .join("|");
// bắt link thiếu scheme của các nền tảng đã biết, vd "www.youtube.com/watch?v=..."
const BARE_RE = new RegExp(
    `(?<![\\w@.])(?:www\\.|m\\.)?(?:${hostAlt})/[^\\s<>"'\`]*`,
    "gi"
);

// gọt dấu câu dính ở cuối link khi bắt từ văn bản ("...xem đi!" / "(link)")
function cleanUrl(u) {
    while (/[),.\]!?;:'"…»}]$/.test(u)) {
        if (
            u.endsWith(")") &&
            (u.match(/\(/g) || []).length >= (u.match(/\)/g) || []).length
        ) break;
        u = u.slice(0, -1);
    }
    return u;
}

export function extractLinks(text) {
    const t = String(text ?? "");
    const found = [];

    for (const raw of t.match(SCHEME_RE) ?? []) {
        found.push(cleanUrl(raw));
    }
    // che các link đã bắt để không bắt trùng phần thiếu scheme bên trong
    const masked = t.replace(SCHEME_RE, (m) => " ".repeat(m.length));
    for (const raw of masked.match(BARE_RE) ?? []) {
        found.push("https://" + cleanUrl(raw));
    }

    return [...new Set(
        found.filter((u) => {
            try { new URL(u); return true; } catch { return false; }
        })
    )];
}

// đoán service cobalt từ URL, trả về null nếu không nhận ra
export function serviceForUrl(u) {
    let host;
    try {
        host = new URL(u).hostname.toLowerCase();
    } catch {
        return null;
    }
    const stripped = host.replace(/^(www|m)\./, "");
    for (const h of [host, stripped]) {
        if (HOST_SERVICE[h]) return HOST_SERVICE[h];
    }
    for (const [h, s] of Object.entries(HOST_SERVICE)) {
        if (stripped.endsWith("." + h)) return s;
    }
    return null;
}

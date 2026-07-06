// resolver cho Xiaohongshu (RedNote) — nền tảng cobalt chưa hỗ trợ.
// Cách hoạt động: theo redirect của xhslink.com → trang note → đọc
// window.__INITIAL_STATE__ để lấy link video/ảnh trực tiếp từ CDN.

export const service = "xiaohongshu";

const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export function matches(url) {
    let host;
    try {
        host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return false;
    }
    return (
        host === "xhslink.com" ||
        host === "xiaohongshu.com" ||
        host.endsWith(".xiaohongshu.com")
    );
}

function https(u) {
    return String(u).replace(/^http:/, "https:");
}

function sanitizeTitle(title, fallback) {
    const t = String(title ?? "").trim();
    return t || fallback;
}

export async function resolve(url, signal) {
    const res = await fetch(url, {
        headers: {
            "User-Agent": UA,
            "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal,
    });
    if (!res.ok) {
        throw new Error(`Xiaohongshu trả về HTTP ${res.status}`);
    }
    const html = await res.text();

    const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?)<\/script>/);
    if (!m) {
        throw new Error("Không đọc được note Xiaohongshu (link hết hạn hoặc bị chặn)");
    }

    // state là JSON hợp lệ trừ các giá trị `undefined`
    let state;
    try {
        state = JSON.parse(m[1].replace(/\bundefined\b/g, "null"));
    } catch {
        throw new Error("Không phân tích được dữ liệu note Xiaohongshu");
    }

    const noteId = state.note?.firstNoteId;
    const note = state.note?.noteDetailMap?.[noteId]?.note;
    if (!note) {
        throw new Error("Note Xiaohongshu không tồn tại hoặc yêu cầu đăng nhập");
    }

    const title = sanitizeTitle(note.title, `xiaohongshu_${noteId}`);
    const headers = { "User-Agent": UA, "Referer": "https://www.xiaohongshu.com/" };

    if (note.type === "video") {
        const stream = note.video?.media?.stream ?? {};
        const candidates = [
            ...(stream.h264 ?? []),
            ...(stream.h265 ?? []),
            ...(stream.av1 ?? []),
        ];
        const src = candidates.find((s) => s?.masterUrl)?.masterUrl
            ?? candidates.flatMap((s) => s?.backupUrls ?? [])[0];
        if (!src) throw new Error("Note có video nhưng không tìm thấy luồng tải");
        return {
            items: [{ url: https(src), filename: `${title}.mp4`, headers }],
        };
    }

    // note dạng ảnh (có thể nhiều ảnh)
    const images = (note.imageList ?? [])
        .map((img) => img?.urlDefault)
        .filter(Boolean);
    if (!images.length) {
        throw new Error("Không tìm thấy media nào trong note");
    }
    return {
        items: images.map((u, i) => ({
            url: https(u),
            filename: images.length > 1 ? `${title}_${i + 1}.jpg` : `${title}.jpg`,
            headers,
        })),
    };
}

// expander cho playlist YouTube: cobalt chỉ nhận video lẻ, nên app
// tự đọc trang playlist để lấy danh sách video rồi tách thành job riêng.

export const name = "youtube-playlist";

const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_ITEMS = 100;

export function matches(url) {
    let u;
    try {
        u = new URL(url);
    } catch {
        return false;
    }
    const host = u.hostname.replace(/^(www|m)\./, "").toLowerCase();
    return (
        (host === "youtube.com" || host === "music.youtube.com") &&
        u.pathname === "/playlist" &&
        !!u.searchParams.get("list")
    );
}

export async function expand(url, signal) {
    const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "en" },
        signal,
    });
    if (!res.ok) throw new Error(`YouTube trả về HTTP ${res.status}`);
    const html = await res.text();

    const m = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/);
    if (!m) throw new Error("Không đọc được dữ liệu playlist (có thể playlist riêng tư)");

    let data;
    try {
        data = JSON.parse(m[1]);
    } catch {
        throw new Error("Không phân tích được dữ liệu playlist");
    }

    const title = data?.metadata?.playlistMetadataRenderer?.title || "playlist";

    // duyệt toàn bộ cây JSON để gom videoId — bền hơn là bám theo
    // đường dẫn cố định vốn hay bị YouTube đổi cấu trúc.
    // Hỗ trợ cả 2 thế hệ cấu trúc: playlistVideoRenderer (cũ)
    // và lockupViewModel/contentId (mới, từ ~2025)
    const ids = [];
    const seen = new Set();
    let hasMore = false;
    const add = (vid) => {
        if (vid && !seen.has(vid)) {
            seen.add(vid);
            ids.push(vid);
        }
    };
    (function walk(node) {
        if (!node || typeof node !== "object") return;
        if (node.playlistVideoRenderer?.videoId) {
            add(node.playlistVideoRenderer.videoId);
            return;
        }
        const lockup = node.lockupViewModel;
        if (lockup?.contentId && lockup?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
            add(lockup.contentId);
            return;
        }
        if (node.continuationItemRenderer) {
            hasMore = true;
            return;
        }
        for (const v of Object.values(node)) walk(v);
    })(data);

    return {
        title,
        hasMore: hasMore || ids.length > MAX_ITEMS,
        items: ids.slice(0, MAX_ITEMS).map((id) => ({
            url: `https://www.youtube.com/watch?v=${id}`,
        })),
    };
}

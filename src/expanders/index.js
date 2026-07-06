// registry các expander: URL trỏ đến TẬP video (playlist, album...)
// được tách thành nhiều job con trước khi phân giải từng video.
// Mỗi expander export: name, matches(url), expand(url, signal)
// → { title, items: [{ url }], hasMore }
import * as youtubePlaylist from "./youtube-playlist.js";

const expanders = [youtubePlaylist];

export function findExpander(url) {
    return expanders.find((e) => e.matches(url)) ?? null;
}

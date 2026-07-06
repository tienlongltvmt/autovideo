// registry các resolver riêng cho nền tảng cobalt chưa hỗ trợ.
// Mỗi resolver export: service (tên), matches(url), resolve(url, signal)
// → { items: [{ url, filename, headers? }] }
import * as xiaohongshu from "./xiaohongshu.js";

const resolvers = [xiaohongshu];

export function findResolver(url) {
    return resolvers.find((r) => r.matches(url)) ?? null;
}

export const customServices = resolvers.map((r) => r.service);

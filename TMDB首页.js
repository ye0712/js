// @name TMDB简约导航
// @author 定制版
// @description 基于 TMDB 的大类导航源，国内优先 + 平台筛选 + 排序筛选 + 追更
// @indexs 1
// @version 2.4.0

const OmniBox = require("omnibox_sdk");
const runner = require("spider_runner");

/* ==================== TMDB 配置 ==================== */
const TMDB_API_BASE = "https://api.tmdb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

const TMDB_BEARER =
    process.env.TMDB_BEARER_TOKEN ||
    process.env.TMDB_AUTH_TOKEN ||
    process.env.TMDB_ACCESS_TOKEN ||
    "";
const TMDB_API_KEY =
    process.env.TMDB_API_KEY ||
    process.env.TMDB_KEY ||
    "";

/* ==================== 平台配置 ==================== */
const PROVIDERS = [
    { id: "", name: "全部" },
    { id: "2007", name: "腾讯视频" },
    { id: "1330", name: "爱奇艺" },
    { id: "1419", name: "优酷" },
    { id: "1631", name: "芒果TV" },
    { id: "1605", name: "B站" },
];

const SORT_OPTIONS = [
    { id: "popularity.desc", name: "热度最高" },
    { id: "vote_average.desc", name: "评分最高" },
];

/* ==================== 分类定义 ==================== */
const CATEGORIES = [
    { id: "movie",        name: "电影",   type: "movie" },
    { id: "tv",           name: "电视剧", type: "tv" },
    { id: "variety",      name: "综艺",   type: "variety" },
    { id: "animation",    name: "动漫",   type: "animation" },
    { id: "documentary",  name: "纪录片", type: "documentary" },
    { id: "following",    name: "追更",   type: "following" },
];

const PAGE_SIZE = 20;
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

module.exports = { home, category, detail, search, play };
runner.run(module.exports);

// ==================== 首页 ====================
async function home() {
    const classes = CATEGORIES.map(cat => ({ type_id: cat.id, type_name: cat.name }));

    const filters = {};
    for (const cat of CATEGORIES) {
        if (cat.type === "following") {
            filters[cat.id] = [];
            continue;
        }
        filters[cat.id] = [
            {
                key: "provider",
                name: "平台",
                init: "",
                value: PROVIDERS.map(p => ({ name: p.name, value: p.id })),
            },
            {
                key: "sort",
                name: "排序",
                init: "popularity.desc",
                value: SORT_OPTIONS.map(s => ({ name: s.name, value: s.id })),
            },
        ];
    }

    let list = [];
    try {
        const following = await fetchFollowing();
        if (following.length > 0) {
            list = following.map(item => mapFollowingToVod(item));
        }
    } catch (_) {}

    if (list.length === 0) {
        const items = await fetchCategoryContent("movie", 1, "", "popularity.desc");
        list = items.map(item => mapToVod(item, "movie"));
    }

    return { class: classes, filters, list };
}

// ==================== 分类列表 ====================
async function category(params) {
    const page = parseInt(params?.page || 1, 10) || 1;
    const categoryId = String(params?.categoryId || "movie");
    const providerId = String(params?.filters?.provider || "");
    const sortBy = String(params?.filters?.sort || "popularity.desc");

    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat) {
        return { page: 1, pagecount: 0, total: 0, list: [] };
    }

    if (cat.type === "following") {
        const following = await fetchFollowing();
        const list = following.map(item => mapFollowingToVod(item));
        return { page: 1, pagecount: 1, total: list.length, list };
    }

    const items = await fetchCategoryContent(cat.type, page, providerId, sortBy);
    const mediaType = (cat.type === "tv" || cat.type === "variety" || cat.type === "animation") ? "tv" : "movie";
    const list = items.map(item => mapToVod(item, mediaType));

    return {
        page,
        pagecount: list.length < PAGE_SIZE ? page : page + 1,
        total: (page - 1) * PAGE_SIZE + list.length,
        list,
    };
}

// ==================== 内容获取策略 ====================
async function fetchCategoryContent(categoryType, page, providerId, sortBy) {
    let results;

    if (providerId) {
        results = await fetchByProvider(categoryType, page, providerId, sortBy);
        if (results.length < PAGE_SIZE) {
            const fallback = await fetchDefault(categoryType, page, sortBy);
            const existingIds = new Set(results.map(r => r.id));
            const extra = fallback.filter(item => !existingIds.has(item.id));
            results = [...results, ...extra].slice(0, PAGE_SIZE);
        }
    } else {
        results = await fetchDefault(categoryType, page, sortBy);
    }

    return results;
}

async function fetchByProvider(categoryType, page, providerId, sortBy) {
    const foreignPlatforms = ["213", "2739", "49", "2552"];
    const isForeign = foreignPlatforms.includes(providerId);

    let mediaType, endpoint, params;

    if (categoryType === "movie") {
        mediaType = "movie";
        endpoint = "/discover/movie";
        params = { language: "zh-CN", page, sort_by: sortBy || "popularity.desc" };
        if (isForeign) {
            const usMap = { "213": "8", "2739": "337", "49": "1899|15", "2552": "350" };
            params.watch_region = "US";
            params.with_watch_providers = usMap[providerId] || providerId;
        } else {
            return [];
        }
    } else {
        mediaType = "tv";
        endpoint = "/discover/tv";
        params = {
            language: "zh-CN", page, sort_by: sortBy || "popularity.desc",
            include_adult: false, include_null_first_air_dates: false,
        };

        if (isForeign) {
            const usMap = { "213": "8", "2739": "337", "49": "1899|15", "2552": "350" };
            params.watch_region = "US";
            params.with_watch_providers = usMap[providerId] || providerId;
        } else {
            params.with_networks = providerId;
        }

        if (categoryType === "animation") {
            params.with_genres = "16";
        } else if (categoryType === "variety") {
            params.with_genres = "10764|10767";
        } else if (categoryType === "tv") {
            params.without_genres = "16,10764,10767";
        }
    }

    const res = await tmdbGet(endpoint, params);
    return res?.results || [];
}

async function fetchDefault(categoryType, page, sortBy) {
    switch (categoryType) {
        case "movie": return await fetchMainstreamChineseMovies(page, sortBy);
        case "tv": return await fetchMainstreamChineseTV(page, sortBy);
        case "variety": return await fetchChineseVariety(page, sortBy);
        case "animation": return await fetchHotAnimation(page, sortBy);
        case "documentary": return await fetchChineseDocumentary(page, sortBy);
        default: return [];
    }
}

async function fetchMainstreamChineseMovies(page, sortBy) {
    let results = [];
    const zhMovies = await tmdbGet("/discover/movie", {
        language: "zh-CN", page, sort_by: sortBy || "popularity.desc",
        with_original_language: "zh",
        "vote_count.gte": sortBy === "vote_average.desc" ? 20 : 100,
    });
    results = zhMovies?.results || [];
    if (results.length < PAGE_SIZE) {
        const globalMovies = await tmdbGet("/discover/movie", {
            language: "zh-CN", page: 1, sort_by: sortBy || "popularity.desc",
            "vote_count.gte": sortBy === "vote_average.desc" ? 200 : 1000,
            "vote_average.gte": sortBy === "vote_average.desc" ? 7 : 0,
        });
        const existingIds = new Set(results.map(r => r.id));
        const globalResults = (globalMovies?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }
    return results;
}

async function fetchMainstreamChineseTV(page, sortBy) {
    let results = [];
    const zhTV = await tmdbGet("/discover/tv", {
        language: "zh-CN", page, sort_by: sortBy || "popularity.desc",
        with_original_language: "zh",
        "vote_count.gte": sortBy === "vote_average.desc" ? 5 : 20,
        without_genres: "16,10763,10767,10762",
    });
    results = zhTV?.results || [];
    if (results.length < PAGE_SIZE) {
        const globalTV = await tmdbGet("/discover/tv", {
            language: "zh-CN", page: 1, sort_by: sortBy || "popularity.desc",
            "vote_count.gte": sortBy === "vote_average.desc" ? 100 : 300,
            "vote_average.gte": sortBy === "vote_average.desc" ? 7.5 : 0,
            without_genres: "16,10763,10767,10762",
        });
        const existingIds = new Set(results.map(r => r.id));
        const globalResults = (globalTV?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }
    return results;
}

async function fetchChineseVariety(page, sortBy) {
    let results = [];
    const zhVariety = await tmdbGet("/discover/tv", {
        language: "zh-CN", page, sort_by: sortBy || "popularity.desc",
        with_genres: "10764,10767", with_original_language: "zh",
        "vote_count.gte": 3, without_genres: "16",
    });
    results = zhVariety?.results || [];
    if (results.length < PAGE_SIZE) {
        const globalVariety = await tmdbGet("/discover/tv", {
            language: "zh-CN", page: 1, sort_by: sortBy || "popularity.desc",
            with_genres: "10764,10767",
            "vote_count.gte": sortBy === "vote_average.desc" ? 20 : 30,
            without_genres: "16",
        });
        const existingIds = new Set(results.map(r => r.id));
        const globalResults = (globalVariety?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }
    return results;
}

async function fetchHotAnimation(page, sortBy) {
    let results = [];
    const cnAnime = await tmdbGet("/discover/tv", {
        language: "zh-CN", page, sort_by: sortBy || "popularity.desc",
        with_genres: "16", with_original_language: "zh",
        "vote_count.gte": 3,
    });
    results = cnAnime?.results || [];
    if (results.length < PAGE_SIZE) {
        const jpAnime = await tmdbGet("/discover/tv", {
            language: "zh-CN", page: 1, sort_by: sortBy || "popularity.desc",
            with_genres: "16", with_original_language: "ja",
            "vote_count.gte": sortBy === "vote_average.desc" ? 10 : 30,
        });
        const existingIds = new Set(results.map(r => r.id));
        const jpResults = (jpAnime?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...jpResults].slice(0, PAGE_SIZE);
    }
    if (results.length < PAGE_SIZE) {
        const globalAnime = await tmdbGet("/discover/tv", {
            language: "zh-CN", page: 1, sort_by: sortBy || "popularity.desc",
            with_genres: "16",
            "vote_count.gte": sortBy === "vote_average.desc" ? 50 : 100,
        });
        const existingIds = new Set(results.map(r => r.id));
        const globalResults = (globalAnime?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }
    return results;
}

async function fetchChineseDocumentary(page, sortBy) {
    let results = [];
    const zhDoc = await tmdbGet("/discover/movie", {
        language: "zh-CN", page, sort_by: sortBy || "popularity.desc",
        with_genres: "99", with_original_language: "zh",
        "vote_count.gte": 3,
    });
    results = zhDoc?.results || [];
    if (results.length < PAGE_SIZE) {
        const globalDoc = await tmdbGet("/discover/movie", {
            language: "zh-CN", page: 1, sort_by: sortBy || "popularity.desc",
            with_genres: "99",
            "vote_count.gte": sortBy === "vote_average.desc" ? 100 : 200,
            "vote_average.gte": sortBy === "vote_average.desc" ? 8 : 0,
        });
        const existingIds = new Set(results.map(r => r.id));
        const globalResults = (globalDoc?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }
    return results;
}

// ==================== ID 提取工具 ====================
function extractTmdbId(vodId) {
    const parts = String(vodId || "").split("|");
    for (const part of parts) {
        const num = parseInt(part, 10);
        if (num > 0 && num < 99999999) return num;
    }
    return null;
}

// ==================== 追更功能 ====================
async function fetchFollowing() {
    let favorites = [];
    try { favorites = await OmniBox.getFavorites(); } catch (_) { return []; }
    if (!Array.isArray(favorites) || favorites.length === 0) return [];

    const results = [];
    const seen = new Set();

    for (const fav of favorites) {
        const vodId = String(fav.vod_id || fav.vodId || "");
        const favName = String(fav.vod_name || fav.name || fav.title || "").trim();
        if (!vodId || seen.has(vodId)) continue;

        let tmdbId = extractTmdbId(vodId);
        let detail = null;

        // 方案1：用提取的数字 ID 直接查
        if (tmdbId) {
            try {
                detail = await tmdbGet(`/tv/${tmdbId}`, { language: "zh-CN" });
                if (!detail || !detail.name) detail = null;
            } catch (_) { detail = null; }
        }

        // 方案2：用收藏标题搜索
        if (!detail && favName) {
            try {
                const searchRes = await tmdbGet("/search/tv", { query: favName, language: "zh-CN", page: 1 });
                if (searchRes?.results?.length > 0) {
                    detail = searchRes.results[0];
                    tmdbId = detail.id;
                    // 获取完整详情
                    try {
                        detail = await tmdbGet(`/tv/${tmdbId}`, { language: "zh-CN" });
                    } catch (_) {}
                }
            } catch (_) {}
        }

        if (!detail || !detail.name) continue;
        if (seen.has(String(tmdbId))) continue;
        seen.add(String(tmdbId));

        const lastEpisode = detail.last_episode_to_air;
        const nextEpisode = detail.next_episode_to_air;
        const totalEpisodes = detail.number_of_episodes || 0;

        let episodeInfo = "";
        let nextDateInfo = "";

        if (nextEpisode && nextEpisode.air_date) {
            const nextDate = new Date(nextEpisode.air_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) {
                nextDateInfo = `第${nextEpisode.episode_number}集 今天更新`;
            } else if (diffDays === 1) {
                nextDateInfo = `第${nextEpisode.episode_number}集 明天更新`;
            } else if (diffDays <= 7) {
                nextDateInfo = `第${nextEpisode.episode_number}集 ${WEEKDAYS[nextDate.getDay()]}更新`;
            } else {
                const month = nextDate.getMonth() + 1;
                const day = nextDate.getDate();
                nextDateInfo = `第${nextEpisode.episode_number}集 ${month}月${day}日更新`;
            }
        }

        if (lastEpisode && totalEpisodes > 0) {
            episodeInfo = detail.status === "Ended" ? `全${totalEpisodes}集` : `已播${lastEpisode.episode_number}/${totalEpisodes}集`;
        } else if (lastEpisode) {
            episodeInfo = detail.status === "Ended" ? `全${totalEpisodes || lastEpisode.episode_number}集` : `已播${lastEpisode.episode_number}集`;
        } else {
            episodeInfo = detail.status === "Returning Series" ? "连载中" : detail.status === "Ended" ? "已完结" : "";
        }

        results.push({
            vod_id: `tv|${tmdbId}`,
            vod_name: detail.name || "",
            vod_pic: detail.poster_path ? TMDB_IMAGE_BASE + detail.poster_path : "",
            vod_year: (detail.first_air_date || "").substring(0, 4),
            vod_content: detail.overview || "",
            vod_douban_score: detail.vote_average ? `⭐${detail.vote_average.toFixed(1)}` : "",
            vod_remarks: nextDateInfo || episodeInfo,
            _nextDate: nextEpisode?.air_date || "9999-12-31",
        });
    }

    results.sort((a, b) => a._nextDate.localeCompare(b._nextDate));
    return results;
}

function mapFollowingToVod(item) {
    return {
        vod_id: item.vod_id,
        vod_name: item.vod_name,
        vod_pic: item.vod_pic,
        vod_year: item.vod_year,
        vod_remarks: item.vod_remarks,
        vod_douban_score: item.vod_douban_score,
        type_name: "追更",
        vod_content: item.vod_content,
    };
}

// ==================== 列表项映射 ====================
function mapToVod(item, mediaType) {
    const title = item.title || item.name || "";
    const date = item.release_date || item.first_air_date || "";
    const year = date.substring(0, 4);
    const score = item.vote_average ? `⭐${item.vote_average.toFixed(1)}` : "";

    let remarks = "";
    if (mediaType === "movie") {
        remarks = year || "";
    } else {
        const lastEp = item.last_episode_to_air;
        const lastNum = lastEp ? lastEp.episode_number : 0;
        const totalNum = item.number_of_episodes || 0;

        if (lastNum > 0 && totalNum > 0) {
            remarks = `已播${lastNum}/${totalNum}集`;
        } else if (lastNum > 0) {
            remarks = `已播${lastNum}集`;
        } else if (totalNum > 0) {
            remarks = `共${totalNum}集`;
        } else {
            remarks = year || "";
        }
    }

    return {
        vod_id: `${mediaType}|${item.id}`,
        vod_name: title,
        vod_pic: item.poster_path ? TMDB_IMAGE_BASE + item.poster_path : "",
        vod_year: year,
        vod_remarks: remarks,
        vod_douban_score: score,
        type_name: mediaType === "movie" ? "电影" : "电视剧",
        vod_content: item.overview || "",
    };
}

// ==================== 详情 ====================
async function detail(params) {
    const vodId = String(params?.vod_id || "");
    if (!vodId) return { list: [] };

    const parts = vodId.split("|");
    const mediaType = parts[0];
    const tmdbId = parts[1];

    if (!mediaType || !tmdbId) return { list: [] };

    const detailData = await tmdbGet(`/${mediaType}/${tmdbId}`, { language: "zh-CN" });
    if (!detailData || detailData.success === false) return { list: [] };

    let followingInfo = "";
    if (mediaType === "tv") {
        const nextEp = detailData.next_episode_to_air;
        const lastEp = detailData.last_episode_to_air;
        const totalEps = detailData.number_of_episodes || 0;

        if (nextEp && nextEp.air_date) {
            const nextDate = new Date(nextEp.air_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) followingInfo = `下一集：第${nextEp.episode_number}集 今天更新`;
            else if (diffDays === 1) followingInfo = `下一集：第${nextEp.episode_number}集 明天更新`;
            else if (diffDays <= 7) followingInfo = `下一集：第${nextEp.episode_number}集 ${WEEKDAYS[nextDate.getDay()]}更新`;
            else {
                const month = nextDate.getMonth() + 1;
                const day = nextDate.getDate();
                followingInfo = `下一集：第${nextEp.episode_number}集 ${month}月${day}日更新`;
            }
        } else if (lastEp && totalEps > 0 && detailData.status !== "Ended") {
            followingInfo = `已播：${lastEp.episode_number}/${totalEps}集`;
        } else if (detailData.status === "Ended") {
            followingInfo = `已完结 · 共${totalEps}集`;
        }
    }

    const vod = {
        vod_id: vodId,
        vod_name: detailData.title || detailData.name || "",
        vod_pic: detailData.poster_path ? TMDB_IMAGE_BASE + detailData.poster_path : "",
        vod_content: detailData.overview || "",
        vod_year: (detailData.release_date || detailData.first_air_date || "").substring(0, 4),
        vod_douban_score: detailData.vote_average ? detailData.vote_average.toFixed(1) : "",
        vod_remarks: followingInfo || detailData.genres?.map(g => g.name).join("/") || "",
        type_name: mediaType === "movie" ? "电影" : "电视剧",
        vod_play_from: "在线播放",
    };

    if (mediaType === "movie") {
        vod.vod_play_url = `${detailData.title || ""}$${mediaType}|${tmdbId}|play`;
    } else {
        const seasonNumbers = detailData.seasons
            ?.filter(s => s.season_number > 0)
            .map(s => s.season_number)
            .sort((a, b) => a - b) || [1];

        const playUrls = [];
        const playSources = [];

        for (const seasonNum of seasonNumbers) {
            const seasonData = await tmdbGet(`/tv/${tmdbId}/season/${seasonNum}`, { language: "zh-CN" });
            const episodes = seasonData?.episodes || [];
            for (const ep of episodes) {
                const epNum = ep.episode_number;
                const epName = ep.name || `第${epNum}集`;
                playUrls.push(`第${seasonNum}季${epName}$${mediaType}|${tmdbId}|S${seasonNum}E${epNum}`);
            }
            playSources.push(`第${seasonNum}季`);
        }

        vod.vod_play_from = playSources.join("$$$");
        vod.vod_play_url = playUrls.join("$$$");
    }

    return { list: [vod] };
}

// ==================== 搜索 ====================
async function search(params) {
    const keyword = String(params?.keyword || "").trim();
    const page = parseInt(params?.page || 1, 10) || 1;

    if (!keyword) {
        return { page: 1, pagecount: 0, total: 0, list: [] };
    }

    const [movieRes, tvRes] = await Promise.all([
        tmdbGet("/search/movie", { query: keyword, language: "zh-CN", page }),
        tmdbGet("/search/tv", { query: keyword, language: "zh-CN", page }),
    ]);

    const movieItems = (movieRes?.results || []).map(item => mapToVod(item, "movie"));
    const tvItems = (tvRes?.results || []).map(item => mapToVod(item, "tv"));

    const list = [...movieItems, ...tvItems];
    const total = (movieRes?.total_results || 0) + (tvRes?.total_results || 0);

    return { page, pagecount: Math.ceil(total / PAGE_SIZE), total, list };
}

// ==================== 播放 ====================
async function play(params) {
    const playId = String(params?.playId || "");
    const parts = playId.split("|");
    const mediaType = parts[0];
    const tmdbId = parts[1];
    const episodeInfo = parts[2] || "";

    let searchKeyword = "";
    try {
        const detail = await tmdbGet(`/${mediaType}/${tmdbId}`, { language: "zh-CN" });
        searchKeyword = detail.title || detail.name || "";
    } catch (_) {}

    if (!searchKeyword) return { url: "", message: "无法获取影片标题" };

    if (mediaType === "tv" && episodeInfo) {
        const match = episodeInfo.match(/S(\d+)E(\d+)/);
        if (match) {
            searchKeyword += ` 第${parseInt(match[1])}季 第${parseInt(match[2])}集`;
        }
    }

    return { url: `search://${encodeURIComponent(searchKeyword)}`, parse: 1 };
}

// ==================== 工具函数 ====================
async function tmdbGet(endpoint, params = {}) {
    const url = new URL(TMDB_API_BASE + endpoint);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    });

    const headers = { Accept: "application/json", "User-Agent": "Mozilla/5.0" };

    if (TMDB_BEARER) {
        headers.Authorization = `Bearer ${TMDB_BEARER}`;
    } else if (TMDB_API_KEY) {
        url.searchParams.set("api_key", TMDB_API_KEY);
    } else {
        throw new Error("请设置 TMDB 环境变量：TMDB_BEARER_TOKEN 或 TMDB_API_KEY");
    }

    const res = await OmniBox.request(url.toString(), { method: "GET", timeout: 15000, headers });
    if (res.statusCode !== 200 || !res.body) throw new Error(`TMDB 请求失败: HTTP ${res.statusCode}`);
    return JSON.parse(typeof res.body === "string" ? res.body : String(res.body));
}
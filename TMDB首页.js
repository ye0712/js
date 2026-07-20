// @name TMDB简约导航
// @author 定制版
// @description 基于 TMDB 的大类导航源，含追更功能
// @indexs 1
// @version 1.2.0

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

module.exports = { home, category, detail, search, play };
runner.run(module.exports);

// ==================== 首页 ====================
async function home() {
    const classes = CATEGORIES.map(cat => ({
        type_id: cat.id,
        type_name: cat.name,
    }));

    // 首页优先展示追更内容（如果用户有收藏的话）
    let list = [];
    try {
        const following = await fetchFollowing();
        if (following.length > 0) {
            list = following.map(item => mapFollowingToVod(item));
        }
    } catch (_) {}

    // 追更为空则展示电影热门
    if (list.length === 0) {
        const movies = await fetchCategoryContent("movie", 1);
        list = movies.map(item => mapToVod(item, "movie"));
    }

    return { class: classes, list };
}

// ==================== 分类列表 ====================
async function category(params) {
    const page = parseInt(params?.page || 1, 10) || 1;
    const categoryId = String(params?.categoryId || "movie");

    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat) {
        return { page: 1, pagecount: 0, total: 0, list: [] };
    }

    // 追更分类单独处理
    if (cat.type === "following") {
        const following = await fetchFollowing();
        const list = following.map(item => mapFollowingToVod(item));
        return {
            page: 1,
            pagecount: 1,
            total: list.length,
            list,
        };
    }

    const items = await fetchCategoryContent(cat.type, page);
    const mediaType = cat.type === "tv" || cat.type === "variety" || cat.type === "animation" ? "tv" : "movie";
    const list = items.map(item => mapToVod(item, mediaType));

    return {
        page,
        pagecount: list.length < PAGE_SIZE ? page : page + 1,
        total: (page - 1) * PAGE_SIZE + list.length,
        list,
    };
}

// ==================== 追更功能 ====================
async function fetchFollowing() {
    // 读取用户收藏列表
    let favorites = [];
    try {
        favorites = await OmniBox.getFavorites();
    } catch (_) {
        return [];
    }

    if (!Array.isArray(favorites) || favorites.length === 0) {
        return [];
    }

    // 只处理电视剧和动漫（有追更意义的），电影跳过
    const results = [];
    for (const fav of favorites) {
        const vodId = String(fav.vod_id || fav.vodId || "");
        const parts = vodId.split("|");

        // 只处理 tmdb 格式的收藏（tv|12345）
        if (parts.length < 2) continue;
        const mediaType = parts[0];
        const tmdbId = parts[1];

        if (mediaType !== "tv" || !tmdbId) continue;

        try {
            const detail = await tmdbGet(`/tv/${tmdbId}`, { language: "zh-CN" });

            const lastEpisode = detail.last_episode_to_air;
            const nextEpisode = detail.next_episode_to_air;
            const totalEpisodes = detail.number_of_episodes || 0;
            const totalSeasons = detail.number_of_seasons || 0;

            let statusText = "";
            if (nextEpisode && nextEpisode.air_date) {
                const nextDate = new Date(nextEpisode.air_date);
                const month = nextDate.getMonth() + 1;
                const day = nextDate.getDate();
                statusText = `第${nextEpisode.episode_number}集 ${month}月${day}日更新`;
            } else if (lastEpisode && totalEpisodes > 0) {
                statusText = `已完结 ${lastEpisode.episode_number}/${totalEpisodes}集`;
            } else if (lastEpisode) {
                statusText = `已播${lastEpisode.episode_number}集/共${totalEpisodes || "?"}集`;
            } else if (detail.status === "Ended") {
                statusText = `已完结 ${totalEpisodes}集`;
            } else {
                statusText = detail.status === "Returning Series" ? "连载中" : "";
            }

            results.push({
                vod_id: vodId,
                vod_name: detail.name || "",
                vod_pic: detail.poster_path ? TMDB_IMAGE_BASE + detail.poster_path : "",
                vod_remarks: statusText,
                vod_douban_score: detail.vote_average ? detail.vote_average.toFixed(1) : "",
                vod_year: (detail.first_air_date || "").substring(0, 4),
                vod_content: detail.overview || "",
                status: detail.status,
                last_episode: lastEpisode,
                next_episode: nextEpisode,
                total_episodes: totalEpisodes,
                total_seasons: totalSeasons,
            });
        } catch (_) {
            // 单个查询失败不影响其他
            continue;
        }
    }

    // 排序：有下一集更新日期的排前面，越临近越靠前
    results.sort((a, b) => {
        const aDate = a.next_episode?.air_date || "9999-12-31";
        const bDate = b.next_episode?.air_date || "9999-12-31";
        return aDate.localeCompare(bDate);
    });

    return results;
}

function mapFollowingToVod(item) {
    // 构建更丰富的 remarks
    let remarks = item.vod_remarks || "";

    // 如果有下一集信息，额外展示集数范围
    if (item.last_episode && item.next_episode) {
        remarks = `已播${item.last_episode.episode_number}/${item.total_episodes || "?"}集 ${remarks}`;
    }

    return {
        vod_id: item.vod_id,
        vod_name: item.vod_name,
        vod_pic: item.vod_pic,
        vod_year: item.vod_year,
        vod_remarks: remarks,
        vod_douban_score: item.vod_douban_score,
        type_name: "追更",
        vod_content: item.vod_content,
    };
}

// ==================== 内容获取策略 ====================
async function fetchCategoryContent(categoryType, page) {
    switch (categoryType) {
        case "movie":
            return await fetchChineseHotMovies(page);
        case "tv":
            return await fetchChineseHotTV(page);
        case "variety":
            return await fetchChineseVariety(page);
        case "animation":
            return await fetchHotAnimation(page);
        case "documentary":
            return await fetchChineseDocumentary(page);
        default:
            return [];
    }
}

async function fetchChineseHotMovies(page) {
    const zhMovies = await tmdbGet("/discover/movie", {
        language: "zh-CN",
        page,
        sort_by: "popularity.desc",
        with_original_language: "zh",
        "vote_count.gte": 50,
        region: "CN",
    });

    let results = zhMovies?.results || [];

    if (results.length < PAGE_SIZE) {
        const globalMovies = await tmdbGet("/discover/movie", {
            language: "zh-CN",
            page,
            sort_by: "vote_average.desc",
            "vote_count.gte": 500,
            "vote_average.gte": 7,
        });
        const globalResults = (globalMovies?.results || []).filter(
            item => !results.find(r => r.id === item.id)
        );
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }

    return results;
}

async function fetchChineseHotTV(page) {
    const zhTV = await tmdbGet("/discover/tv", {
        language: "zh-CN",
        page,
        sort_by: "popularity.desc",
        with_original_language: "zh",
        "vote_count.gte": 20,
    });

    let results = zhTV?.results || [];

    if (results.length < PAGE_SIZE) {
        const globalTV = await tmdbGet("/discover/tv", {
            language: "zh-CN",
            page,
            sort_by: "popularity.desc",
            "vote_count.gte": 200,
            "vote_average.gte": 7.5,
            without_genres: "10763,10767",
        });
        const globalResults = (globalTV?.results || []).filter(
            item => !results.find(r => r.id === item.id)
        );
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }

    return results;
}

async function fetchChineseVariety(page) {
    const variety = await tmdbGet("/discover/tv", {
        language: "zh-CN",
        page,
        sort_by: "popularity.desc",
        with_genres: "10764,10767",
        with_original_language: "zh",
        "vote_count.gte": 5,
    });

    let results = variety?.results || [];

    if (results.length < PAGE_SIZE) {
        const globalVariety = await tmdbGet("/discover/tv", {
            language: "zh-CN",
            page,
            sort_by: "popularity.desc",
            with_genres: "10764,10767",
            "vote_count.gte": 50,
        });
        const globalResults = (globalVariety?.results || []).filter(
            item => !results.find(r => r.id === item.id)
        );
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }

    return results;
}

async function fetchHotAnimation(page) {
    const anime = await tmdbGet("/discover/tv", {
        language: "zh-CN",
        page,
        sort_by: "popularity.desc",
        with_genres: "16",
        "vote_count.gte": 20,
    });

    let results = anime?.results || [];

    if (results.length < PAGE_SIZE) {
        const cnAnime = await tmdbGet("/discover/tv", {
            language: "zh-CN",
            page: 1,
            sort_by: "popularity.desc",
            with_genres: "16",
            with_original_language: "zh",
            "vote_count.gte": 5,
        });
        const cnResults = (cnAnime?.results || []).filter(
            item => !results.find(r => r.id === item.id)
        );
        results = [...results, ...cnResults].slice(0, PAGE_SIZE);
    }

    return results;
}

async function fetchChineseDocumentary(page) {
    const zhDoc = await tmdbGet("/discover/movie", {
        language: "zh-CN",
        page,
        sort_by: "popularity.desc",
        with_genres: "99",
        with_original_language: "zh",
        "vote_count.gte": 5,
    });

    let results = zhDoc?.results || [];

    if (results.length < PAGE_SIZE) {
        const globalDoc = await tmdbGet("/discover/movie", {
            language: "zh-CN",
            page,
            sort_by: "vote_average.desc",
            with_genres: "99",
            "vote_count.gte": 100,
            "vote_average.gte": 8,
        });
        const globalResults = (globalDoc?.results || []).filter(
            item => !results.find(r => r.id === item.id)
        );
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }

    return results;
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
    if (!detailData || detailData.success === false) {
        return { list: [] };
    }

    // 追更信息
    let followingInfo = "";
    if (mediaType === "tv") {
        const nextEp = detailData.next_episode_to_air;
        const lastEp = detailData.last_episode_to_air;
        const totalEps = detailData.number_of_episodes || 0;

        if (nextEp) {
            const d = new Date(nextEp.air_date);
            followingInfo = `下一集：第${nextEp.episode_number}集 ${d.getMonth() + 1}月${d.getDate()}日更新`;
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

    return {
        page,
        pagecount: Math.ceil(total / PAGE_SIZE),
        total,
        list,
    };
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

    if (!searchKeyword) {
        return { url: "", message: "无法获取影片标题" };
    }

    if (mediaType === "tv" && episodeInfo) {
        const match = episodeInfo.match(/S(\d+)E(\d+)/);
        if (match) {
            searchKeyword += ` 第${parseInt(match[1])}季 第${parseInt(match[2])}集`;
        }
    }

    return {
        url: `search://${encodeURIComponent(searchKeyword)}`,
        parse: 1,
    };
}

// ==================== 工具函数 ====================
function mapToVod(item, mediaType) {
    const title = item.title || item.name || "";
    const date = item.release_date || item.first_air_date || "";
    const year = date.substring(0, 4);

    return {
        vod_id: `${mediaType}|${item.id}`,
        vod_name: title,
        vod_pic: item.poster_path ? TMDB_IMAGE_BASE + item.poster_path : "",
        vod_year: year,
        vod_remarks: item.vote_average ? `⭐${item.vote_average.toFixed(1)}` : "",
        vod_douban_score: item.vote_average ? item.vote_average.toFixed(1) : "",
        type_name: mediaType === "movie" ? "电影" : "电视剧",
        vod_content: item.overview || "",
    };
}

async function tmdbGet(endpoint, params = {}) {
    const url = new URL(TMDB_API_BASE + endpoint);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    });

    const headers = {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
    };

    if (TMDB_BEARER) {
        headers.Authorization = `Bearer ${TMDB_BEARER}`;
    } else if (TMDB_API_KEY) {
        url.searchParams.set("api_key", TMDB_API_KEY);
    } else {
        throw new Error("请设置 TMDB 环境变量：TMDB_BEARER_TOKEN 或 TMDB_API_KEY");
    }

    const res = await OmniBox.request(url.toString(), {
        method: "GET",
        timeout: 15000,
        headers,
    });

    if (res.statusCode !== 200 || !res.body) {
        throw new Error(`TMDB 请求失败: HTTP ${res.statusCode}`);
    }

    const text = typeof res.body === "string" ? res.body : String(res.body);
    return JSON.parse(text);
}
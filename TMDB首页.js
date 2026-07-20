// @name TMDB简约导航
// @author 定制版
// @description 基于 TMDB 的大类导航源，国内优先 + 平台筛选 + 排序筛选 + 追更
// @indexs 1
// @version 2.0.0

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
    { id: "197", name: "腾讯视频" },
    { id: "189", name: "爱奇艺" },
    { id: "192", name: "优酷" },
    { id: "196", name: "芒果TV" },
    { id: "190", name: "B站" },
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

    // 构建筛选器
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

    // 首页内容：追更优先，否则电影
    let list = [];
    try {
        const following = await fetchFollowing();
        if (following.length > 0) {
            list = following.map(item => mapFollowingToVod(item));
        }
    } catch (_) {}

    if (list.length === 0) {
        const movies = await fetchCategoryContent("movie", 1, "", "popularity.desc");
        list = movies.map(item => mapToVod(item, "movie"));
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

    // 追更单独处理
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

    // 如果选了平台，优先用 provider 筛选
    if (providerId) {
        results = await fetchByProvider(categoryType, page, providerId, sortBy);
        // 不够一页，用国内热门兜底
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

// 按平台筛选
async function fetchByProvider(categoryType, page, providerId, sortBy) {
    const mediaType = (categoryType === "tv" || categoryType === "variety" || categoryType === "animation") ? "tv" : "movie";
    const endpoint = `/discover/${mediaType}`;

    const params = {
        language: "zh-CN",
        page,
        sort_by: sortBy || "popularity.desc",
        with_watch_providers: providerId,
        watch_region: "CN",
    };

    // 各分类的额外筛选
    const extraParams = getCategoryParams(categoryType);
    Object.assign(params, extraParams);

    const res = await tmdbGet(endpoint, params);
    return res?.results || [];
}

// 默认策略（国内优先）
async function fetchDefault(categoryType, page, sortBy) {
    switch (categoryType) {
        case "movie":
            return await fetchMainstreamChineseMovies(page, sortBy);
        case "tv":
            return await fetchMainstreamChineseTV(page, sortBy);
        case "variety":
            return await fetchChineseVariety(page, sortBy);
        case "animation":
            return await fetchHotAnimation(page, sortBy);
        case "documentary":
            return await fetchChineseDocumentary(page, sortBy);
        default:
            return [];
    }
}

function getCategoryParams(categoryType) {
    switch (categoryType) {
        case "variety":
            return { with_genres: "10764,10767" };
        case "animation":
            return { with_genres: "16" };
        case "documentary":
            return { with_genres: "99" };
        default:
            return {};
    }
}

// 电影：华语优先 + 国际兜底
async function fetchMainstreamChineseMovies(page, sortBy) {
    let results = [];

    const zhMovies = await tmdbGet("/discover/movie", {
        language: "zh-CN",
        page,
        sort_by: sortBy || "popularity.desc",
        with_original_language: "zh",
        "vote_count.gte": sortBy === "vote_average.desc" ? 20 : 100,
    });
    results = zhMovies?.results || [];

    if (results.length < PAGE_SIZE) {
        const globalMovies = await tmdbGet("/discover/movie", {
            language: "zh-CN",
            page: 1,
            sort_by: sortBy || "popularity.desc",
            "vote_count.gte": sortBy === "vote_average.desc" ? 200 : 1000,
            "vote_average.gte": sortBy === "vote_average.desc" ? 7 : 0,
        });
        const existingIds = new Set(results.map(r => r.id));
        const globalResults = (globalMovies?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }

    return results;
}

// 电视剧：国产优先 + 韩日美兜底
async function fetchMainstreamChineseTV(page, sortBy) {
    let results = [];

    const zhTV = await tmdbGet("/discover/tv", {
        language: "zh-CN",
        page,
        sort_by: sortBy || "popularity.desc",
        with_original_language: "zh",
        "vote_count.gte": sortBy === "vote_average.desc" ? 5 : 20,
        without_genres: "10763,10767,10762",
    });
    results = zhTV?.results || [];

    if (results.length < PAGE_SIZE) {
        const globalTV = await tmdbGet("/discover/tv", {
            language: "zh-CN",
            page: 1,
            sort_by: sortBy || "popularity.desc",
            "vote_count.gte": sortBy === "vote_average.desc" ? 100 : 300,
            "vote_average.gte": sortBy === "vote_average.desc" ? 7.5 : 0,
            without_genres: "10763,10767,10762",
        });
        const existingIds = new Set(results.map(r => r.id));
        const globalResults = (globalTV?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }

    return results;
}

// 综艺：国内真人秀优先
async function fetchChineseVariety(page, sortBy) {
    let results = [];

    const zhVariety = await tmdbGet("/discover/tv", {
        language: "zh-CN",
        page,
        sort_by: sortBy || "popularity.desc",
        with_genres: "10764,10767",
        with_original_language: "zh",
        "vote_count.gte": 3,
    });
    results = zhVariety?.results || [];

    if (results.length < PAGE_SIZE) {
        const globalVariety = await tmdbGet("/discover/tv", {
            language: "zh-CN",
            page: 1,
            sort_by: sortBy || "popularity.desc",
            with_genres: "10764,10767",
            "vote_count.gte": sortBy === "vote_average.desc" ? 20 : 30,
        });
        const existingIds = new Set(results.map(r => r.id));
        const globalResults = (globalVariety?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }

    return results;
}

// 动漫：国漫优先 + 日漫补充
async function fetchHotAnimation(page, sortBy) {
    let results = [];

    // 先拉国漫
    const cnAnime = await tmdbGet("/discover/tv", {
        language: "zh-CN",
        page,
        sort_by: sortBy || "popularity.desc",
        with_genres: "16",
        with_original_language: "zh",
        "vote_count.gte": 3,
    });
    results = cnAnime?.results || [];

    // 不够补日漫
    if (results.length < PAGE_SIZE) {
        const jpAnime = await tmdbGet("/discover/tv", {
            language: "zh-CN",
            page: 1,
            sort_by: sortBy || "popularity.desc",
            with_genres: "16",
            with_original_language: "ja",
            "vote_count.gte": sortBy === "vote_average.desc" ? 10 : 30,
        });
        const existingIds = new Set(results.map(r => r.id));
        const jpResults = (jpAnime?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...jpResults].slice(0, PAGE_SIZE);
    }

    // 还不够补全球
    if (results.length < PAGE_SIZE) {
        const globalAnime = await tmdbGet("/discover/tv", {
            language: "zh-CN",
            page: 1,
            sort_by: sortBy || "popularity.desc",
            with_genres: "16",
            "vote_count.gte": sortBy === "vote_average.desc" ? 50 : 100,
        });
        const existingIds = new Set(results.map(r => r.id));
        const globalResults = (globalAnime?.results || []).filter(item => !existingIds.has(item.id));
        results = [...results, ...globalResults].slice(0, PAGE_SIZE);
    }

    return results;
}

// 纪录片：国产优先 + 国际高分
async function fetchChineseDocumentary(page, sortBy) {
    let results = [];

    const zhDoc = await tmdbGet("/discover/movie", {
        language: "zh-CN",
        page,
        sort_by: sortBy || "popularity.desc",
        with_genres: "99",
        with_original_language: "zh",
        "vote_count.gte": 3,
    });
    results = zhDoc?.results || [];

    if (results.length < PAGE_SIZE) {
        const globalDoc = await tmdbGet("/discover/movie", {
            language: "zh-CN",
            page: 1,
            sort_by: sortBy || "popularity.desc",
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

// ==================== 追更功能 ====================
async function fetchFollowing() {
    let favorites = [];
    try {
        favorites = await OmniBox.getFavorites();
    } catch (_) {
        return [];
    }

    if (!Array.isArray(favorites) || favorites.length === 0) {
        return [];
    }

    const results = [];
    for (const fav of favorites) {
        const vodId = String(fav.vod_id || fav.vodId || "");
        const parts = vodId.split("|");

        if (parts.length < 2) continue;
        const mediaType = parts[0];
        const tmdbId = parts[1];

        if (mediaType !== "tv" || !tmdbId) continue;

        try {
            const detail = await tmdbGet(`/tv/${tmdbId}`, { language: "zh-CN" });

            const lastEpisode = detail.last_episode_to_air;
            const nextEpisode = detail.next_episode_to_air;
            const totalEpisodes = detail.number_of_episodes || 0;

            // 计算集数信息
            let episodeInfo = "";
            let nextDateInfo = "";

            if (nextEpisode && nextEpisode.air_date) {
                const nextDate = new Date(nextEpisode.air_date);
                const today = new Date();
                const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));

                if (diffDays <= 0) {
                    episodeInfo = `第${nextEpisode.episode_number}集 今天更新`;
                } else if (diffDays === 1) {
                    episodeInfo = `第${nextEpisode.episode_number}集 明天更新`;
                } else if (diffDays <= 7) {
                    const weekday = WEEKDAYS[nextDate.getDay()];
                    episodeInfo = `第${nextEpisode.episode_number}集 ${weekday}更新`;
                } else {
                    const month = nextDate.getMonth() + 1;
                    const day = nextDate.getDate();
                    episodeInfo = `第${nextEpisode.episode_number}集 ${month}月${day}日更新`;
                }
                nextDateInfo = episodeInfo;
            }

            // 集数进度
            if (lastEpisode && totalEpisodes > 0) {
                if (detail.status === "Ended") {
                    episodeInfo = `全${totalEpisodes}集`;
                } else if (!nextDateInfo) {
                    episodeInfo = `已播${lastEpisode.episode_number}/${totalEpisodes}集`;
                } else {
                    episodeInfo = `已播${lastEpisode.episode_number}/${totalEpisodes}集`;
                }
            } else if (lastEpisode) {
                episodeInfo = detail.status === "Ended" ? `全${totalEpisodes || lastEpisode.episode_number}集` : `已播${lastEpisode.episode_number}集`;
            } else {
                episodeInfo = detail.status === "Returning Series" ? "连载中" : detail.status === "Ended" ? "已完结" : "";
            }

            results.push({
                vod_id: vodId,
                vod_name: detail.name || "",
                vod_pic: detail.poster_path ? TMDB_IMAGE_BASE + detail.poster_path : "",
                vod_remarks: detail.vote_average ? `⭐${detail.vote_average.toFixed(1)}` : "",
                vod_year: (detail.first_air_date || "").substring(0, 4),
                vod_content: detail.overview || "",
                episodeInfo,
                nextDateInfo,
                last_episode: lastEpisode,
                next_episode: nextEpisode,
                total_episodes: totalEpisodes,
            });
        } catch (_) {
            continue;
        }
    }

    // 排序：有更新日期的在前
    results.sort((a, b) => {
        const aDate = a.next_episode?.air_date || "9999-12-31";
        const bDate = b.next_episode?.air_date || "9999-12-31";
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        // 同日期按热度排
        return 0;
    });

    return results;
}

function mapFollowingToVod(item) {
    return {
        vod_id: item.vod_id,
        vod_name: item.vod_name,
        vod_pic: item.vod_pic,
        vod_year: item.vod_year,
        vod_remarks: item.vod_remarks,
        vod_douban_score: item.nextDateInfo || item.episodeInfo,
        type_name: "追更",
        vod_content: item.vod_content,
    };
}

// ==================== 列表项映射 ====================
function mapToVod(item, mediaType) {
    const title = item.title || item.name || "";
    const date = item.release_date || item.first_air_date || "";
    const year = date.substring(0, 4);
    const score = item.vote_average ? item.vote_average.toFixed(1) : "";

    // 右上角：评分
    const remarks = score ? `⭐${score}` : "";

    // 左下角：电影/纪录片显示年份，其他显示集数
    let doubanScore = "";
    if (mediaType === "movie") {
        doubanScore = year || score;
    } else {
        // 电视剧/综艺/动漫：尝试获取集数信息
        // 列表接口不返回集数，用 item 的已知字段
        if (item.number_of_episodes) {
            doubanScore = `${item.number_of_episodes}集`;
        } else if (year) {
            doubanScore = year;
        } else {
            doubanScore = score;
        }
    }

    return {
        vod_id: `${mediaType}|${item.id}`,
        vod_name: title,
        vod_pic: item.poster_path ? TMDB_IMAGE_BASE + item.poster_path : "",
        vod_year: year,
        vod_remarks: remarks,
        vod_douban_score: doubanScore,
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
    if (!detailData || detailData.success === false) {
        return { list: [] };
    }

    // 追更信息
    let followingInfo = "";
    if (mediaType === "tv") {
        const nextEp = detailData.next_episode_to_air;
        const lastEp = detailData.last_episode_to_air;
        const totalEps = detailData.number_of_episodes || 0;

        if (nextEp && nextEp.air_date) {
            const nextDate = new Date(nextEp.air_date);
            const today = new Date();
            const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) {
                followingInfo = `下一集：第${nextEp.episode_number}集 今天更新`;
            } else if (diffDays === 1) {
                followingInfo = `下一集：第${nextEp.episode_number}集 明天更新`;
            } else if (diffDays <= 7) {
                followingInfo = `下一集：第${nextEp.episode_number}集 ${WEEKDAYS[nextDate.getDay()]}更新`;
            } else {
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

    if (!searchKeyword) {
        return { url: "", message: "无法获取影片标题" };
    }

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
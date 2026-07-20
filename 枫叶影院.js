// @name 枫叶影院
// @author 转换版
// @description 枫叶影院 maihaolian.com 全功能源
// @indexs 1
// @version 1.0.0

const OmniBox = require("omnibox_sdk");
const runner = require("spider_runner");
const cheerio = require("cheerio");

const HOST = "https://maihaolian.com";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

const HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
};

module.exports = { home, category, detail, search, play };
runner.run(module.exports);

// ==================== 首页 ====================
async function home() {
    const classes = [
        { type_id: "/label/qq", type_name: "腾讯VIP精选" },
        { type_id: "/label/bli", type_name: "B站VIP精选" },
        { type_id: "/label/youku", type_name: "优酷VIP精选" },
        { type_id: "5", type_name: "红果短剧" },
        { type_id: "2", type_name: "电视剧" },
        { type_id: "1", type_name: "电影" },
        { type_id: "4", type_name: "动漫" },
        { type_id: "3", type_name: "综艺" },
    ];

    const filters = buildFilters();

    const html = await fetchPage("/");
    const list = parseVideoList(html);

    return { class: classes, filters, list };
}

// ==================== 分类 ====================
async function category(params) {
    const tid = String(params?.categoryId || "1");
    const page = parseInt(params?.page || 1, 10) || 1;
    const extend = params?.filters || {};

    // VIP标签分类
    if (tid.startsWith("/label")) {
        const url = `${tid}/page/${page}.html`;
        const html = await fetchPage(url);
        const items = parseVideoList(html);
        return {
            page,
            pagecount: items.length < 24 ? page : page + 2,
            total: 9999,
            list: items,
        };
    }

    // 普通分类
    const args = {};
    if (extend && typeof extend === "object") {
        for (const [k, v] of Object.entries(extend)) {
            if (v) args[k] = String(v);
        }
    }

    const routeTid = args.class || args.tid || tid;
    const area = args.area || "";
    const genre = args.genre || "";
    const year = args.year || "";
    const lang = args.lang || "";
    const letter = args.letter || "";
    const sort = args.sort || "";

    let html, items;
    let pagecount = page;
    let total = 9999;

    if (!area && !genre && !year && !lang && !letter && !sort) {
        // 无筛选，正常分页
        const url = `/cupfox-list/${routeTid}--------${page}---.html`;
        html = await fetchPage(url);
        items = parseVideoList(html);

        const $ = cheerio.load(html);
        $("a.page-link").each((_, el) => {
            if ($(el).text() === "尾页") {
                const href = $(el).attr("href") || "";
                const m = href.match(/---(\d+)---/);
                if (m) pagecount = parseInt(m[1], 10);
            }
        });
        if (items.length === 0) pagecount = 0;
        total = pagecount * 36;
    } else {
        // 有筛选
        const segs = [routeTid, area, sort, genre, lang, letter, "", "", year];
        const url = "/cupfox-list/" + segs.join("-") + ".html";
        html = await fetchPage(url);
        items = parseVideoList(html);
        pagecount = 1;
        total = 9999;
    }

    return { page, pagecount, total, limit: 36, list: items };
}

// ==================== 详情 ====================
async function detail(params) {
    const vid = String(params?.vod_id || "").split(",")[0].trim();
    if (!vid) return { list: [] };

    try {
        const html = await fetchPage(`/detail/${vid}.html`);
        if (!html) return { list: [] };

        const $ = cheerio.load(html);

        const vod_name = ($("h3.slide-info-title").text() || "").trim();
        const vod_pic = fixPic($("img.lazy").attr("data-src") || "");

        let vod_director = "";
        let vod_actor = "";
        $(".slide-info").each((_, el) => {
            const text = $(el).text().trim();
            if (text.startsWith("导演：")) vod_director = text.replace("导演：", "").trim();
            else if (text.startsWith("演员：")) vod_actor = text.replace("演员：", "").trim();
        });

        const vod_content = ($("#height_limit").text() || "").trim();

        const playFrom = [];
        $(".anthology-tab a.swiper-slide").each((_, el) => {
            const name = ($(el).text() || "").trim();
            if (name) playFrom.push(name);
        });

        const playUrls = [];
        $(".anthology-list-box").each((i, block) => {
            const epList = [];
            $(block).find("li a").each((_, a) => {
                const href = $(a).attr("href") || "";
                const m = href.match(/\/play\/(.*?)\.html/);
                if (m) {
                    epList.push(`${$(a).text().trim()}$${vid}-${m[1]}`);
                }
            });
            epList.reverse();
            if (epList.length > 0 && i < playFrom.length) {
                playUrls.push(epList.join("#"));
            }
        });

        const validFrom = playFrom.filter((_, i) => i < playUrls.length);

        return {
            list: [{
                vod_id: vid,
                vod_name,
                vod_pic,
                vod_director,
                vod_actor,
                vod_content,
                vod_play_from: validFrom.join("$$$"),
                vod_play_url: playUrls.join("$$$"),
            }],
        };
    } catch (_) {
        return { list: [] };
    }
}

// ==================== 搜索 ====================
async function search(params) {
    const keyword = String(params?.keyword || "").trim();
    const page = parseInt(params?.page || 1, 10) || 1;
    if (!keyword) return { page: 1, pagecount: 0, total: 0, list: [] };

    const encoded = encodeURIComponent(keyword);
    const html = await fetchPage(`/cupfox-search/${encoded}----------${page}---.html`);
    const items = parseSearchList(html);

    return { page, pagecount: 1, total: items.length, list: items };
}

// ==================== 播放 ====================
async function play(params) {
    const id = String(params?.playId || "");
    if (!id) return { parse: 1, url: "" };

    // 如果已经是完整URL
    if (id.startsWith("http")) {
        if (id.endsWith(".m3u8") || id.endsWith(".mp4")) {
            return { parse: 0, url: id, header: { "User-Agent": UA } };
        }
        return { parse: 1, url: id };
    }

    try {
        const url = `${HOST}/play/${id}.html`;
        const html = await fetchPage(url);
        if (!html) return { parse: 1, url };

        const match = html.match(/player_aaaa=(.*?)<\/script>/s);
        if (!match) return { parse: 1, url };

        let pd;
        try {
            pd = JSON.parse(match[1]);
        } catch (_) {
            return { parse: 1, url };
        }

        let playUrl = pd.url || "";
        const playId = pd.from || "";

        const apiMap = {
            "YYNB": "https://zzrs.mfdyvip.com/player/mplayer.php",
            "JD4K": "https://fgsrg.hzqingshan.com/player/mplayer.php",
        };

        if (!playUrl) {
            return { parse: 0, url: "https://php.doube.eu.org/error.m3u8", header: { "User-Agent": UA } };
        }

        // 直链
        if (playUrl.startsWith("http") && (playUrl.endsWith(".m3u8") || playUrl.endsWith(".mp4"))) {
            return { parse: 0, url: playUrl, header: { "User-Agent": UA } };
        }

        // 需要解析
        if (apiMap[playId]) {
            const tokenHtml = await fetchRaw(`https://fgsrg.hzqingshan.com/player/?url=${encodeURIComponent(playUrl)}`);
            const tokenMatch = tokenHtml.match(/data-te="(.*?)"/);
            if (tokenMatch) {
                const token = tokenMatch[1];
                const payload = `url=${encodeURIComponent(playUrl)}&token=${encodeURIComponent(token)}`;
                const apiUrl = apiMap[playId];

                const res = await OmniBox.request(apiUrl, {
                    method: "POST",
                    timeout: 15000,
                    headers: {
                        "User-Agent": UA,
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Referer": "https://www.ht10010.com/",
                    },
                    body: payload,
                });

                if (res.statusCode === 200 && res.body) {
                    const text = typeof res.body === "string" ? res.body : String(res.body);
                    try {
                        const result = JSON.parse(text);
                        if (result.code === 200 && result.url) {
                            return { parse: 0, url: result.url, header: { "User-Agent": UA } };
                        }
                    } catch (_) {}
                }
            }
        }

        return { parse: 1, url };
    } catch (_) {
        return { parse: 1, url: "" };
    }
}

// ==================== 筛选配置 ====================
function buildFilters() {
    const area = [
        { n: "全部", v: "" }, { n: "大陆", v: "大陆" }, { n: "香港", v: "香港" },
        { n: "台湾", v: "台湾" }, { n: "美国", v: "美国" }, { n: "韩国", v: "韩国" },
        { n: "日本", v: "日本" }, { n: "泰国", v: "泰国" }, { n: "新加坡", v: "新加坡" },
        { n: "马来西亚", v: "马来西亚" }, { n: "印度", v: "印度" }, { n: "英国", v: "英国" },
        { n: "法国", v: "法国" }, { n: "加拿大", v: "加拿大" }, { n: "西班牙", v: "西班牙" },
        { n: "俄罗斯", v: "俄罗斯" }, { n: "其它", v: "其它" },
    ];
    const year = [
        { n: "全部", v: "" }, { n: "2026", v: "2026" }, { n: "2025", v: "2025" },
        { n: "2024", v: "2024" }, { n: "2023", v: "2023" }, { n: "2022", v: "2022" },
        { n: "2021", v: "2021" }, { n: "2020", v: "2020" }, { n: "2019", v: "2019" },
        { n: "2018", v: "2018" }, { n: "2017", v: "2017" }, { n: "2016", v: "2016" },
        { n: "2015", v: "2015" }, { n: "2014", v: "2014" }, { n: "2013", v: "2013" },
        { n: "2012", v: "2012" }, { n: "2011", v: "2011" }, { n: "2010", v: "2010" },
        { n: "2009", v: "2009" }, { n: "2008", v: "2008" }, { n: "2007", v: "2007" },
        { n: "2006", v: "2006" }, { n: "2005", v: "2005" }, { n: "2004", v: "2004" },
    ];
    const lang = [
        { n: "全部", v: "" }, { n: "国语", v: "国语" }, { n: "英语", v: "英语" },
        { n: "粤语", v: "粤语" }, { n: "闽南语", v: "闽南语" }, { n: "韩语", v: "韩语" },
        { n: "日语", v: "日语" }, { n: "法语", v: "法语" }, { n: "德语", v: "德语" },
        { n: "其它", v: "其它" },
    ];
    const sort = [{ n: "时间", v: "time" }, { n: "人气", v: "hits" }, { n: "评分", v: "score" }];
    const letter = [
        { n: "全部", v: "" }, { n: "A", v: "A" }, { n: "B", v: "B" }, { n: "C", v: "C" },
        { n: "D", v: "D" }, { n: "E", v: "E" }, { n: "F", v: "F" }, { n: "G", v: "G" },
        { n: "H", v: "H" }, { n: "I", v: "I" }, { n: "J", v: "J" }, { n: "K", v: "K" },
        { n: "L", v: "L" }, { n: "M", v: "M" }, { n: "N", v: "N" }, { n: "O", v: "O" },
        { n: "P", v: "P" }, { n: "Q", v: "Q" }, { n: "R", v: "R" }, { n: "S", v: "S" },
        { n: "T", v: "T" }, { n: "U", v: "U" }, { n: "V", v: "V" }, { n: "W", v: "W" },
        { n: "X", v: "X" }, { n: "Y", v: "Y" }, { n: "Z", v: "Z" }, { n: "0-9", v: "0-9" },
    ];

    const tvGenres = [
        ["全部", ""], ["古装", "古装"], ["战争", "战争"], ["青春偶像", "青春偶像"],
        ["喜剧", "喜剧"], ["家庭", "家庭"], ["犯罪", "犯罪"], ["动作", "动作"],
        ["奇幻", "奇幻"], ["剧情", "剧情"], ["历史", "历史"], ["经典", "经典"],
        ["乡村", "乡村"], ["情景", "情景"], ["商战", "商战"], ["网剧", "网剧"], ["其他", "其他"],
    ];
    const movieGenres = [
        ["全部", ""], ["喜剧", "喜剧"], ["爱情", "爱情"], ["恐怖", "恐怖"],
        ["动作", "动作"], ["科幻", "科幻"], ["剧情", "剧情"], ["战争", "战争"],
        ["警匪", "警匪"], ["犯罪", "犯罪"], ["动画", "动画"], ["奇幻", "奇幻"],
        ["武侠", "武侠"], ["冒险", "冒险"], ["枪战", "枪战"], ["悬疑", "悬疑"],
        ["惊悚", "惊悚"], ["经典", "经典"], ["青春", "青春"], ["文艺", "文艺"],
        ["微电影", "微电影"], ["古装", "古装"], ["历史", "历史"], ["运动", "运动"],
        ["农村", "农村"], ["儿童", "儿童"], ["网络电影", "网络电影"],
    ];
    const animeGenres = [
        ["全部", ""], ["情感", "情感"], ["科幻", "科幻"], ["热血", "热血"],
        ["推理", "推理"], ["搞笑", "搞笑"], ["冒险", "冒险"], ["奇幻", "奇幻"],
        ["战斗", "战斗"], ["校园", "校园"], ["萝莉", "萝莉"], ["治愈", "治愈"],
        ["原创", "原创"], ["亲子", "亲子"], ["益智", "益智"], ["励志", "励志"], ["其他", "其他"],
    ];
    const varietyGenres = [
        ["全部", ""], ["选秀", "选秀"], ["情感", "情感"], ["访谈", "访谈"],
        ["播报", "播报"], ["音乐", "音乐"], ["美食", "美食"], ["旅游", "旅游"],
        ["搞笑", "搞笑"], ["游戏", "游戏"], ["亲子", "亲子"], ["其它", "其它"],
    ];

    return {
        "2": [
            { key: "class", name: "类型", value: [{ n: "全部", v: "2" }, { n: "国产剧", v: "13" }, { n: "日韩剧", v: "15" }, { n: "海外剧", v: "16" }] },
            { key: "area", name: "地区", value: area },
            { key: "genre", name: "剧情", value: tvGenres.map(([n, v]) => ({ n, v })) },
            { key: "year", name: "年份", value: year },
            { key: "lang", name: "语言", value: lang },
            { key: "letter", name: "字母", value: letter },
            { key: "sort", name: "排序", value: sort },
        ],
        "1": [
            { key: "class", name: "类型", value: [{ n: "全部", v: "1" }, { n: "动作片", v: "6" }, { n: "喜剧片", v: "7" }, { n: "恐怖片", v: "8" }, { n: "科幻片", v: "9" }, { n: "爱情片", v: "10" }, { n: "剧情片", v: "11" }, { n: "战争片", v: "12" }, { n: "纪录片", v: "20" }] },
            { key: "area", name: "地区", value: area },
            { key: "genre", name: "剧情", value: movieGenres.map(([n, v]) => ({ n, v })) },
            { key: "year", name: "年份", value: year },
            { key: "lang", name: "语言", value: lang },
            { key: "letter", name: "字母", value: letter },
            { key: "sort", name: "排序", value: sort },
        ],
        "4": [
            { key: "class", name: "类型", value: [{ n: "全部", v: "4" }, { n: "国产动漫", v: "25" }, { n: "日韩动漫", v: "26" }] },
            { key: "genre", name: "剧情", value: animeGenres.map(([n, v]) => ({ n, v })) },
            { key: "area", name: "地区", value: area.slice(0, 11) },
            { key: "year", name: "年份", value: year },
            { key: "lang", name: "语言", value: lang },
            { key: "letter", name: "字母", value: letter },
            { key: "sort", name: "排序", value: sort },
        ],
        "3": [
            { key: "class", name: "类型", value: [{ n: "全部", v: "3" }, { n: "大陆综艺", v: "21" }, { n: "日韩综艺", v: "22" }] },
            { key: "genre", name: "剧情", value: varietyGenres.map(([n, v]) => ({ n, v })) },
            { key: "area", name: "地区", value: area.slice(0, 11) },
            { key: "year", name: "年份", value: year },
            { key: "lang", name: "语言", value: lang },
            { key: "letter", name: "字母", value: letter },
            { key: "sort", name: "排序", value: sort },
        ],
    };
}

// ==================== 解析工具 ====================
function parseVideoList(html) {
    const videos = [];
    const seen = new Set();
    const $ = cheerio.load(html);

    $("a.public-list-exp").each((_, a) => {
        const href = $(a).attr("href") || "";
        const m = href.match(/\/detail\/(\d+)\.html/);
        if (!m) return;
        const vod_id = m[1];
        if (seen.has(vod_id)) return;
        seen.add(vod_id);

        const spans = [];
        $(a).find("span.public-prt").each((_, s) => spans.push($(s).text()));
        const span = spans.join(",");

        const vod_name = ($(a).attr("title") || $(a).find("img").attr("alt") || "").trim();
        const vod_pic = fixPic($(a).find("img").attr("data-src") || "");
        const remarkEl = $(a).find(".ft2, .public-list-prb").first();
        const vod_remarks = (remarkEl.text() || "").trim();

        videos.push({ vod_id, vod_name, vod_pic, vod_remarks, vod_year: span });
    });

    return videos;
}

function parseSearchList(html) {
    const videos = [];
    const seen = new Set();
    const $ = cheerio.load(html);

    $("a.public-list-exp").each((_, a) => {
        const href = $(a).attr("href") || "";
        const m = href.match(/\/detail\/(\d+)\.html/);
        if (!m) return;
        const vod_id = m[1];
        if (seen.has(vod_id)) return;
        seen.add(vod_id);

        const vod_pic = fixPic($(a).find("img").attr("data-src") || "");
        const titleEl = $(`a.thumb-txt[href="/detail/${vod_id}.html"]`);
        const vod_name = titleEl.length > 0 ? titleEl.text().trim() : ($(a).find("img").attr("alt") || "").trim();
        const remarkEl = $(a).find(".public-list-prb, .ft2").first();
        const vod_remarks = (remarkEl.text() || "").trim();

        videos.push({ vod_id, vod_name, vod_pic, vod_remarks });
    });

    return videos;
}

function fixPic(url) {
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    return url.replace(/&amp;/g, "&");
}

// ==================== 网络请求 ====================
async function fetchPage(path) {
    try {
        const url = path.startsWith("http") ? path : HOST + path;
        const res = await OmniBox.request(url, {
            method: "GET",
            timeout: 15000,
            headers: HEADERS,
        });
        if (res.statusCode !== 200 || !res.body) return "";
        return typeof res.body === "string" ? res.body : String(res.body);
    } catch (_) {
        return "";
    }
}

async function fetchRaw(url) {
    try {
        const res = await OmniBox.request(url, {
            method: "GET",
            timeout: 15000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Referer": "https://www.ht10010.com/",
            },
        });
        if (res.statusCode !== 200 || !res.body) return "";
        return typeof res.body === "string" ? res.body : String(res.body);
    } catch (_) {
        return "";
    }
}
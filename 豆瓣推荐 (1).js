/*
 * 🎬 豆瓣纯净目录 (联动全网搜索版)
 * ==================================================
 * ⚡️ 特色：
 * 1. 纯净无解析：剥离所有网盘解析，化身纯净的数据目录。
 * 2. 联动搜索：点击海报直接唤起 TVBox 全网搜索 (goSearch: true)。
 * 3. 极速响应：移植《全球追更》的 pageCache 与后台静默预热机制。
 * 4. 满载展示：每页 40 个资源，大幅提升浏览体验。
 * ==================================================
 */

const axios = require("axios");
const dayjs = require("dayjs");

// ===================== 豆瓣 API 配置 =====================
const DOUBAN_HOST = "https://frodo.douban.com/api/v2";
const DOUBAN_API_KEY = "0ac44ae016490db2204ce0a042db2916";
const DOUBAN_UA = "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.143 Safari/537.36 MicroMessenger/7.0.9.501 NetType/WIFI MiniProgramEnv/Windows WindowsWechat";
const DOUBAN_REFERER = "https://servicewechat.com/wx2f9b06c1de1ccfca/84/page-frame.html";

// ===================== 日志模块 =====================
let log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`)
};

const init = async (server) => {
  if (log.init) return;
  if (server && server.log) {
    log.info = (...args) => server.log.info(args.join(' '));
    log.error = (...args) => server.log.error(args.join(' '));
    log.warn = (...args) => server.log.warn(args.join(' '));
  }
  log.init = true;
};

// ===================== 豆瓣请求客户端 =====================
const requestDouban = async (url, extraHeaders = {}) => {
  try {
    const separator = url.includes("?") ? "&" : "?";
    const finalUrl = `${url}${separator}apikey=${DOUBAN_API_KEY}`;
    const res = await axios({
      method: 'GET',
      url: finalUrl,
      headers: {
        "User-Agent": DOUBAN_UA,
        "Referer": DOUBAN_REFERER,
        "Host": "frodo.douban.com",
        "Connection": "Keep-Alive",
        ...extraHeaders
      },
      timeout: 10000,
    });
    return res.data;
  } catch (e) {
    log.error(`豆瓣请求失败: ${url}, 原因: ${e.message}`);
    return null;
  }
};

// ===================== 定制的豆瓣多级分类 =====================
const filterConfig = {
  "movie":[
    { "key": "类型", "name": "类型", "init": "", "value":[{ "n": "全部类型", "v": "" }, { "n": "喜剧", "v": "喜剧" }, { "n": "爱情", "v": "爱情" }, { "n": "动作", "v": "动作" }, { "n": "科幻", "v": "科幻" }, { "n": "动画", "v": "动画" }, { "n": "悬疑", "v": "悬疑" }, { "n": "犯罪", "v": "犯罪" }, { "n": "惊悚", "v": "惊悚" }, { "n": "恐怖", "v": "恐怖" }, { "n": "纪录片", "v": "纪录片" }] },
    { "key": "地区", "name": "地区", "init": "", "value":[{ "n": "全部地区", "v": "" }, { "n": "华语", "v": "华语" }, { "n": "欧美", "v": "欧美" }, { "n": "韩国", "v": "韩国" }, { "n": "日本", "v": "日本" }, { "n": "中国大陆", "v": "中国大陆" }, { "n": "美国", "v": "美国" }, { "n": "中国香港", "v": "中国香港" }] },
    { "key": "年代", "name": "年代", "init": "", "value":[{ "n": "全部年代", "v": "" }, { "n": "2026", "v": "2026" }, { "n": "2025", "v": "2025" }, { "n": "2024", "v": "2024" }, { "n": "2023", "v": "2023" }, { "n": "2022", "v": "2022" }, { "n": "2021", "v": "2021" }, { "n": "2020", "v": "2020" }, { "n": "2010年代", "v": "2010年代" }, { "n": "2000年代", "v": "2000年代" }] },
    { "key": "sort", "name": "排序", "init": "U", "value":[{ "n": "近期热度", "v": "U" }, { "n": "综合排序", "v": "T" }, { "n": "首映时间", "v": "R" }, { "n": "高分优先", "v": "S" }] }
  ],
  "tv":[
    { "key": "形式", "name": "形式", "init": "", "value":[{ "n": "全部类型", "v": "" }, { "n": "喜剧", "v": "喜剧" }, { "n": "爱情", "v": "爱情" }, { "n": "悬疑", "v": "悬疑" }, { "n": "武侠", "v": "武侠" }, { "n": "古装", "v": "古装" }, { "n": "历史", "v": "历史" }, { "n": "剧情", "v": "剧情" }] },
    { "key": "地区", "name": "地区", "init": "", "value":[{ "n": "全部地区", "v": "" }, { "n": "华语", "v": "华语" }, { "n": "欧美", "v": "欧美" }, { "n": "韩国", "v": "韩国" }, { "n": "日本", "v": "日本" }, { "n": "中国大陆", "v": "中国大陆" }, { "n": "美国", "v": "美国" }, { "n": "英国", "v": "英国" }, { "n": "中国香港", "v": "中国香港" }] },
    { "key": "年代", "name": "年代", "init": "", "value":[{ "n": "全部年代", "v": "" }, { "n": "2026", "v": "2026" }, { "n": "2025", "v": "2025" }, { "n": "2024", "v": "2024" }, { "n": "2023", "v": "2023" }, { "n": "2022", "v": "2022" }, { "n": "2021", "v": "2021" }, { "n": "2020", "v": "2020" }, { "n": "2010年代", "v": "2010年代" }] },
    { "key": "平台", "name": "平台", "init": "", "value":[{ "n": "全部平台", "v": "" }, { "n": "腾讯视频", "v": "腾讯视频" }, { "n": "爱奇艺", "v": "爱奇艺" }, { "n": "优酷", "v": "优酷" }, { "n": "Netflix", "v": "Netflix" }, { "n": "HBO", "v": "HBO" }] },
    { "key": "sort", "name": "排序", "init": "U", "value":[{ "n": "近期热度", "v": "U" }, { "n": "综合排序", "v": "T" }, { "n": "首播时间", "v": "R" }, { "n": "高分优先", "v": "S" }] }
  ],
  "show":[
    { "key": "类型", "name": "类型", "init": "", "value":[{ "n": "全部类型", "v": "" }, { "n": "真人秀", "v": "真人秀" }, { "n": "脱口秀", "v": "脱口秀" }, { "n": "音乐", "v": "音乐" }, { "n": "喜剧", "v": "喜剧" }, { "n": "纪实", "v": "纪实" }] },
    { "key": "地区", "name": "地区", "init": "", "value":[{ "n": "全部地区", "v": "" }, { "n": "中国大陆", "v": "中国大陆" }, { "n": "韩国", "v": "韩国" }, { "n": "港台", "v": "港台" }, { "n": "欧美", "v": "欧美" }] },
    { "key": "年代", "name": "年代", "init": "", "value":[{ "n": "全部年代", "v": "" }, { "n": "2026", "v": "2026" }, { "n": "2025", "v": "2025" }, { "n": "2024", "v": "2024" }, { "n": "2023", "v": "2023" }, { "n": "2022", "v": "2022" }, { "n": "2021", "v": "2021" }, { "n": "2020", "v": "2020" }] },
    { "key": "sort", "name": "排序", "init": "U", "value":[{ "n": "近期热度", "v": "U" }, { "n": "综合排序", "v": "T" }, { "n": "首播时间", "v": "R" }, { "n": "高分优先", "v": "S" }] }
  ],
  "anime":[
    { "key": "类型", "name": "类型", "init": "", "value":[{ "n": "全部类型", "v": "" }, { "n": "动画", "v": "动画" }, { "n": "日本动画", "v": "日本动画" }, { "n": "国产动画", "v": "国产动画" }, { "n": "欧美动画", "v": "欧美动画" }, { "n": "剧场版", "v": "剧场版" }, { "n": "番剧", "v": "番剧" }] },
    { "key": "地区", "name": "地区", "init": "", "value":[{ "n": "全部地区", "v": "" }, { "n": "日本", "v": "日本" }, { "n": "中国大陆", "v": "中国大陆" }, { "n": "美国", "v": "美国" }, { "n": "欧美", "v": "欧美" }] },
    { "key": "年代", "name": "年代", "init": "", "value":[{ "n": "全部年代", "v": "" }, { "n": "2026", "v": "2026" }, { "n": "2025", "v": "2025" }, { "n": "2024", "v": "2024" }, { "n": "2023", "v": "2023" }, { "n": "2022", "v": "2022" }, { "n": "2021", "v": "2021" }, { "n": "2020", "v": "2020" }] },
    { "key": "sort", "name": "排序", "init": "U", "value":[{ "n": "近期热度", "v": "U" }, { "n": "综合排序", "v": "T" }, { "n": "首播时间", "v": "R" }, { "n": "高分优先", "v": "S" }] }
  ],
  "hot_movie":[{ "key": "slug", "name": "榜单", "init": "all", "value":[{ "n": "全部榜单", "v": "all" }, { "n": "实时热门电影", "v": "movie_real_time_hotest" }, { "n": "一周口碑电影榜", "v": "movie_weekly_best" }] }],
  "hot_tv":[{ "key": "slug", "name": "榜单", "init": "all", "value":[{ "n": "全部榜单", "v": "all" }, { "n": "实时热门剧集", "v": "tv_real_time_hotest" }, { "n": "华语口碑剧集榜", "v": "tv_chinese_best_weekly" }, { "n": "全球口碑剧集榜", "v": "tv_global_best_weekly" }] }],
  "hot_show":[{ "key": "slug", "name": "榜单", "init": "all", "value":[{ "n": "全部榜单", "v": "all" }, { "n": "近期热门综艺", "v": "tv_variety_show" }, { "n": "国内口碑综艺榜", "v": "show_chinese_best_weekly" }] }],
  "hot_anime":[{ "key": "slug", "name": "榜单", "init": "anime_recent", "value":[{ "n": "全部动漫", "v": "all" }, { "n": "最新动漫", "v": "anime_recent" }, { "n": "近期热门动漫", "v": "anime_hot" }, { "n": "高分动漫", "v": "anime_best" }] }],
  "top_250":[{ "key": "slug", "name": "榜单", "init": "movie_top250", "value":[{ "n": "豆瓣电影Top250", "v": "movie_top250" }] }]
};

// ===================== 🌟 移植：整页级长效缓存 =====================
const pageCache = new Map();

// 列表接口有些条目只带年份，缓存详情补全结果，避免重复请求
const subjectCache = new Map();
const subjectPending = new Map();
const SUBJECT_CACHE_TTL = 6 * 60 * 60 * 1000;

const requestSubjectDetail = async (subjectId) => {
  if (!subjectId) return null;

  const now = Date.now();
  const cached = subjectCache.get(subjectId);
  if (cached && now - cached.time < SUBJECT_CACHE_TTL) {
    return cached.data;
  }

  if (subjectPending.has(subjectId)) {
    return await subjectPending.get(subjectId);
  }

  const pending = requestDouban(`${DOUBAN_HOST}/subject/${subjectId}`)
    .then((data) => {
      if (data) subjectCache.set(subjectId, { data, time: Date.now() });
      return data;
    })
    .finally(() => subjectPending.delete(subjectId));

  subjectPending.set(subjectId, pending);
  return await pending;
};

const normalizeFilters = (id, filters = {}) => {
  const f = { ...(filters || {}) };
  if ((id === 'movie' || id === 'tv' || id === 'show' || id === 'anime') && !f.sort) f.sort = 'U';
  if ((id === 'hot_movie' || id === 'hot_tv' || id === 'hot_show') && !f.slug) f.slug = 'all';
  if (id === 'hot_anime' && !f.slug) f.slug = 'anime_recent';
  if (id === 'top_250' && !f.slug) f.slug = 'movie_top250';
  return f;
};

const getPageCacheKey = (id, page, filters) => {
  return `${id}_${page}_${JSON.stringify(normalizeFilters(id, filters))}`;
};

// ===================== 核心抓取逻辑 =====================
const fetchCategoryLive = async ({ id, page, filters }) => {
  let pg = parseInt(page);
  if (isNaN(pg) || pg < 1) pg = 1;

  const count = 40;
  const start = (pg - 1) * count;

  let items = [];
  let total = 0;
  let slugs = [];
  filters = normalizeFilters(id, filters);

  let slug = filters?.slug || 'all';
  let tags = '';
  let sort = filters?.sort || 'U';
  let ep = '';

  const mergeUniqueItems = (arr = []) => {
    const seen = new Set(items.map((x) => String(x?.id || x?.subject?.id || '')));
    for (const x of arr) {
      const k = String(x?.id || x?.subject?.id || '');
      if (!k) continue;
      if (!seen.has(k)) {
        seen.add(k);
        items.push(x);
      }
    }
  };

  try {
    // 1) 动漫榜单：豆瓣公开 subject_collection 的动漫 slug 不稳定，这里用电影/剧集推荐接口按“动画”聚合，避免空榜
    if (id === 'hot_anime') {
      const animeSortMap = {
        all: 'U',
        anime_hot: 'U',
        anime_best: 'S',
        anime_recent: 'R'
      };
      const animeSort = animeSortMap[slug] || 'U';
      const animeTags = encodeURIComponent('动画');
      const datas = await Promise.all([
        requestDouban(`${DOUBAN_HOST}/movie/recommend?tags=${animeTags}&sort=${animeSort}&start=${start}&count=${count}`),
        requestDouban(`${DOUBAN_HOST}/tv/recommend?tags=${animeTags}&sort=${animeSort}&start=${start}&count=${count}`)
      ]);
      for (const data of datas) {
        if (data && data.items) mergeUniqueItems(data.items);
      }
      total = Math.max(...datas.map((d) => d?.total || 0), items.length, 100);
    }
    // 2) 榜单类
    else if (id === 'hot_movie' || id === 'hot_tv' || id === 'hot_show') {
      if (id === 'hot_movie') slugs = ['movie_real_time_hotest', 'movie_weekly_best'];
      else if (id === 'hot_tv') slugs = ['tv_real_time_hotest', 'tv_chinese_best_weekly', 'tv_global_best_weekly'];
      else if (id === 'hot_show') slugs = ['tv_variety_show', 'show_chinese_best_weekly'];
      else if (id === 'hot_anime') slugs = ['douban_movie_animation', 'movie_animation'];

      if (slug === 'all') {
        const datas = await Promise.all(slugs.map((s) =>
          requestDouban(`${DOUBAN_HOST}/subject_collection/${s}/items?start=${start}&count=${count}`)
        ));
        for (const data of datas) {
          if (data) mergeUniqueItems(data.subject_collection_items || data.items || []);
        }
        total = Math.max(items.length, count);
      } else {
        const data = await requestDouban(`${DOUBAN_HOST}/subject_collection/${slug}/items?start=${start}&count=${count}`);
        if (data) {
          mergeUniqueItems(data.subject_collection_items || data.items || []);
          total = data.total || (data.subject_collection ? data.subject_collection.total : 0) || 100;
        }
      }
    }
    // 3) Top250
    else if (id === 'top_250') {
      const data = await requestDouban(`${DOUBAN_HOST}/subject_collection/movie_top250/items?start=${start}&count=${count}`);
      if (data) {
        mergeUniqueItems(data.subject_collection_items || data.items || []);
        total = data.total || (data.subject_collection ? data.subject_collection.total : 0) || 250;
      }
    }
    // 4) 常规推荐
    else if (id === 'tv' || id === 'movie' || id === 'show' || id === 'anime') {
      let typeStr = '';
      if (id === 'tv') typeStr = '电视剧';
      if (id === 'show') typeStr = '综艺';
      if (id === 'anime') typeStr = '动画';

      tags = [filters?.类型 || filters?.形式, filters?.地区, filters?.年代, filters?.平台, typeStr].filter(Boolean).join(',');
      ep = (id === 'tv' || id === 'show' || id === 'anime') ? '/tv/recommend' : '/movie/recommend';

      const data = await requestDouban(`${DOUBAN_HOST}${ep}?tags=${encodeURIComponent(tags)}&sort=${sort}&start=${start}&count=${count}`);
      if (data && data.items) {
        mergeUniqueItems(data.items);
        total = data.total || 999;
      }
    }

    // 不足40时自动翻下一批补齐（最多再补3轮）
    let offset = start + count;
    for (let round = 0; round < 3 && items.length < count; round++) {
      const before = items.length;

      if (id === 'hot_anime') {
        const animeSortMap = {
          all: 'U',
          anime_hot: 'U',
          anime_best: 'S',
          anime_recent: 'R'
        };
        const animeSort = animeSortMap[slug] || 'U';
        const animeTags = encodeURIComponent('动画');
        const datas = await Promise.all([
          requestDouban(`${DOUBAN_HOST}/movie/recommend?tags=${animeTags}&sort=${animeSort}&start=${offset}&count=${count}`),
          requestDouban(`${DOUBAN_HOST}/tv/recommend?tags=${animeTags}&sort=${animeSort}&start=${offset}&count=${count}`)
        ]);
        for (const data of datas) {
          if (data && data.items) mergeUniqueItems(data.items);
        }
      } else if (id === 'hot_movie' || id === 'hot_tv' || id === 'hot_show') {
        if (slug === 'all') {
          const datas = await Promise.all(slugs.map((s) =>
            requestDouban(`${DOUBAN_HOST}/subject_collection/${s}/items?start=${offset}&count=${count}`)
          ));
          for (const data of datas) {
            if (data) mergeUniqueItems(data.subject_collection_items || data.items || []);
          }
        } else {
          const data = await requestDouban(`${DOUBAN_HOST}/subject_collection/${slug}/items?start=${offset}&count=${count}`);
          if (data) mergeUniqueItems(data.subject_collection_items || data.items || []);
        }
      } else if (id === 'top_250') {
        const data = await requestDouban(`${DOUBAN_HOST}/subject_collection/movie_top250/items?start=${offset}&count=${count}`);
        if (data) mergeUniqueItems(data.subject_collection_items || data.items || []);
      } else if (id === 'tv' || id === 'movie' || id === 'show' || id === 'anime') {
        const data = await requestDouban(`${DOUBAN_HOST}${ep}?tags=${encodeURIComponent(tags)}&sort=${sort}&start=${offset}&count=${count}`);
        if (data && data.items) mergeUniqueItems(data.items);
      }

      if (items.length === before) break;
      offset += count;
    }

    // 先把最终要展示的 40 条筛出来，再补详情；避免 hot/all 榜单合并出上百条后给不可见条目也拉详情
    const pickedItems = [];
    const pickedSeen = new Set();
    for (const it of items) {
      const rawId = it?.id || (it?.subject && it.subject.id);
      if (!rawId || pickedSeen.has(String(rawId))) continue;
      pickedSeen.add(String(rawId));
      pickedItems.push(it);
      if (pickedItems.length >= count) break;
    }
    items = pickedItems;

    // 各分类列表接口经常只给 year，完整首映/首播日期需要详情接口补全
    // 只要没有完整到“月/日”的日期，就尝试拉一次详情；详情失败时仍回退显示年份
    const hasFullPubdate = (it) => {
      const sub = it.subject || {};
      const raw = sub.pubdate || sub.release_date || it.pubdate || it.release_date || '';
      return /\d{4}[-/.年]\d{1,2}/.test(String(raw));
    };

    // 各分类都使用同一套补齐逻辑：只要没有完整到“月/日”的日期，就拉详情接口补全
    const needYearDetail = items.filter((it) => !hasFullPubdate(it));

    for (let i = 0; i < needYearDetail.length; i += 40) {
      const batch = needYearDetail.slice(i, i + 40);
      await Promise.all(batch.map(async (it) => {
        const rawId = it.id || (it.subject && it.subject.id);
        if (!rawId) return;

        const detail = await requestSubjectDetail(String(rawId));
        if (!detail) return;

        const pubdates = Array.isArray(detail.pubdates) ? detail.pubdates.filter(Boolean) : [];
        const firstPubdate = pubdates[0] || '';

        if (detail.pubdate) it.pubdate = detail.pubdate;
        else if (firstPubdate) it.pubdate = firstPubdate;

        if (detail.release_date) it.release_date = detail.release_date;
        if (detail.year && !it.year) it.year = detail.year;
      }));
    }

    // 映射 + 去重 + 截断40
    const list = items.map((it) => {
      const title = it.title || (it.subject && it.subject.title) || '未知';
      const rawId = it.id || (it.subject && it.subject.id);
      if (!rawId) return null;

      const ratingObj = it.rating || (it.subject && it.subject.rating);
      const picObj = it.cover || it.pic || (it.subject && it.subject.pic);
      const pic = picObj ? (picObj.url || picObj.normal || '') : '';
      if (id === 'hot_anime' && (!pic || title === '高分经典动画片榜')) return null;

      // 提取首播时间（豆瓣字段优先级 + 标题兜底）
      let pubdate = '';
      let yearStr = '';
      
      // 标准字段（豆瓣常见结构）
      const sub = it.subject || {};
      if (sub.pubdate) { pubdate = sub.pubdate; }
      else if (sub.release_date) { pubdate = sub.release_date; }
      else if (it.pubdate) { pubdate = it.pubdate; }
      else if (it.release_date) { pubdate = it.release_date; }
      else if (sub.year) { yearStr = sub.year; }
      else if (it.year) { yearStr = it.year; }
      
      // 从标题提取年份（豆瓣标题可能带年份的多种格式）
      if (!pubdate && !yearStr && title) {
        const titleYear = String(title).match(/\((\d{4})\)/) || String(title).match(/\[(\d{4})\]/) || String(title).match(/[-\s](\d{4})[-\s]/) || String(title).match(/(\d{4})年/);
        if (titleYear) yearStr = titleYear[1];
      }
      
      // 处理：如果 pubdate 为空 且 有 yearStr，则 pubdate 只保留4位年份（不补全日）
      if (!pubdate && yearStr) {
        const y = String(yearStr).match(/\d{4}/);
        if (y) pubdate = y[0];
      }
      
      // 优先显示完整日期；拿不到月/日时才回退为年份
      if (pubdate) {
        const dateMatch = String(pubdate).match(/(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/);
        if (dateMatch) {
          const year = dateMatch[1];
          const month = String(dateMatch[2]).padStart(2, '0');
          const day = dateMatch[3] ? String(dateMatch[3]).padStart(2, '0') : '';
          pubdate = day ? `${year}-${month}-${day}` : `${year}-${month}`;
        } else {
          const yearMatch = String(pubdate).match(/\d{4}/);
          pubdate = yearMatch ? yearMatch[0] : '';
        }
      }
      


      // 构建 remarks：评分 + 首播时间（有评分："评分: 8.5分 · 2024-05-20"；无评分："暂无评分 · 2024-05-20"）
      let remarks = '暂无评分';
      if (ratingObj?.value) {
        remarks = `评分: ${ratingObj.value.toFixed(1)}分`;
        if (pubdate) remarks += ` · ${pubdate}`;
      } else if (pubdate) {
        remarks = `暂无评分 · ${pubdate}`;
      }

      return {
        vod_id: String(rawId).trim(),
        vod_name: title,
        vod_pic: pic.replace(/img\d.doubanio.com/g, 'img1.doubanio.com'),
        vod_remarks: remarks,
        goSearch: true
      };
    }).filter(Boolean);

    const seenVod = new Set();
    const finalList = [];
    for (const v of list) {
      if (!seenVod.has(v.vod_id)) {
        seenVod.add(v.vod_id);
        finalList.push(v);
      }
      if (finalList.length >= count) break;
    }

    return {
      list: finalList,
      page: pg,
      pagecount: Math.ceil((total || finalList.length) / count) || pg + 1,
      limit: count,
      total: Math.max(total || 0, finalList.length)
    };
  } catch (error) {
    log.error(`获取豆瓣分类失败 [${id}]: ${error.message}`);
    return { list: [], page: pg, pagecount: 1, limit: count, total: 0 };
  }
};

// ===================== 🌟 移植：读写分离缓存包装器 =====================
const _category = async ({ id, page, filters }) => {
  const cacheKey = getPageCacheKey(id, page, filters);
  
  // 1. 命中缓存，瞬间返回 (0毫秒)
  const cachedPage = pageCache.get(cacheKey);
  if (cachedPage) {
    cachedPage.lastAccess = Date.now();
    return cachedPage.data;
  }

  // 2. 未命中，实时抓取
  log.info(`[首次加载] 正在实时抓取豆瓣分类: ${cacheKey}`);
  const liveData = await fetchCategoryLive({ id, page, filters });
  pageCache.set(cacheKey, { data: liveData, lastAccess: Date.now() });
  return liveData;
};

// ===================== 🌟 移植：后台静默刷新任务 =====================
const backgroundRefreshTask = async () => {
  log.info("🕒 开始执行[豆瓣纯净目录] 后台全量静默预热任务...");
  let refreshCount = 0;
  const now = Date.now();

  // 1. 自动清理深层闲置页面 (超过24小时未访问的非核心页面清理掉)
  for (const[key, cachedData] of pageCache.entries()) {
    if (now - cachedData.lastAccess > 24 * 60 * 60 * 1000) {
      pageCache.delete(key);
    }
  }

  // 精准预热要求榜单的第 1 页 (前40个资源) 默认情况
  const coreTargets =[
    { id: "movie", filters: { sort: "U" } },      // 豆瓣电影：全部、近期热度
    { id: "tv", filters: { sort: "U" } },         // 豆瓣剧集：全部、近期热度
    { id: "show", filters: { sort: "U" } },       // 豆瓣综艺：全部、近期热度
    { id: "anime", filters: { sort: "U" } },      // 豆瓣动漫：全部、近期热度
    { id: "hot_movie", filters: { slug: "all" } },// 电影榜单：全部榜单
    { id: "hot_tv", filters: { slug: "all" } },   // 剧集榜单：全部榜单
    { id: "hot_show", filters: { slug: "all" } }, // 综艺榜单：全部榜单
    { id: "hot_anime", filters: { slug: "anime_recent" } },// 最新动漫
    { id: "top_250", filters: { slug: "movie_top250" } }  // Top250
  ];

  for (const target of coreTargets) {
    const page = 1;
    const cacheKey = getPageCacheKey(target.id, page, target.filters);
    try {
      const freshData = await fetchCategoryLive({ id: target.id, page, filters: target.filters });
      pageCache.set(cacheKey, { data: freshData, lastAccess: Date.now() });
      refreshCount++;
      // 暂停 2 秒，防止把豆瓣接口打挂
      await new Promise(r => setTimeout(r, 2000)); 
    } catch (e) {
      log.warn(`预热失败 [${target.id}]: ${e.message}`);
    }
  }
  log.info(`✅ 豆瓣目录后台预热完成！共缓存了 ${refreshCount} 个核心榜单首页。`);
};

// ===================== T4 协议处理 =====================
const decodeExt = (ext) => {
  if (!ext) return {};
  try { return JSON.parse(Buffer.from(ext, 'base64').toString('utf-8')); }
  catch (e) { try { return JSON.parse(ext); } catch (e2) { return {}; } }
};

const buildHomeList = async () => {
  const sources = [
    { id: "hot_movie", filters: { slug: "all" }, take: 2 },
    { id: "hot_tv", filters: { slug: "all" }, take: 2 },
    { id: "hot_show", filters: { slug: "all" }, take: 1 }
  ];

  const results = sources.map((source) => ({
    ...source,
    list: [],
    seen: new Set(),
    cursor: 0,
    nextPage: 1,
    pagecount: Infinity,
    noMore: false
  }));

  const loadUntilEnough = async (result, need) => {
    while (result.list.length - result.cursor < need && !result.noMore) {
      if (result.nextPage > result.pagecount) {
        result.noMore = true;
        break;
      }

      const data = await _category({ id: result.id, page: result.nextPage, filters: result.filters });
      result.nextPage++;

      if (!data?.list?.length) {
        result.noMore = true;
        break;
      }

      result.pagecount = data.pagecount || result.pagecount;
      for (const item of data.list) {
        if (!item?.vod_id || result.seen.has(item.vod_id)) continue;
        result.seen.add(item.vod_id);
        result.list.push(item);
      }
    }

    return result.list.length - result.cursor >= need;
  };

  // 首页热门优先按 2部电影、2部剧集、1部综艺 循环；对应类别无下一页时，电影/剧集互补，电影剧集都无再用综艺补
  const merged = [];
  const seen = new Set();
  const movieIndex = 0;
  const tvIndex = 1;
  const showIndex = 2;
  const pattern = [movieIndex, movieIndex, tvIndex, tvIndex, showIndex];

  const takeAvailable = async (index) => {
    const result = results[index];

    while (true) {
      await loadUntilEnough(result, 1);

      while (result.cursor < result.list.length) {
        const item = result.list[result.cursor++];
        if (!item?.vod_id || seen.has(item.vod_id)) continue;
        return item;
      }

      if (result.noMore) return null;
    }
  };

  const getFallbackOrder = (primaryIndex) => {
    if (primaryIndex === movieIndex) return [movieIndex, tvIndex, showIndex];
    if (primaryIndex === tvIndex) return [tvIndex, movieIndex, showIndex];
    return [showIndex, movieIndex, tvIndex];
  };

  while (merged.length < 120) {
    let addedThisRound = 0;

    for (const primaryIndex of pattern) {
      let item = null;

      for (const index of getFallbackOrder(primaryIndex)) {
        item = await takeAvailable(index);
        if (item) break;
      }

      if (!item) return merged;

      seen.add(item.vod_id);
      merged.push(item);
      addedThisRound++;

      if (merged.length >= 120) return merged;
    }

    if (addedThisRound === 0) break;
  }

  return merged;
};

const handleT4Request = async (req) => {
  const { t, pg, ext } = req.query;
  const page = parseInt(pg) || 1;

  // 请求分类数据
  if (t) {
    const filters = decodeExt(ext);
    return await _category({ id: t, page, filters });
  }

  // 返回根目录节点
  let classList =[
    { type_id: "movie", type_name: "豆瓣电影" },
    { type_id: "tv", type_name: "豆瓣剧集" },
    { type_id: "show", type_name: "豆瓣综艺" },
    { type_id: "anime", type_name: "动漫剧集" },
    { type_id: "hot_anime", type_name: "动漫电影" },
    { type_id: "hot_movie", type_name: "电影榜单" },
    { type_id: "hot_tv", type_name: "剧集榜单" },
    { type_id: "hot_show", type_name: "综艺榜单" },
    { type_id: "top_250", type_name: "电影Top250" }
  ];

  const homeList = await buildHomeList();

  return {
    class: classList,
    filters: filterConfig,
    list: homeList
  };
};

// ===================== 模块导出 =====================
module.exports = async (server, opt) => {
  await init(server);
  const apiPath = "/video/douban_tj";
  
  server.get(apiPath, async (req, reply) => {
    try {
      return await handleT4Request(req);
    } catch (error) {
      log.error(`插件出错: ${error.message}`);
      return { error: "Internal Server Error", message: error.message };
    }
  });

  opt.sites.push({
    key: "douban_tj",
    name: "马到成功 ❊ 大吉大利   ㋡",
    type: 4,
    api: apiPath,
    searchable: 0,
    quickSearch: 0,
    filterable: 1,
    indexs: 1
  });

  log.info(`✅ 豆瓣纯净目录已加载 (涵盖影视综与各大榜单)`);

  // 挂载后台定时预热任务：每 24 小时刷新一次豆瓣榜单缓存
  setInterval(backgroundRefreshTask, 24 * 60 * 60 * 1000);
  
  // 启动后延迟 5 秒执行首次预热
  setTimeout(backgroundRefreshTask, 5000);
};

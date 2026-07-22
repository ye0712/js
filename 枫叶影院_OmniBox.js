// ==UserScript==
// @name         枫叶影院_OmniBox
// @namespace    https://github.com/ye0712/js
// @version      1.0.0
// @description  枫叶影院 OmniBox 采集源 - 基于 maihaolian.com (cupfox模板)
// @author       ye0712
// @downloadURL  https://raw.githubusercontent.com/ye0712/js/main/枫叶影院_OmniBox.js
// @homepageURL  https://maihaolian.com
// @icon         https://maihaolian.com/favicon.ico
// @supportURL   https://github.com/ye0712/js/issues
// @match        https://maihaolian.com/*
// @indexs       1
// @grant        none
// ==/UserScript==

/*
 * 环境变量:
 *   SITE_API - 站点地址，默认 https://maihaolian.com
 *   开箱即用，无需额外配置
 */

const OmniBox = (() => {
  try { return require('omnibox_sdk'); }
  catch (_) { return { log(l, m) { console.log('[' + l + '] ' + m); } }; }
})();

const runner = (() => {
  try { return require('spider_runner'); }
  catch (_) { return { run() {} }; }
})();

const SITE_API = (process.env.SITE_API || 'https://maihaolian.com').replace(/\/+$/, '');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const CLASSES = [
  { type_id: '/label/qq', type_name: '腾讯VIP精选' },
  { type_id: '/label/bli', type_name: 'B站VIP精选' },
  { type_id: '/label/youku', type_name: '优酷VIP精选' },
  { type_id: '5', type_name: '红果短剧' },
  { type_id: '2', type_name: '电视剧' },
  { type_id: '1', type_name: '电影' },
  { type_id: '4', type_name: '动漫' },
  { type_id: '3', type_name: '综艺' }
];

// 统一请求封装
async function request(url, options = {}) {
  try {
    return await OmniBox.request(url, {
      method: options.method || 'GET',
      headers: Object.assign({
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': SITE_API + '/'
      }, options.headers || {}),
      timeout: options.timeout || 15000,
      data: options.data || null
    });
  } catch (e) {
    OmniBox.log('error', '[req] ' + url + ' ' + (e.message || e));
    return null;
  }
}

// 修复图片地址
function fixPic(u) {
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  return u.replace(/&amp;/g, '&');
}

// 解析列表 - 匹配 <a class="public-list-exp">
function parseVodList(html) {
  const items = [], seen = new Set();
  const re = /<a[^>]*class="[^"]*public-list-exp[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const ch = m[0], hm = ch.match(/href="[^"]*?\/detail\/(\d+)\.html"/i);
    if (!hm) continue;
    const vid = hm[1];
    if (seen.has(vid)) continue;
    seen.add(vid);
    let title = '';
    const t1 = ch.match(/title="([^"]+?)"/);
    if (t1) title = t1[1];
    else { const t2 = ch.match(/alt="([^"]+?)"/); if (t2) title = t2[1]; }
    if (!title) continue;
    let pic = '';
    const p1 = ch.match(/data-src="([^"]+?)"/);
    if (p1) pic = p1[1];
    if (!pic) { const p2 = ch.match(/src="([^"]+?)"/); if (p2) pic = p2[1]; }
    pic = fixPic(pic);
    let remark = '';
    const r1 = ch.match(/<span[^>]*class="[^"]*(?:ft2|public-list-prb)[^"]*"[^>]*>([^<]+?)<\/span>/i);
    if (r1) remark = r1[1].trim();
    items.push({ vod_id: vid, vod_name: title.trim(), vod_pic: pic, vod_remarks: remark });
  }
  return items;
}

// 获取总页数
function getPageCount(html, cur) {
  const m = html.match(/<a[^>]*href="[^"]*---(\d+)---[^"]*"[^>]*>(?:尾页|末页)<\/a>/i);
  return m ? parseInt(m[1], 10) : cur;
}

// ==================== 首页 ====================
async function home(params, context) {
  OmniBox.log('info', '[home] 入口 from=' + ((context && context.from) || 'web'));
  try {
    const list = await Promise.all(CLASSES.map(async (c) => {
      const isLabel = c.type_id.startsWith('/label');
      const url = isLabel
        ? SITE_API + c.type_id + '/page/1.html'
        : SITE_API + '/cupfox-list/' + c.type_id + '--------1---.html';
      const resp = await request(url);
      return {
        class_id: c.type_id,
        class_name: c.type_name,
        vod: (resp && resp.body) ? parseVodList(resp.body).slice(0, 12) : []
      };
    }));
    return { class: CLASSES, filter: {}, list: list };
  } catch (e) {
    OmniBox.log('error', '[home] 失败: ' + (e.message || e));
    return { class: [], list: [] };
  }
}

// ==================== 分类 ====================
async function category(params, context) {
  try {
    const tid = String(params.type_id || params.tid || '1');
    const pg = parseInt(params.page || params.pg || 1, 10) || 1;
    OmniBox.log('info', '[category] tid=' + tid + ' pg=' + pg);

    if (tid.startsWith('/label')) {
      const resp = await request(SITE_API + tid + '/page/' + pg + '.html');
      const list = (resp && resp.body) ? parseVodList(resp.body) : [];
      return { list: list, page: pg, pagecount: list.length < 24 ? pg : pg + 2 };
    }

    const url = SITE_API + '/cupfox-list/' + tid + '--------' + pg + '---.html';
    const resp = await request(url);
    if (!resp || !resp.body) return { list: [], page: pg, pagecount: 1 };

    const list = parseVodList(resp.body);
    const pc = getPageCount(resp.body, pg);
    OmniBox.log('info', '[category] 返回 ' + list.length + '条, ' + pc + '页');
    return { list: list, page: pg, pagecount: Math.max(pc, 1) };
  } catch (e) {
    OmniBox.log('error', '[category] 失败: ' + (e.message || e));
    return { list: [], page: 1, pagecount: 0 };
  }
}

// ==================== 搜索 ====================
async function search(params, context) {
  try {
    const kw = String(params.keyword || params.wd || params.search || '').trim();
    const pg = parseInt(params.page || params.pg || 1, 10) || 1;
    if (!kw) return { list: [], page: 1, pagecount: 0 };

    OmniBox.log('info', '[search] keyword=' + kw + ' pg=' + pg);
    const url = SITE_API + '/cupfox-search/' + encodeURIComponent(kw) + '----------' + pg + '---.html';
    const resp = await request(url);
    return {
      list: (resp && resp.body) ? parseVodList(resp.body) : [],
      page: pg,
      pagecount: 1
    };
  } catch (e) {
    OmniBox.log('error', '[search] 失败: ' + (e.message || e));
    return { list: [], page: 1, pagecount: 0 };
  }
}

// ==================== 详情 ====================
async function detail(params, context) {
  try {
    const vid = String(params.id || params.vod_id || params.videoId || '').split(',')[0].trim();
    if (!vid) return { list: [] };
    OmniBox.log('info', '[detail] vid=' + vid);

    const resp = await request(SITE_API + '/detail/' + vid + '.html');
    if (!resp || !resp.body) return { list: [] };
    const html = resp.body;

    // 片名
    let vodName = '';
    const n1 = html.match(/<h3[^>]*class="[^"]*slide-info-title[^"]*"[^>]*>([^<]+?)<//i);
    if (n1) vodName = n1[1].trim();

    // 封面
    let vodPic = '';
    const p1 = html.match(/<img[^>]*data-src="([^"]+?)"[^>]*>/i);
    if (p1) vodPic = fixPic(p1[1]);

    // 导演/演员
    let vodDirector = '', vodActor = '';
    const infos = html.match(/<div[^>]*class="slide-info"[^>]*>([\s\S]*?)<\/div>/gi);
    if (infos) {
      infos.forEach(function(b) {
        var t = b.replace(/<[^>]+>/g, '').trim();
        if (t.indexOf('导演：') === 0) vodDirector = t.replace('导演：', '').trim();
        if (t.indexOf('演员：') === 0) vodActor = t.replace('演员：', '').trim();
      });
    }

    // 简介
    let vodContent = '';
    const c1 = html.match(/<div[^>]*id="height_limit"[^>]*>([\s\S]*?)<\/div>/i);
    if (c1) vodContent = c1[1].replace(/<[^>]+>/g, '').trim();

    // 播放源
    var playFrom = [];
    var playUrl = [];
    var tb = html.match(/<div[^>]*class="anthology-tab[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (tb) {
      var ls = tb[1].match(/<a[^>]*class="swiper-slide[^"]*"[^>]*>[\s\S]*?<\/a>/gi);
      if (ls) {
        ls.forEach(function(a) {
          var nn = a.replace(/<[^>]+>/g, '').trim();
          if (nn) playFrom.push(nn);
        });
      }
    }

    var lbs = html.match(/<div[^>]*class="anthology-list-box[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    if (lbs) {
      lbs.forEach(function(b, i) {
        var eps = [];
        var es = b.match(/<a[^>]*href="[^"]*?\/play\/([^"']+?)\.html"[^>]*>[\s\S]*?<\/a>/gi);
        if (es) {
          es.forEach(function(a) {
            var hm = a.match(/href="[^"]*?\/play\/([^"']+?)\.html"/i);
            var nm = a.match(/>([^<]+?)<//);
            if (hm) {
              eps.push((nm ? nm[1].trim() : '第' + eps.length + '集') + '$' + vid + '-' + hm[1]);
            }
          });
        }
        eps.reverse();
        if (eps.length > 0 && i < playFrom.length) {
          playUrl.push(eps.join('#'));
        }
      });
    }

    // 构建 vod_play_sources
    var vodPlaySources = [];
    for (var i = 0; i < playFrom.length; i++) {
      if (playFrom[i] && playUrl[i]) {
        var eps = playUrl[i].split('#').map(function(e) {
          var s = e.split('$');
          return { name: s[0], playId: s[1] || e };
        });
        vodPlaySources.push({ name: playFrom[i], episodes: eps });
      }
    }

    // 兼容旧版字段
    var validFrom = [];
    var validUrl = [];
    for (var i = 0; i < playFrom.length; i++) {
      if (playFrom[i] && playUrl[i]) {
        validFrom.push(playFrom[i]);
        validUrl.push(playUrl[i]);
      }
    }

    OmniBox.log('info', '[detail] ' + vodName + ' ' + vodPlaySources.length + '线路');
    return {
      list: [{
        vod_id: vid,
        vod_name: vodName,
        vod_pic: vodPic,
        vod_content: vodContent,
        vod_director: vodDirector,
        vod_actor: vodActor,
        vod_play_from: validFrom.join('$$$'),
        vod_play_url: validUrl.join('$$$'),
        vod_play_sources: vodPlaySources
      }]
    };
  } catch (e) {
    OmniBox.log('error', '[detail] 失败: ' + (e.message || e));
    return { list: [] };
  }
}

// ==================== 播放 ====================
async function play(params, context) {
  try {
    var pid = String(params.playId || params.id || '').trim();
    if (!pid) return { parse: 1, url: '', urls: [] };

    // 如果直接是 http 直链
    if (pid.indexOf('http') === 0) {
      var isDirect = /.(m3u8|mp4|flv|ts|mkv)(\?|$)/i.test(pid);
      return {
        urls: [{ name: '播放', url: pid }],
        parse: isDirect ? 0 : 1,
        url: pid
      };
    }

    // 处理 playId 格式: "第1集$20067-1-1" -> "20067-1-1"
    if (pid.indexOf('$') !== -1) {
      pid = pid.split('$').pop();
    }

    var playUrl = SITE_API + '/play/' + pid + '.html';
    var resp = await request(playUrl);
    if (!resp || !resp.body) {
      // 获取不到播放页时返回播放页让客户端嗅探
      return { parse: 1, url: playUrl, urls: [{ name: '播放', url: playUrl }] };
    }

    var html = resp.body;
    var m = html.match(/player_aaaas*=s*({.*?})<\/script>/s);
    if (!m) {
      return { parse: 1, url: playUrl, urls: [{ name: '播放', url: playUrl }] };
    }

    var pd = JSON.parse(m[1]);
    var vu = pd.url || '';
    var pf = pd.from || '';

    if (!vu) {
      return { parse: 0, url: 'https://php.doube.eu.org/error.m3u8', urls: [{ name: '播放', url: 'https://php.doube.eu.org/error.m3u8' }] };
    }

    // 直链 m3u8/mp4 直接返回
    if (vu.indexOf('http') === 0 && (vu.indexOf('.m3u8') !== -1 || vu.indexOf('.mp4') !== -1)) {
      return { parse: 0, url: vu, urls: [{ name: '播放', url: vu }] };
    }

    // 二次解析 (YYNB/JD4K)
    var apiMap = {
      'YYNB': 'https://zzrs.mfdyvip.com/player/mplayer.php',
      'JD4K': 'https://fgsrg.hzqingshan.com/player/mplayer.php'
    };

    if (apiMap[pf]) {
      try {
        // 获取 token
        var tokenUrl = 'https://fgsrg.hzqingshan.com/player/?url=' + encodeURIComponent(vu);
        var tr = await request(tokenUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
            'Referer': 'https://www.ht10010.com/'
          }
        });

        var token = '';
        if (tr && tr.body) {
          var tk = tr.body.match(/data-te="([^"]+?)"/);
          if (tk) token = tk[1];
        }

        if (token) {
          var payload = 'url=' + encodeURIComponent(vu) + '&token=' + encodeURIComponent(token);
          var pr = await request(apiMap[pf], {
            method: 'POST',
            data: payload,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
              'Referer': 'https://www.ht10010.com/',
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          });

          if (pr && pr.body) {
            var result = JSON.parse(pr.body);
            if (result.code === 200 && result.url) {
              OmniBox.log('info', '[play] 二次解析成功');
              return {
                parse: 0,
                url: result.url,
                urls: [{ name: '播放', url: result.url }]
              };
            }
          }
        }
      } catch (ex) {
        OmniBox.log('error', '[play] 二次解析失败: ' + (ex.message || ex));
      }
    }

    // 兜底: 返回播放页让客户端嗅探
    OmniBox.log('info', '[play] 返回播放页嗅探: ' + playUrl);
    return { parse: 1, url: playUrl, urls: [{ name: '播放', url: playUrl }] };
  } catch (e) {
    var fallbackUrl = SITE_API + '/play/' + (pid || '') + '.html';
    OmniBox.log('error', '[play] 失败: ' + (e.message || e));
    return { parse: 1, url: fallbackUrl, urls: [{ name: '播放', url: fallbackUrl }] };
  }
}

module.exports = { home: home, category: category, detail: detail, search: search, play: play };
try { runner.run(module.exports); } catch (e) {}

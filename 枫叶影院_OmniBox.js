// @name 枫叶影院_OmniBox
// @author 转换版
// @description 枫叶影院 maihaolian.com OmniBox源
// @version 1.0.0
// @downloadURL https://raw.githubusercontent.com/ye0712/js/main/枫叶影院_OmniBox.js

const OmniBox = require("omnibox_sdk");
const runner = require("spider_runner");

const HOST = "https://maihaolian.com";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

const HEADERS = { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "zh-CN,zh;q=0.9" };

module.exports = { home, category, detail, search, play };
runner.run(module.exports);

async function home() {
  const classes = [
    { type_id: "/label/qq", type_name: "腾讯VIP精选" }, { type_id: "/label/bli", type_name: "B站VIP精选" },
    { type_id: "/label/youku", type_name: "优酷VIP精选" }, { type_id: "5", type_name: "红果短剧" },
    { type_id: "2", type_name: "电视剧" }, { type_id: "1", type_name: "电影" },
    { type_id: "4", type_name: "动漫" }, { type_id: "3", type_name: "综艺" }
  ];
  return { class: classes, filter: {}, list: [] };
}

async function category(params) {
  const tid = String(params?.type_id || params?.tid || "1");
  const page = parseInt(params?.page || params?.pg || 1, 10) || 1;
  if (tid.startsWith("/label")) {
    const html = await fetchPage(tid + "/page/" + page + ".html");
    return { page, pagecount: 1, list: html ? parseList(html) : [] };
  }
  const url = "/cupfox-list/" + tid + "--------" + page + "---.html";
  const html = await fetchPage(url);
  if (!html) return { page, pagecount: 1, list: [] };
  const list = parseList(html);
  let pc = page;
  const m = html.match(/<a[^>]*href="[^"]*---(\d+)---[^"]*"[^>]*>(?:尾页|末页)<\/a>/i);
  if (m) pc = parseInt(m[1], 10);
  return { page, pagecount: Math.max(pc, 1), list };
}

async function detail(params) {
  const vid = String(params?.id || params?.vod_id || "").split(",")[0].trim();
  if (!vid) return { list: [] };
  const html = await fetchPage("/detail/" + vid + ".html");
  if (!html) return { list: [] };
  let n = "", p = "", d = "", a = "", c = "", pf = [], pu = [];

  const n1 = html.match(/<h3[^>]*class="[^"]*slide-info-title[^"]*"[^>]*>([^<]+?)<\//i);
  if (n1) n = n1[1].trim();
  const p1 = html.match(/<img[^>]*data-src="([^"]+?)"[^>]*>/i);
  if (p1) p = p1[1];
  if (p && !p.startsWith("http")) p = "https:" + p;
  
  const is = html.match(/<div[^>]*class="slide-info"[^>]*>([\s\S]*?)<\/div>/gi);
  if (is) is.forEach(b => {
    const t = b.replace(/<[^>]+>/g, "").trim();
    if (t.startsWith("导演：")) d = t.replace("导演：", "").trim();
    if (t.startsWith("演员：")) a = t.replace("演员：", "").trim();
  });
  
  const c1 = html.match(/<div[^>]*id="height_limit"[^>]*>([\s\S]*?)<\/div>/i);
  if (c1) c = c1[1].replace(/<[^>]+>/g, "").trim();
  
  const tb = html.match(/<div[^>]*class="anthology-tab[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (tb) {
    const ls = tb[1].match(/<a[^>]*class="swiper-slide[^"]*"[^>]*>[\s\S]*?<\/a>/gi);
    if (ls) ls.forEach(x => { const nn = x.replace(/<[^>]+>/g, "").trim(); if (nn) pf.push(nn); });
  }
  
  const lbs = html.match(/<div[^>]*class="anthology-list-box[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
  if (lbs) lbs.forEach((b, i) => {
    const eps = [];
    const es = b.match(/<a[^>]*href="[^"]*?\/play\/([^"']+?)\.html"[^>]*>[\s\S]*?<\/a>/gi);
    if (es) es.forEach(x => {
      const hm = x.match(/href="[^"]*?\/play\/([^"']+?)\.html"/i);
      const nm = x.match(/>([^<]+?)<\//);
      if (hm) eps.push((nm ? nm[1].trim() : "第" + eps.length + "集") + "$" + vid + "-" + hm[1]);
    });
    eps.reverse();
    if (eps.length && i < pf.length) pu.push(eps.join("#"));
  });
  
  const vs = [];
  for (let i = 0; i < pf.length; i++) {
    if (pf[i] && pu[i]) {
      vs.push({ name: pf[i], episodes: pu[i].split("#").map(e => {
        const s = e.split("$");
        return { name: s[0], playId: s[1] || e };
      })});
    }
  }
  
  return { list: [{ vod_id: vid, vod_name: n, vod_pic: p, vod_content: c, vod_director: d, vod_actor: a, vod_play_sources: vs }] };
}

async function search(params) {
  const kw = String(params?.keyword || params?.wd || params?.search || "").trim();
  const pg = parseInt(params?.page || params?.pg || 1, 10) || 1;
  if (!kw) return { page: 1, pagecount: 0, list: [] };
  const html = await fetchPage("/cupfox-search/" + encodeURIComponent(kw) + "----------" + pg + "---.html");
  return { page: pg, pagecount: 1, list: html ? parseList(html) : [] };
}

async function play(params) {
  let pid = String(params?.playId || params?.id || "").trim();
  if (!pid) return { parse: 1, url: "" };
  if (pid.startsWith("http")) return { parse: 0, url: pid };
  if (pid.includes("$")) pid = pid.split("$").pop();
  
  const u = HOST + "/play/" + pid + ".html";
  const html = await fetchPage(u);
  if (!html) return { parse: 1, url: u };
  
  const m = html.match(/player_aaaa\s*=\s*({.*?})<\/script>/s);
  if (!m) return { parse: 1, url: u };
  
  try {
    const pd = JSON.parse(m[1]);
    let vu = pd.url || "";
    if (!vu) return { parse: 1, url: u };
    if (vu.startsWith("http") && (vu.endsWith(".m3u8") || vu.endsWith(".mp4"))) return { parse: 0, url: vu };
    return { parse: 1, url: u };
  } catch (e) {
    return { parse: 1, url: u };
  }
}

function parseList(html) {
  const items = [], seen = new Set();
  const r = /<a[^>]*class="[^"]*public-list-exp[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = r.exec(html)) !== null) {
    const c = m[0], hm = c.match(/href="[^"]*?\/detail\/(\d+)\.html"/i);
    if (!hm) continue;
    const vid = hm[1];
    if (seen.has(vid)) continue;
    seen.add(vid);
    let t = "";
    const t1 = c.match(/title="([^"]+?)"/);
    if (t1) t = t1[1];
    if (!t) { const t2 = c.match(/alt="([^"]+?)"/); if (t2) t = t2[1]; }
    if (!t) continue;
    let pic = "";
    const p1 = c.match(/data-src="([^"]+?)"/);
    if (p1) pic = p1[1];
    if (!pic) { const p2 = c.match(/src="([^"]+?)"/); if (p2) pic = p2[1]; }
    if (pic && !pic.startsWith("http")) pic = "https:" + pic;
    let rk = "";
    const r1 = c.match(/<span[^>]*class="[^"]*(?:ft2|public-list-prb)[^"]*"[^>]*>([^<]+?)<\/span>/i);
    if (r1) rk = r1[1].trim();
    items.push({ vod_id: vid, vod_name: t.trim(), vod_pic: pic, vod_remarks: rk });
  }
  return items;
}

async function fetchPage(path) {
  try {
    const url = path.startsWith("http") ? path : HOST + path;
    const res = await OmniBox.request(url, { method: "GET", timeout: 15000, headers: HEADERS });
    return res?.body || "";
  } catch (_) { return ""; }
}
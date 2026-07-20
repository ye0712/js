# -*- coding: utf-8 -*-
# @name 枫叶影院
# @author 转换版
# @description 枫叶影院 maihaolian.com 全功能源
# @indexs 1
# @version 1.0.0

import re
import json
import urllib.parse
import requests
from bs4 import BeautifulSoup
from spider_runner import OmniBox, run

HOST = "https://maihaolian.com"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"

HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
}


def fetch_page(path):
    """请求页面"""
    try:
        url = path if path.startswith("http") else HOST + path
        rsp = requests.get(url, headers=HEADERS, timeout=15)
        return rsp.text if rsp.status_code == 200 else ""
    except:
        return ""


def fetch_raw(url):
    """请求原始页面（用于解析接口）"""
    try:
        h = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": "https://www.ht10010.com/",
        }
        rsp = requests.get(url, headers=h, timeout=15)
        return rsp.text if rsp.status_code == 200 else ""
    except:
        return ""


def fix_pic(u):
    """修复图片地址"""
    if not u:
        return ""
    if u.startswith("//"):
        return "https:" + u
    return u.replace("&amp;", "&")


def parse_video_list(html):
    """解析视频列表"""
    videos = []
    seen = set()
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.select("a.public-list-exp"):
        href = a.get("href", "")
        m = re.search(r"/detail/(\d+)\.html", href)
        if not m:
            continue
        vod_id = m.group(1)
        if vod_id in seen:
            continue
        seen.add(vod_id)

        spans = [s.text for s in a.select("span.public-prt")]
        span = ",".join(spans)

        vod_name = a.get("title", "") or (a.select_one("img") and a.select_one("img").get("alt", "")) or ""
        pic_el = a.select_one("img")
        vod_pic = fix_pic(pic_el.get("data-src", "")) if pic_el else ""
        remark_el = a.select_one(".ft2") or a.select_one(".public-list-prb")
        vod_remarks = remark_el.text.strip() if remark_el else ""

        videos.append({
            "vod_id": vod_id,
            "vod_name": vod_name.strip(),
            "vod_pic": vod_pic,
            "vod_remarks": vod_remarks,
            "vod_year": span,
        })
    return videos


def parse_search_list(html):
    """解析搜索结果列表"""
    videos = []
    seen = set()
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.select("a.public-list-exp"):
        href = a.get("href", "")
        m = re.search(r"/detail/(\d+)\.html", href)
        if not m:
            continue
        vod_id = m.group(1)
        if vod_id in seen:
            continue
        seen.add(vod_id)

        pic_el = a.select_one("img")
        vod_pic = fix_pic(pic_el.get("data-src", "")) if pic_el else ""
        title_el = soup.select_one(f'a.thumb-txt[href="/detail/{vod_id}.html"]')
        if title_el:
            vod_name = title_el.text.strip()
        else:
            vod_name = (a.select_one("img") and a.select_one("img").get("alt", "")) or ""
        remark_el = a.select_one(".public-list-prb") or a.select_one(".ft2")
        vod_remarks = remark_el.text.strip() if remark_el else ""

        videos.append({
            "vod_id": vod_id,
            "vod_name": vod_name.strip(),
            "vod_pic": vod_pic,
            "vod_remarks": vod_remarks,
        })
    return videos


# ==================== 首页 ====================
def home(params):
    classes = [
        {"type_id": "/label/qq", "type_name": "腾讯VIP精选"},
        {"type_id": "/label/bli", "type_name": "B站VIP精选"},
        {"type_id": "/label/youku", "type_name": "优酷VIP精选"},
        {"type_id": "5", "type_name": "红果短剧"},
        {"type_id": "2", "type_name": "电视剧"},
        {"type_id": "1", "type_name": "电影"},
        {"type_id": "4", "type_name": "动漫"},
        {"type_id": "3", "type_name": "综艺"},
    ]

    filters = build_filters()
    html = fetch_page("/")
    lst = parse_video_list(html)

    return {"class": classes, "filters": filters, "list": lst}


# ==================== 分类 ====================
def category(params):
    tid = str(params.get("categoryId") or "1")
    page = int(params.get("page") or 1)
    extend = params.get("filters") or {}

    if tid.startswith("/label"):
        url = f"{tid}/page/{page}.html"
        html = fetch_page(url)
        items = parse_video_list(html)
        return {
            "page": page,
            "pagecount": page if len(items) < 24 else page + 2,
            "total": 9999,
            "list": items,
        }

    args = {}
    if isinstance(extend, dict):
        for k, v in extend.items():
            if v:
                args[k] = str(v)

    route_tid = args.get("class") or args.get("tid") or tid
    area = args.get("area", "")
    genre = args.get("genre", "")
    year = args.get("year", "")
    lang = args.get("lang", "")
    letter = args.get("letter", "")
    sort = args.get("sort", "")

    if not area and not genre and not year and not lang and not letter and not sort:
        url = f"/cupfox-list/{route_tid}--------{page}---.html"
        html = fetch_page(url)
        items = parse_video_list(html)
        soup = BeautifulSoup(html, "html.parser")
        pagecount = page
        for a in soup.select("a.page-link"):
            if a.text == "尾页":
                href = a.get("href", "")
                m = re.search(r"---(\d+)---", href)
                if m:
                    pagecount = int(m.group(1))
                break
        if not items:
            pagecount = 0
        return {"page": page, "pagecount": pagecount, "total": 9999, "limit": 36, "list": items}

    segs = [route_tid, area, sort, genre, lang, letter, "", "", year]
    url = "/cupfox-list/" + "-".join(segs) + ".html"
    html = fetch_page(url)
    items = parse_video_list(html)
    return {"page": 1, "pagecount": 1, "total": 9999, "limit": 36, "list": items}


# ==================== 详情 ====================
def detail(params):
    vid = str(params.get("vod_id") or "").split(",")[0].strip()
    if not vid:
        return {"list": []}

    try:
        html = fetch_page(f"/detail/{vid}.html")
        if not html:
            return {"list": []}

        soup = BeautifulSoup(html, "html.parser")
        vod_name = soup.select_one("h3.slide-info-title")
        vod_name = vod_name.text.strip() if vod_name else ""

        vod_pic = fix_pic(soup.select_one("img.lazy").get("data-src", "")) if soup.select_one("img.lazy") else ""

        vod_director = ""
        vod_actor = ""
        for el in soup.select(".slide-info"):
            text = el.get_text(" ").strip()
            if text.startswith("导演："):
                vod_director = text.replace("导演：", "").strip()
            elif text.startswith("演员："):
                vod_actor = text.replace("演员：", "").strip()

        vod_content = soup.select_one("#height_limit")
        vod_content = vod_content.get_text(" ", strip=True) if vod_content else ""

        play_from = []
        for tab in soup.select(".anthology-tab a.swiper-slide"):
            src_name = re.sub(r"<[^>]+>", "", str(tab)).strip() or tab.get_text(" ", strip=True).strip()
            if src_name:
                play_from.append(src_name)

        tab_blocks = soup.select(".anthology-list-box")
        play_url = []
        for i, block in enumerate(tab_blocks):
            ep_list = []
            for a in block.select("li a"):
                href = a.get("href", "")
                m = re.search(r"/play/(.*?)\.html", href)
                if m:
                    ep_list.append(f"{a.text.strip()}${vid}-{m.group(1)}")
            ep_list.reverse()
            if ep_list and i < len(play_from):
                play_url.append("#".join(ep_list))

        valid_from = [pf for i, pf in enumerate(play_from) if i < len(play_url)]

        return {
            "list": [{
                "vod_id": vid,
                "vod_name": vod_name,
                "vod_pic": vod_pic,
                "vod_director": vod_director,
                "vod_actor": vod_actor,
                "vod_content": vod_content,
                "vod_play_from": "$$$".join(valid_from),
                "vod_play_url": "$$$".join(play_url),
            }]
        }
    except:
        return {"list": []}


# ==================== 搜索 ====================
def search(params):
    keyword = str(params.get("keyword") or "").strip()
    page = int(params.get("page") or 1)
    if not keyword:
        return {"page": 1, "pagecount": 0, "total": 0, "list": []}

    try:
        decoded = urllib.parse.unquote(keyword)
    except:
        decoded = keyword

    html = fetch_page(f"/cupfox-search/{urllib.parse.quote(decoded)}----------{page}---.html")
    items = parse_search_list(html)
    return {"page": page, "pagecount": 1, "total": len(items), "limit": 36, "list": items}


# ==================== 播放 ====================
def play(params):
    play_id = str(params.get("playId") or "").strip()
    if not play_id:
        return {"parse": 1, "url": ""}

    try:
        # playId 格式：vid-1-1
        url = f"{HOST}/play/{play_id}.html"
        html = fetch_page(url)
        if not html:
            return {"parse": 1, "url": ""}

        m = re.search(r"player_aaaa\s*=\s*({.*?})</script>", html, re.S)
        if not m:
            return {"parse": 1, "url": ""}

        try:
            pd = json.loads(m.group(1))
        except:
            return {"parse": 1, "url": ""}

        play_url = pd.get("url", "")
        from_key = pd.get("from", "")

        api_map = {
            "YYNB": "https://zzrs.mfdyvip.com/player/mplayer.php",
            "JD4K": "https://fgsrg.hzqingshan.com/player/mplayer.php",
        }

        if not play_url:
            return {"parse": 0, "url": "https://php.doube.eu.org/error.m3u8",
                    "header": {"User-Agent": UA}}

        # 直链
        if play_url.startswith("http") and (play_url.endswith(".m3u8") or play_url.endswith(".mp4")):
            return {"parse": 0, "url": play_url, "header": {"User-Agent": UA}}

        # 解析
        if from_key in api_map:
            token_html = fetch_raw(f"https://fgsrg.hzqingshan.com/player/?url={urllib.parse.quote(play_url)}")
            token_m = re.search(r'data-te="(.*?)"', token_html)
            if token_m:
                token = token_m.group(1)
                headers = {
                    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                    "Referer": "https://www.ht10010.com/",
                    "Content-Type": "application/x-www-form-urlencoded",
                }
                payload = {"url": play_url, "token": token}
                rsp = requests.post(api_map[from_key], data=payload, headers=headers, timeout=15)
                result = rsp.json()
                if result.get("code") == 200 and result.get("url"):
                    return {"parse": 0, "url": result["url"],
                            "header": {"User-Agent": UA}}

        return {"parse": 1, "url": url}
    except:
        return {"parse": 1, "url": ""}


# ==================== 筛选配置 ====================
def build_filters():
    area = [
        {"n": "全部", "v": ""}, {"n": "大陆", "v": "大陆"}, {"n": "香港", "v": "香港"},
        {"n": "台湾", "v": "台湾"}, {"n": "美国", "v": "美国"}, {"n": "韩国", "v": "韩国"},
        {"n": "日本", "v": "日本"}, {"n": "泰国", "v": "泰国"}, {"n": "新加坡", "v": "新加坡"},
        {"n": "马来西亚", "v": "马来西亚"}, {"n": "印度", "v": "印度"}, {"n": "英国", "v": "英国"},
        {"n": "法国", "v": "法国"}, {"n": "加拿大", "v": "加拿大"}, {"n": "西班牙", "v": "西班牙"},
        {"n": "俄罗斯", "v": "俄罗斯"}, {"n": "其它", "v": "其它"},
    ]
    year = [
        {"n": "全部", "v": ""}, {"n": "2026", "v": "2026"}, {"n": "2025", "v": "2025"},
        {"n": "2024", "v": "2024"}, {"n": "2023", "v": "2023"}, {"n": "2022", "v": "2022"},
        {"n": "2021", "v": "2021"}, {"n": "2020", "v": "2020"}, {"n": "2019", "v": "2019"},
        {"n": "2018", "v": "2018"}, {"n": "2017", "v": "2017"}, {"n": "2016", "v": "2016"},
        {"n": "2015", "v": "2015"}, {"n": "2014", "v": "2014"}, {"n": "2013", "v": "2013"},
        {"n": "2012", "v": "2012"}, {"n": "2011", "v": "2011"}, {"n": "2010", "v": "2010"},
        {"n": "2009", "v": "2009"}, {"n": "2008", "v": "2008"}, {"n": "2007", "v": "2007"},
        {"n": "2006", "v": "2006"}, {"n": "2005", "v": "2005"}, {"n": "2004", "v": "2004"},
    ]
    lang = [
        {"n": "全部", "v": ""}, {"n": "国语", "v": "国语"}, {"n": "英语", "v": "英语"},
        {"n": "粤语", "v": "粤语"}, {"n": "闽南语", "v": "闽南语"}, {"n": "韩语", "v": "韩语"},
        {"n": "日语", "v": "日语"}, {"n": "法语", "v": "法语"}, {"n": "德语", "v": "德语"},
        {"n": "其它", "v": "其它"},
    ]
    sort = [{"n": "时间", "v": "time"}, {"n": "人气", "v": "hits"}, {"n": "评分", "v": "score"}]
    letter = [
        {"n": "全部", "v": ""}, {"n": "A", "v": "A"}, {"n": "B", "v": "B"}, {"n": "C", "v": "C"},
        {"n": "D", "v": "D"}, {"n": "E", "v": "E"}, {"n": "F", "v": "F"}, {"n": "G", "v": "G"},
        {"n": "H", "v": "H"}, {"n": "I", "v": "I"}, {"n": "J", "v": "J"}, {"n": "K", "v": "K"},
        {"n": "L", "v": "L"}, {"n": "M", "v": "M"}, {"n": "N", "v": "N"}, {"n": "O", "v": "O"},
        {"n": "P", "v": "P"}, {"n": "Q", "v": "Q"}, {"n": "R", "v": "R"}, {"n": "S", "v": "S"},
        {"n": "T", "v": "T"}, {"n": "U", "v": "U"}, {"n": "V", "v": "V"}, {"n": "W", "v": "W"},
        {"n": "X", "v": "X"}, {"n": "Y", "v": "Y"}, {"n": "Z", "v": "Z"}, {"n": "0-9", "v": "0-9"},
    ]

    tv_genres = [
        ("全部", ""), ("古装", "古装"), ("战争", "战争"), ("青春偶像", "青春偶像"),
        ("喜剧", "喜剧"), ("家庭", "家庭"), ("犯罪", "犯罪"), ("动作", "动作"),
        ("奇幻", "奇幻"), ("剧情", "剧情"), ("历史", "历史"), ("经典", "经典"),
        ("乡村", "乡村"), ("情景", "情景"), ("商战", "商战"), ("网剧", "网剧"), ("其他", "其他"),
    ]
    movie_genres = [
        ("全部", ""), ("喜剧", "喜剧"), ("爱情", "爱情"), ("恐怖", "恐怖"),
        ("动作", "动作"), ("科幻", "科幻"), ("剧情", "剧情"), ("战争", "战争"),
        ("警匪", "警匪"), ("犯罪", "犯罪"), ("动画", "动画"), ("奇幻", "奇幻"),
        ("武侠", "武侠"), ("冒险", "冒险"), ("枪战", "枪战"), ("悬疑", "悬疑"),
        ("惊悚", "惊悚"), ("经典", "经典"), ("青春", "青春"), ("文艺", "文艺"),
        ("微电影", "微电影"), ("古装", "古装"), ("历史", "历史"), ("运动", "运动"),
        ("农村", "农村"), ("儿童", "儿童"), ("网络电影", "网络电影"),
    ]
    anime_genres = [
        ("全部", ""), ("情感", "情感"), ("科幻", "科幻"), ("热血", "热血"),
        ("推理", "推理"), ("搞笑", "搞笑"), ("冒险", "冒险"), ("奇幻", "奇幻"),
        ("战斗", "战斗"), ("校园", "校园"), ("萝莉", "萝莉"), ("治愈", "治愈"),
        ("原创", "原创"), ("亲子", "亲子"), ("益智", "益智"), ("励志", "励志"), ("其他", "其他"),
    ]
    variety_genres = [
        ("全部", ""), ("选秀", "选秀"), ("情感", "情感"), ("访谈", "访谈"),
        ("播报", "播报"), ("音乐", "音乐"), ("美食", "美食"), ("旅游", "旅游"),
        ("搞笑", "搞笑"), ("游戏", "游戏"), ("亲子", "亲子"), ("其它", "其它"),
    ]

    return {
        "2": [
            {"key": "class", "name": "类型", "value": [{"n": "全部", "v": "2"}, {"n": "国产剧", "v": "13"}, {"n": "日韩剧", "v": "15"}, {"n": "海外剧", "v": "16"}]},
            {"key": "area", "name": "地区", "value": area},
            {"key": "genre", "name": "剧情", "value": [{"n": n, "v": v} for n, v in tv_genres]},
            {"key": "year", "name": "年份", "value": year},
            {"key": "lang", "name": "语言", "value": lang},
            {"key": "letter", "name": "字母", "value": letter},
            {"key": "sort", "name": "排序", "value": sort},
        ],
        "1": [
            {"key": "class", "name": "类型", "value": [{"n": "全部", "v": "1"}, {"n": "动作片", "v": "6"}, {"n": "喜剧片", "v": "7"}, {"n": "恐怖片", "v": "8"}, {"n": "科幻片", "v": "9"}, {"n": "爱情片", "v": "10"}, {"n": "剧情片", "v": "11"}, {"n": "战争片", "v": "12"}, {"n": "纪录片", "v": "20"}]},
            {"key": "area", "name": "地区", "value": area},
            {"key": "genre", "name": "剧情", "value": [{"n": n, "v": v} for n, v in movie_genres]},
            {"key": "year", "name": "年份", "value": year},
            {"key": "lang", "name": "语言", "value": lang},
            {"key": "letter", "name": "字母", "value": letter},
            {"key": "sort", "name": "排序", "value": sort},
        ],
        "4": [
            {"key": "class", "name": "类型", "value": [{"n": "全部", "v": "4"}, {"n": "国产动漫", "v": "25"}, {"n": "日韩动漫", "v": "26"}]},
            {"key": "genre", "name": "剧情", "value": [{"n": n, "v": v} for n, v in anime_genres]},
            {"key": "area", "name": "地区", "value": area[:11]},
            {"key": "year", "name": "年份", "value": year},
            {"key": "lang", "name": "语言", "value": lang},
            {"key": "letter", "name": "字母", "value": letter},
            {"key": "sort", "name": "排序", "value": sort},
        ],
        "3": [
            {"key": "class", "name": "类型", "value": [{"n": "全部", "v": "3"}, {"n": "大陆综艺", "v": "21"}, {"n": "日韩综艺", "v": "22"}]},
            {"key": "genre", "name": "剧情", "value": [{"n": n, "v": v} for n, v in variety_genres]},
            {"key": "area", "name": "地区", "value": area[:11]},
            {"key": "year", "name": "年份", "value": year},
            {"key": "lang", "name": "语言", "value": lang},
            {"key": "letter", "name": "字母", "value": letter},
            {"key": "sort", "name": "排序", "value": sort},
        ],
    }


# ==================== 入口 ====================
if __name__ == "__main__":
    run({
        "home": home,
        "category": category,
        "detail": detail,
        "search": search,
        "play": play,
    })
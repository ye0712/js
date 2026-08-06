# -*- coding: utf-8 -*-
# @name 盘链 OmniBox
# @author ye0712
# @description 盘链网盘聚合 OmniBox 源，与旧版盘链.py并存
# @indexs 1
# @version 1.1.2
# @downloadURL https://raw.githubusercontent.com/ye0712/js/main/%E7%9B%98%E9%93%BE_OmniBox.py

import base64
import json
import os
import re
import time

import requests
from spider_runner import run

requests.packages.urllib3.disable_warnings()

SITE = os.environ.get("PANLIAN_SITE", "https://pinglian.lol").rstrip("/")
LIST_API = SITE + "/api/get_videos.php"
PAN_API = SITE + "/api/search_pan_links.php"
UA = os.environ.get("PANLIAN_UA", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")
CHANNELS = {"1": "电影", "2": "电视剧", "3": "综艺", "4": "动漫"}


# 运行器通过 stdout 传输 JSON，不能在脚本中 print 日志，否则会污染首页响应。
def log(level, message):
    return None


def enc(value):
    if not isinstance(value, str):
        value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


def dec(value):
    try:
        raw = str(value) + "=" * (-len(str(value)) % 4)
        text = base64.urlsafe_b64decode(raw.encode()).decode()
        try:
            return json.loads(text)
        except Exception:
            return text
    except Exception:
        return value


def intval(value, default=1):
    try:
        return int(value)
    except Exception:
        return default


class PanLian:
    def __init__(self):
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            "User-Agent": UA,
            "Accept": "*/*",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": SITE + "/all-videos.php",
        })
        self.check_url = os.environ.get("PANCHECK_URL", "").strip()
        self.enable_check = os.environ.get("PANLIAN_ENABLE_CHECK", "0") == "1"
        cookie = os.environ.get("PANLIAN_COOKIE", "").strip()
        if cookie:
            self.session.headers.update({"Cookie": cookie})
        else:
            username = os.environ.get("PANLIAN_USERNAME", "")
            password = os.environ.get("PANLIAN_PASSWORD", "")
            if username and password:
                try:
                    self.session.post(
                        SITE + "/api/login.php",
                        data={"username": username, "password": password, "remember": "on"},
                        timeout=15,
                    )
                except Exception:
                    pass

    def get_json(self, url, params=None, method="GET", data=None):
        try:
            response = (
                self.session.post(url, params=params, data=data, timeout=15)
                if method == "POST"
                else self.session.get(url, params=params, timeout=15)
            )
            if response.status_code != 200:
                return {}
            return response.json()
        except Exception:
            return {}

    def listing(self, channel=None, keyword=None, page=1):
        params = {"pg": intval(page)}
        if keyword:
            params["wd"] = keyword
        elif channel:
            params["t"] = channel
        else:
            return {}
        data = self.get_json(LIST_API, params)
        return data if data.get("code") == 1 else {}

    def vod(self, item):
        return {
            "vod_id": enc(item),
            "vod_name": item.get("vod_name", ""),
            "vod_pic": item.get("vod_pic", ""),
            "vod_remarks": item.get("vod_remarks", "") or item.get("type_name", ""),
            "vod_year": item.get("vod_year", ""),
        }

    def pan_url(self, item):
        if not isinstance(item, dict):
            return ""
        return item.get("url", "") or (
            SITE + "/api/go.php?t=" + str(item.get("token"))
            if item.get("token")
            else ""
        )

    def pan_sources(self, name, vod_id):
        data = self.get_json(
            PAN_API,
            {"keyword": name, "vod_id": vod_id, "_t": int(time.time() * 1000)},
        )
        if not data.get("success"):
            return []
        pan = data.get("data", {}) or {}
        order = ["quark", "uc", "xunlei", "aliyun", "baidu", "115", "123", "tianyi", "others"]
        sources = []
        for disk in order + [x for x in pan if x not in order]:
            group = pan.get(disk, {})
            links = group.get("links", []) if isinstance(group, dict) else []
            episodes = []
            for item in links:
                url = self.pan_url(item)
                if not url:
                    continue
                password = item.get("password", "")
                if password and "pwd=" not in url and "password=" not in url:
                    url += ("&" if "?" in url else "?") + "pwd=" + str(password)
                title = str(item.get("title") or group.get("name") or disk)
                title = title.replace("#", "＃").replace("$", "￥")
                episodes.append({"name": title, "playId": enc(url)})
            if episodes:
                sources.append({"name": group.get("name", disk), "episodes": episodes})
        return sources

    async def home(self, params=None, context=None):
        data = self.listing(channel="1")
        return {
            "class": [{"type_id": k, "type_name": v} for k, v in CHANNELS.items()],
            "filters": {},
            "list": [self.vod(x) for x in data.get("list", [])[:12]],
        }

    async def category(self, params=None, context=None):
        params = params or {}
        channel = str(params.get("categoryId") or params.get("type_id") or "1")
        page = intval(params.get("page") or params.get("pg"))
        if channel not in CHANNELS:
            return {"page": page, "pagecount": 0, "total": 0, "list": []}
        data = self.listing(channel=channel, page=page)
        return {
            "page": page,
            "pagecount": data.get("pagecount", 0),
            "total": data.get("total", 0),
            "list": [self.vod(x) for x in data.get("list", [])],
        }

    async def search(self, params=None, context=None):
        params = params or {}
        keyword = str(params.get("keyword") or params.get("wd") or "").strip()
        page = intval(params.get("page") or params.get("pg"))
        if not keyword:
            return {"page": 1, "pagecount": 0, "total": 0, "list": []}
        data = self.listing(keyword=keyword, page=page)
        return {
            "page": page,
            "pagecount": data.get("pagecount", 0),
            "total": data.get("total", 0),
            "list": [self.vod(x) for x in data.get("list", [])],
        }

    async def detail(self, params=None, context=None):
        params = params or {}
        video_id = str(params.get("videoId") or params.get("vod_id") or params.get("id") or "")
        item = dec(video_id)
        if not isinstance(item, dict):
            return {"list": []}
        sources = self.pan_sources(item.get("vod_name", ""), item.get("vod_id", ""))
        play_from = "$$$".join(x["name"] for x in sources)
        play_url = "$$$".join(
            "#".join(e["name"] + "$" + e["playId"] for e in x["episodes"])
            for x in sources
        )
        return {
            "list": [{
                "vod_id": video_id,
                "vod_name": item.get("vod_name", ""),
                "vod_pic": item.get("vod_pic", ""),
                "vod_year": item.get("vod_year", ""),
                "vod_remarks": item.get("vod_remarks", ""),
                "vod_play_sources": sources,
                "vod_play_from": play_from,
                "vod_play_url": play_url,
            }]
        }

    async def play(self, params=None, context=None):
        params = params or {}
        play_id = str(params.get("playId") or params.get("id") or "")
        url = dec(play_id)
        if isinstance(url, dict):
            url = url.get("url", "")
        url = str(url or "")
        if not url:
            return {"urls": [], "parse": 0, "flag": "盘链"}
        return {
            "urls": [{"name": "网盘", "url": "push://" + url if url.startswith("http") else url}],
            "parse": 0,
            "flag": "盘链",
            "header": {"User-Agent": UA, "Referer": SITE + "/"},
        }


_spider = PanLian()
run({
    "home": _spider.home,
    "category": _spider.category,
    "detail": _spider.detail,
    "search": _spider.search,
    "play": _spider.play,
})

# -*- coding: utf-8 -*-
# @name 盘链 OmniBox
# @author ye0712
# @description 盘链视频源：在线m3u8播放 + 网盘资源(4K/1080P等)，网盘走SDK直接播放
# @indexs 1
# @version 2.1.0

import base64
import json
import os
import time

import requests
from spider_runner import run

try:
    from omnibox_sdk import OmniBox
except Exception:
    OmniBox = None

requests.packages.urllib3.disable_warnings()

SITE = os.environ.get("PANLIAN_SITE", "https://pinglian.lol").rstrip("/")
LIST_API = SITE + "/api/get_videos.php"
PAN_API = SITE + "/api/search_pan_links.php"
RESOLVE_API = SITE + "/api/resolve_token.php"
UA = os.environ.get("PANLIAN_UA", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")
CHANNELS = {"1": "电影", "2": "电视剧", "3": "综艺", "4": "动漫"}

# 只保留这5种网盘
PAN_ORDER = ["quark", "uc", "baidu", "123", "guangya"]
PAN_NAMES = {"quark": "夸克网盘", "uc": "UC网盘", "baidu": "百度网盘", "123": "123网盘", "guangya": "移动云盘"}

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
        self.session.headers.update({"User-Agent": UA, "Accept": "*/*", "X-Requested-With": "XMLHttpRequest", "Referer": SITE + "/all-videos.php"})
        cookie = os.environ.get("PANLIAN_COOKIE", "").strip()
        if cookie:
            self.session.headers.update({"Cookie": cookie})
        else:
            username = os.environ.get("PANLIAN_USERNAME", "")
            password = os.environ.get("PANLIAN_PASSWORD", "")
            if username and password:
                try:
                    self.session.post(SITE + "/api/login.php", data={"username": username, "password": password, "remember": "on"}, timeout=15)
                except Exception:
                    pass

    def get_json(self, url, params=None, json_body=None):
        try:
            if json_body is not None:
                r = self.session.post(url, json=json_body, timeout=15)
            else:
                r = self.session.get(url, params=params, timeout=15)
            if r.status_code != 200:
                return {}
            return r.json()
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
        return {"vod_id": enc(item), "vod_name": item.get("vod_name", ""), "vod_pic": item.get("vod_pic", ""), "vod_remarks": item.get("vod_remarks", "") or item.get("type_name", ""), "vod_year": item.get("vod_year", "")}

    def build_online_sources(self, item):
        play_from = str(item.get("vod_play_from") or "")
        play_url = str(item.get("vod_play_url") or "")
        from_list = [x for x in play_from.split("$$$") if x]
        url_list = [x for x in play_url.split("$$$") if x]
        sources = []
        for i, pf in enumerate(from_list):
            pv = url_list[i] if i < len(url_list) else ""
            episodes = []
            for seg in str(pv).split("#"):
                seg = seg.strip()
                if not seg:
                    continue
                parts = seg.split("$", 1)
                name = parts[0].strip() if len(parts) > 1 else "播放"
                url = parts[1].strip() if len(parts) > 1 else parts[0].strip()
                if not url:
                    continue
                name = name.replace("#", "＃").replace("$", "￥")
                episodes.append({"name": name, "playId": enc({"type": "online", "url": url})})
            if episodes:
                sources.append({"name": pf or "在线播放", "episodes": episodes})
        return sources

    def resolve_token(self, token):
        data = self.get_json(RESOLVE_API, json_body={"token": token})
        if data.get("success"):
            return data.get("url", "")
        return ""

    def build_pan_sources(self, name, vod_id):
        data = self.get_json(PAN_API, {"keyword": name, "vod_id": vod_id, "_t": int(time.time() * 1000)})
        if not data.get("success"):
            return []
        pan = data.get("data", {}) or {}
        sources = []
        for disk in PAN_ORDER:
            if disk not in pan:
                continue
            group = pan.get(disk, {})
            if not isinstance(group, dict):
                continue
            links = group.get("links", [])
            if not links:
                continue
            episodes = []
            for item in links:
                token = item.get("token", "")
                if not token:
                    continue
                title = str(item.get("title") or PAN_NAMES.get(disk, disk))
                title = title.replace("#", "＃").replace("$", "￥")
                episodes.append({"name": title, "playId": enc({"type": "pan", "token": token, "password": item.get("password", ""), "title": title})})
            if episodes:
                sources.append({"name": PAN_NAMES.get(disk, disk), "episodes": episodes})
        return sources

    async def home(self, params=None, context=None):
        data = self.listing(channel="1")
        return {"class": [{"type_id": k, "type_name": v} for k, v in CHANNELS.items()], "filters": {}, "list": [self.vod(x) for x in data.get("list", [])[:12]]}

    async def category(self, params=None, context=None):
        params = params or {}
        channel = str(params.get("categoryId") or params.get("type_id") or "1")
        page = intval(params.get("page") or params.get("pg"))
        if channel not in CHANNELS:
            return {"page": page, "pagecount": 0, "total": 0, "list": []}
        data = self.listing(channel=channel, page=page)
        return {"page": page, "pagecount": data.get("pagecount", 0), "total": data.get("total", 0), "list": [self.vod(x) for x in data.get("list", [])]}

    async def search(self, params=None, context=None):
        params = params or {}
        keyword = str(params.get("keyword") or params.get("wd") or "").strip()
        page = intval(params.get("page") or params.get("pg"))
        if not keyword:
            return {"page": 1, "pagecount": 0, "total": 0, "list": []}
        data = self.listing(keyword=keyword, page=page)
        return {"page": page, "pagecount": data.get("pagecount", 0), "total": data.get("total", 0), "list": [self.vod(x) for x in data.get("list", [])]}

    async def detail(self, params=None, context=None):
        params = params or {}
        video_id = str(params.get("videoId") or params.get("vod_id") or params.get("id") or "")
        item = dec(video_id)
        if not isinstance(item, dict):
            return {"list": []}
        vod_name = item.get("vod_name", "")
        vod_id_str = str(item.get("vod_id", ""))
        sources = self.build_online_sources(item)
        pan_sources = self.build_pan_sources(vod_name, vod_id_str)
        sources.extend(pan_sources)
        play_from = "$$$".join(x["name"] for x in sources)
        play_url = "$$$".join("#".join(e["name"] + "$" + e["playId"] for e in x["episodes"]) for x in sources)
        return {"list": [{"vod_id": video_id, "vod_name": vod_name, "vod_pic": item.get("vod_pic", ""), "vod_year": item.get("vod_year", ""), "vod_remarks": item.get("vod_remarks", ""), "vod_actor": item.get("vod_actor", ""), "vod_director": item.get("vod_director", ""), "vod_content": item.get("vod_content", ""), "vod_area": item.get("vod_area", ""), "vod_lang": item.get("vod_lang", ""), "type_name": item.get("type_name", ""), "vod_play_sources": sources, "vod_play_from": play_from, "vod_play_url": play_url}]}

    async def play(self, params=None, context=None):
        params = params or {}
        play_id = str(params.get("playId") or params.get("id") or "")
        data = dec(play_id)
        if not isinstance(data, dict):
            return {"urls": [], "parse": 0, "flag": "盘链"}
        ptype = data.get("type", "")
        if ptype == "online":
            url = data.get("url", "")
            if not url:
                return {"urls": [], "parse": 0, "flag": "盘链"}
            return {"urls": [{"name": "在线播放", "url": url}], "parse": 0, "flag": "盘链", "header": {"User-Agent": UA, "Referer": SITE + "/"}}
        elif ptype == "pan":
            token = data.get("token", "")
            if not token:
                return {"urls": [], "parse": 0, "flag": "盘链"}
            real_url = self.resolve_token(token)
            if not real_url:
                return {"urls": [], "parse": 0, "flag": "盘链"}
            title = data.get("title", "网盘")
            # 用SDK直接播放，不走push
            if OmniBox:
                try:
                    drive_info = OmniBox.getDriveInfoByShareURL(real_url)
                    if drive_info:
                        play_info = OmniBox.getDriveVideoPlayInfo(drive_info)
                        if play_info and play_info.get("url"):
                            return {"urls": [{"name": title, "url": play_info["url"]}], "parse": 0, "flag": "盘链", "header": play_info.get("header", {})}
                except Exception:
                    pass
            # SDK失败回退push
            return {"urls": [{"name": title, "url": "push://" + real_url}], "parse": 0, "flag": "盘链", "header": {"User-Agent": UA, "Referer": SITE + "/"}}
        return {"urls": [], "parse": 0, "flag": "盘链"}

_spider = PanLian()
run({"home": _spider.home, "category": _spider.category, "detail": _spider.detail, "search": _spider.search, "play": _spider.play})

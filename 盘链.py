# -*- coding: utf-8 -*-
# @name 盘链 OmniBox
# @author ye0712
# @description 盘链网盘聚合源：支持分类、搜索、网盘链接与可选链接检测
# @indexs 1
# @version 1.1.0
# @downloadURL https://raw.githubusercontent.com/ye0712/js/main/%E7%9B%98%E9%93%BE.py

import base64
import json
import os
import re
import time

import requests
from spider_runner import OmniBox, run


SITE = os.environ.get("PANLIAN_SITE", "https://pinglian.lol").rstrip("/")
LIST_API = SITE + "/api/get_videos.php"
PAN_API = SITE + "/api/search_pan_links.php"

UA = os.environ.get(
    "PANLIAN_UA",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
)

CHANNELS = {
    "1": "电影",
    "2": "电视剧",
    "3": "综艺",
    "4": "动漫",
}


def _log(level, message):
    try:
        OmniBox.log(level, "[panlian] " + str(message))
    except Exception:
        print("[panlian][%s] %s" % (level, message))


def _b64_encode(value):
    if not isinstance(value, str):
        value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def _b64_decode(value):
    try:
        raw = str(value) + "=" * (-len(str(value)) % 4)
        text = base64.urlsafe_b64decode(raw.encode("ascii")).decode("utf-8")
        try:
            return json.loads(text)
        except Exception:
            return text
    except Exception:
        return value


def _safe_text(value):
    return str(value or "").replace("#", "＃").replace("$", "￥")


def _safe_int(value, default=1):
    try:
        return int(value)
    except Exception:
        return default


class PanLianSpider:
    def __init__(self):
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            "User-Agent": UA,
            "Accept": "*/*",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": SITE + "/all-videos.php",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        })
        self.check_url = os.environ.get("PANCHECK_URL", "").strip()
        self.username = os.environ.get("PANLIAN_USERNAME", "")
        self.password = os.environ.get("PANLIAN_PASSWORD", "")
        self.cookie = os.environ.get("PANLIAN_COOKIE", "")
        self.enable_check = os.environ.get("PANLIAN_ENABLE_CHECK", "0") == "1"

        if self.cookie:
            self.session.headers.update({"Cookie": self.cookie})
        elif self.username and self.password:
            self._login()

    def _request_json(self, url, params=None, method="GET", data=None):
        try:
            _log("info", "请求 %s" % url)
            if method == "POST":
                response = self.session.post(url, params=params, data=data, timeout=15)
            else:
                response = self.session.get(url, params=params, timeout=15)
            if response.status_code != 200:
                _log("error", "HTTP %s: %s" % (response.status_code, url))
                return {}
            return response.json()
        except Exception as exc:
            _log("error", "请求失败 %s: %s" % (url, exc))
            return {}

    def _login(self):
        try:
            self.session.get(SITE + "/pages/login.php", timeout=12)
            data = self._request_json(
                SITE + "/api/login.php",
                method="POST",
                data={
                    "username": self.username,
                    "password": self.password,
                    "remember": "on",
                },
            )
            _log("info", "登录结果 success=%s" % bool(data.get("success")))
        except Exception as exc:
            _log("error", "登录失败: %s" % exc)

    def _list(self, channel=None, keyword=None, page=1):
        params = {"pg": _safe_int(page)}
        if keyword:
            params["wd"] = keyword
        elif channel:
            params["t"] = channel
        else:
            return {"list": [], "page": 1, "pagecount": 0, "total": 0}

        data = self._request_json(LIST_API, params=params)
        if data.get("code") != 1:
            return {"list": [], "page": params["pg"], "pagecount": 0, "total": 0}
        return {
            "list": data.get("list", []) or [],
            "page": data.get("page", params["pg"]),
            "pagecount": data.get("pagecount", 1),
            "total": data.get("total", 0),
        }

    def _vod(self, item):
        return {
            "vod_id": _b64_encode(item),
            "vod_name": item.get("vod_name", ""),
            "vod_pic": item.get("vod_pic", ""),
            "vod_remarks": item.get("vod_remarks", "") or item.get("type_name", ""),
            "vod_year": item.get("vod_year", ""),
            "type_name": item.get("type_name", ""),
        }

    def _pan_url(self, item):
        if not isinstance(item, dict):
            return ""
        return item.get("url", "") or (
            SITE + "/api/go.php?t=" + str(item.get("token", ""))
            if item.get("token") else ""
        )

    def _check_links(self, links, disk_type):
        if not self.enable_check or not self.check_url or not links:
            return links
        try:
            response = requests.post(
                self.check_url,
                json={"items": [{"disk_type": disk_type, "url": x} for x in links]},
                headers={"User-Agent": UA, "Accept": "application/json"},
                timeout=15,
                verify=False,
            )
            data = response.json()
            valid = [
                x.get("url", "") for x in data.get("results", [])
                if x.get("state") == "ok" and x.get("url")
            ]
            return valid or links
        except Exception as exc:
            _log("error", "PanCheck 失败，保留原链接: %s" % exc)
            return links

    def _make_source(self, disk_type, payload):
        links = payload.get("links", []) if isinstance(payload, dict) else []
        raw = []
        seen = set()
        for item in links:
            url = self._pan_url(item)
            if url and url not in seen:
                seen.add(url)
                raw.append(url)
        if not raw:
            return None

        valid = self._check_links(raw, disk_type)
        valid_set = set(valid)
        episodes = []
        for item in links:
            url = self._pan_url(item)
            if url not in valid_set:
                continue
            password = item.get("password", "") if isinstance(item, dict) else ""
            if password and "pwd=" not in url and "password=" not in url:
                url += ("&" if "?" in url else "?") + "pwd=" + str(password)
            title = _safe_text(item.get("title") or payload.get("name") or disk_type)
            episodes.append({
                "name": title,
                "playId": _b64_encode(url),
            })
        if not episodes:
            return None
        return {
            "name": payload.get("name", disk_type),
            "episodes": episodes,
        }

    def _pan_sources(self, name, video_id):
        data = self._request_json(
            PAN_API,
            params={"keyword": name, "vod_id": video_id, "_t": int(time.time() * 1000)},
        )
        if not data.get("success"):
            return []
        pan = data.get("data", {}) or {}
        order = ["quark", "uc", "xunlei", "aliyun", "baidu", "115", "123", "tianyi", "others"]
        keys = [x for x in order if x in pan] + [x for x in pan if x not in order]
        sources = []
        for disk_type in keys:
            source = self._make_source(disk_type, pan[disk_type])
            if source:
                source["name"] = source["name"] or disk_type
                sources.append(source)
        _log("info", "网盘线路 %s 条" % len(sources))
        return sources

    def home(self, params=None, context=None):
        _log("info", "[home] params=%s" % (params or {}))
        classes = [{"type_id": key, "type_name": name} for key, name in CHANNELS.items()]
        result = self._list(channel="1", page=1)
        return {"class": classes, "filters": {}, "list": [self._vod(x) for x in result["list"][:12]]}

    def category(self, params=None, context=None):
        params = params or {}
        channel = str(params.get("categoryId") or params.get("type_id") or "1")
        page = _safe_int(params.get("page") or params.get("pg"), 1)
        _log("info", "[category] channel=%s page=%s" % (channel, page))
        if channel not in CHANNELS:
            return {"page": page, "pagecount": 0, "total": 0, "list": []}
        result = self._list(channel=channel, page=page)
        return {
            "page": page,
            "pagecount": result["pagecount"],
            "total": result["total"],
            "list": [self._vod(x) for x in result["list"]],
        }

    def search(self, params=None, context=None):
        params = params or {}
        keyword = str(params.get("keyword") or params.get("wd") or "").strip()
        page = _safe_int(params.get("page") or params.get("pg"), 1)
        _log("info", "[search] keyword=%s page=%s" % (keyword, page))
        if not keyword:
            return {"page": 1, "pagecount": 0, "total": 0, "list": []}
        result = self._list(keyword=keyword, page=page)
        return {
            "page": page,
            "pagecount": result["pagecount"],
            "total": result["total"],
            "list": [self._vod(x) for x in result["list"]],
        }

    def detail(self, params=None, context=None):
        params = params or {}
        encoded = str(params.get("videoId") or params.get("vod_id") or params.get("id") or "")
        item = _b64_decode(encoded)
        _log("info", "[detail] videoId=%s" % encoded[:80])
        if not isinstance(item, dict):
            return {"list": []}

        name = item.get("vod_name", "")
        sources = []
        own_from = item.get("vod_play_from", "")
        own_url = item.get("vod_play_url", "")
        if own_from and own_url:
            sources.append({
                "name": own_from,
                "episodes": [{"name": "资源", "playId": _b64_encode(own_url)}],
            })
        if name:
            sources.extend(self._pan_sources(name, item.get("vod_id", "")))

        play_from = []
        play_url = []
        for source in sources:
            play_from.append(source["name"])
            play_url.append("#".join(
                ep["name"] + "$" + ep["playId"] for ep in source["episodes"]
            ))

        vod = {
            "vod_id": encoded,
            "vod_name": name,
            "vod_pic": item.get("vod_pic", ""),
            "vod_year": item.get("vod_year", ""),
            "vod_remarks": item.get("vod_remarks", ""),
            "vod_play_sources": sources,
            "vod_play_from": "$$$".join(play_from),
            "vod_play_url": "$$$".join(play_url),
        }
        return {"list": [vod]}

    def play(self, params=None, context=None):
        params = params or {}
        play_id = str(params.get("playId") or params.get("id") or "")
        _log("info", "[play] playId=%s" % play_id[:80])
        if not play_id or play_id == "noop":
            return {"urls": [], "parse": 0, "flag": "盘链"}

        url = _b64_decode(play_id)
        if isinstance(url, dict):
            url = url.get("url", "")
        url = str(url or "")
        if not url:
            return {"urls": [], "parse": 0, "flag": "盘链"}

        if url.startswith("magnet:"):
            return {"urls": [{"name": "磁力", "url": url}], "parse": 0, "flag": "盘链"}

        # 网盘分享页交由客户端或宿主继续处理；直链则直接播放。
        direct = bool(re.search(r"\.(m3u8|mp4|flv|ts)(?:\?|$)", url, re.I))
        if direct:
            return {"urls": [{"name": "直链", "url": url}], "parse": 0, "flag": "盘链", "header": {"User-Agent": UA}}
        return {
            "urls": [{"name": "网盘", "url": "push://" + url if url.startswith("http") else url}],
            "parse": 0,
            "flag": "盘链",
            "header": {"User-Agent": UA, "Referer": SITE + "/"},
        }


_spider = PanLianSpider()
module = {
    "home": _spider.home,
    "category": _spider.category,
    "detail": _spider.detail,
    "search": _spider.search,
    "play": _spider.play,
}
run(module)

# -*- coding: utf-8 -*-
# @name: YouTube
# @version: 1.3.0
# @remark: YouTube 官方 InnerTube API 源（搜索/分类/播放），内置代理，支持 Cookie 登录
# 数据走 YouTube 官方 API，播放用 ANDROID_VR 客户端 + visitorData 取单流 mp4
# 内置代理 http://172.17.0.1:8080（ATV 容器访问宿主机 mihomo HTTP 代理）
# 支持 extend 传 {"cookie":"SAPISID=...; PSID=...; ..."} 登录同步观看记录/历史

import requests, json, re, time, hashlib
from base.spider import Spider as BaseSpider

requests.packages.urllib3.disable_warnings(requests.packages.urllib3.exceptions.InsecureRequestWarning)

class Spider(BaseSpider):
    def init(self, extend=""):
        self.YT = "https://www.youtube.com"
        self.API = self.YT + "/youtubei/v1/"
        self.KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"  # YouTube Web 公开 key
        self.UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        # 内置代理：ATV 容器(bridge)访问宿主机 mihomo HTTP 代理
        # extend 传 {"proxy":"http://ip:port"} 可覆盖
        self.PROXY = {"http": "http://172.17.0.1:8080", "https": "http://172.17.0.1:8080"}
        self.visitor = ""  # visitorData 缓存
        # Cookie 登录（同步观看记录/历史）
        self.cookie = ""
        self.auth_on = False
        self.channels = [
            {"type_id": "rec", "type_name": "推荐"},
            {"type_id": "4k", "type_name": "臻彩"},
            {"type_id": "live", "type_name": "直播"},
            {"type_id": "music", "type_name": "音乐"},
            {"type_id": "movie", "type_name": "影视"},
            {"type_id": "news", "type_name": "新闻"},
            {"type_id": "explore", "type_name": "探索"},
            {"type_id": "travel", "type_name": "旅行"},
        ]
        self.cat_query = {
            "4k": "4K 电影", "live": "直播", "music": "音乐 MV",
            "movie": "电影 解说", "news": "时政 新闻",
            "explore": "探索 奇闻 纪录片", "travel": "露营 野营 旅行",
        }
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({"User-Agent": self.UA, "Accept-Language": "zh-CN"})
        if extend:
            try:
                cfg = json.loads(extend)
                if isinstance(cfg, dict):
                    if cfg.get("proxy"):
                        self.PROXY = {"http": cfg["proxy"], "https": cfg["proxy"]}
                    if cfg.get("cookie"):
                        self.cookie = cfg["cookie"]
                        self.auth_on = True
            except Exception:
                pass

    def getName(self):
        return "YouTube"

    def destroy(self):
        self.session.close()

    # ---------- Cookie 登录（SAPISIDHASH 签名） ----------
    def _sha1(self, msg):
        return hashlib.sha1(msg.encode()).hexdigest()

    def _sapisid(self):
        s = self.cookie or ""
        m = re.search(r"(?:^|;\s*)SAPISID=([^;]+)", s) or \
            re.search(r"(?:^|;\s*)__Secure-3PAPISID=([^;]+)", s) or \
            re.search(r"(?:^|;\s*)__Secure-1PAPISID=([^;]+)", s)
        return m.group(1) if m else ""

    def _auth_headers(self):
        if not self.auth_on or not self.cookie:
            return {}
        h = {"Cookie": self.cookie}
        sid = self._sapisid()
        if sid:
            ts = int(time.time())
            h["Authorization"] = "SAPISIDHASH " + str(ts) + "_" + self._sha1(str(ts) + " " + sid + " " + self.YT)
            h["X-Origin"] = self.YT
            h["X-Goog-AuthUser"] = "0"
        return h

    # ---------- 请求 ----------
    def _req(self, url, method="GET", body=None, headers=None, timeout=15):
        h = {"User-Agent": self.UA, "Accept-Language": "zh-CN"}
        if headers:
            h.update(headers)
        try:
            if method == "POST":
                return self.session.post(url, json=body, headers=h, timeout=timeout, proxies=self.PROXY)
            return self.session.get(url, headers=h, timeout=timeout, proxies=self.PROXY)
        except Exception:
            return None

    def _innertube(self, endpoint, payload):
        body = {"context": {"client": {
            "clientName": "WEB", "clientVersion": "2.20260801.00.00",
            "hl": "zh-CN", "gl": "US", "userAgent": self.UA
        }}}
        body.update(payload)
        headers = {
            "Content-Type": "application/json", "Origin": self.YT, "Referer": self.YT + "/",
            "X-YouTube-Client-Name": "1", "X-YouTube-Client-Version": "2.20260801.00.00"
        }
        headers.update(self._auth_headers())  # 登录态
        r = self._req(self.API + endpoint + "?key=" + self.KEY + "&prettyPrint=false", "POST", body, headers)
        if not r or r.status_code != 200:
            return None
        try:
            return r.json()
        except Exception:
            return None

    # ---------- visitorData（抓 embed 页面） ----------
    def _get_visitor(self, video_id):
        if self.visitor:
            return self.visitor
        try:
            r = self._req(self.YT + "/embed/" + video_id, timeout=10)
            if r and r.status_code == 200:
                m = re.search(r'"visitorData":"([^"]+)"', r.text)
                if m:
                    self.visitor = m.group(1)
                    return self.visitor
        except Exception:
            pass
        return ""

    # ---------- 解析 ----------
    def _text(self, node):
        if not node:
            return ""
        if isinstance(node, str):
            return node
        if node.get("simpleText"):
            return node["simpleText"]
        runs = node.get("runs")
        if runs:
            return "".join(x.get("text", "") for x in runs)
        return ""

    def _collect(self, node, keys, out, depth=0):
        if not node or depth > 40:
            return out
        if isinstance(node, list):
            for i in node:
                self._collect(i, keys, out, depth + 1)
            return out
        if not isinstance(node, dict):
            return out
        for k, v in node.items():
            if k in keys and isinstance(v, dict):
                out.append(v)
            self._collect(v, keys, out, depth + 1)
        return out

    def _thumb(self, vid):
        return "https://i.ytimg.com/vi/" + vid + "/mqdefault.jpg"

    def _safe(self, t):
        return str(t or "").replace("#", "＃").replace("$", "￥")

    def _vod(self, r):
        vid = r.get("videoId")
        if not vid:
            return None
        return {
            "vod_id": vid,
            "vod_name": self._safe(self._text(r.get("title")) or "YouTube"),
            "vod_pic": self._thumb(vid),
            "vod_remarks": self._safe(self._text(r.get("lengthText")) or ""),
            "vod_actor": self._safe(self._text(r.get("ownerText")) or self._text(r.get("longBylineText")) or ""),
            "vod_content": self._safe(self._text(r.get("publishedTimeText")) or ""),
        }

    def _parse_items(self, json):
        out, seen = [], set()
        vids = self._collect(json, ["videoRenderer", "compactVideoRenderer", "gridVideoRenderer"], [])
        for r in vids:
            v = self._vod(r)
            if v and v["vod_id"] not in seen:
                seen.add(v["vod_id"])
                out.append(v)
        return out

    # ---------- 播放解析（ANDROID_VR + visitorData → 单流 mp4） ----------
    def _resolve(self, video_id):
        visitor = self._get_visitor(video_id)
        client = {
            "clientName": "ANDROID_VR", "clientVersion": "1.65.10",
            "deviceMake": "Oculus", "deviceModel": "Quest 3",
            "androidSdkVersion": 32, "osName": "Android", "osVersion": "12L"
        }
        if visitor:
            client["visitorData"] = visitor
        body = {
            "videoId": video_id,
            "context": {"client": client},
            "contentCheckOk": True, "racyCheckOk": True
        }
        headers = {
            "Content-Type": "application/json", "User-Agent": self.UA,
            "Origin": self.YT, "Referer": self.YT + "/watch?v=" + video_id,
            "X-YouTube-Client-Name": "28", "X-YouTube-Client-Version": "1.65.10"
        }
        if visitor:
            headers["X-Goog-Visitor-Id"] = visitor
        r = self._req(self.API + "player?key=" + self.KEY + "&prettyPrint=false", "POST", body, headers)
        if not r or r.status_code != 200:
            return None
        try:
            j = r.json()
        except Exception:
            return None
        sd = j.get("streamingData") or {}
        # 优先单流 mp4（带音轨，ATV 直接播）
        for f in sd.get("formats") or []:
            if f.get("url") and "video" in (f.get("mimeType") or ""):
                return f["url"]
        # 兜底 HLS
        hls = sd.get("hlsManifestUrl")
        if hls:
            return hls
        return None

    # ---------- 接口 ----------
    def homeContent(self, filter):
        return {"class": self.channels, "list": [], "filters": {}}

    def homeVideoContent(self):
        j = self._innertube("browse", {"browseId": "FEwhat_to_watch"})
        items = self._parse_items(j) if j else []
        return {"list": items[:12]}

    def categoryContent(self, tid, pg, filter, extend):
        query = self.cat_query.get(tid)
        if tid == "rec":
            j = self._innertube("browse", {"browseId": "FEwhat_to_watch"})
        elif query:
            j = self._innertube("search", {"query": query, "params": "CAI="})
        else:
            j = self._innertube("search", {"query": "trending"})
        items = self._parse_items(j) if j else []
        return {"list": items, "page": 1, "pagecount": 1, "limit": 30, "total": len(items)}

    def searchContent(self, key, quick, pg="1"):
        if not key:
            return {"list": [], "page": 1, "pagecount": 0, "limit": 30, "total": 0}
        j = self._innertube("search", {"query": key})
        items = self._parse_items(j) if j else []
        return {"list": items, "page": 1, "pagecount": 1, "limit": 30, "total": len(items)}

    def detailContent(self, ids):
        vid = ids[0]
        url = self._resolve(vid)
        if not url:
            return {"list": []}
        return {"list": [{
            "vod_id": vid,
            "vod_name": "YouTube",
            "vod_play_from": "YouTube",
            "vod_play_url": "播放$" + url,
        }]}

    def playerContent(self, flag, id, vipFlags):
        if not id:
            return {"parse": 0, "jx": 0, "url": ""}
        return {"parse": 0, "jx": 0, "url": id}

    def localProxy(self, param=""):
        return {}

    def isVideoFormat(self, url):
        return False

    def manualVideoCheck(self):
        return False

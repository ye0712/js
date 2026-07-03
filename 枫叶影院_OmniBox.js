
const axios = require('axios');
const cheerio = require('cheerio');

// OmniBox Spider 基础结构
const spider = {
    name: '枫叶影院',
    host: 'https://maihaolian.com',
    headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    
    // 首页分类
    home: function() {
        const classes = [
            { 'type_id': '/label/qq', 'type_name': '腾讯VIP精选' },
            { 'type_id': '/label/bli', 'type_name': 'B站VIP精选' },
            { 'type_id': '/label/youku', 'type_name': '优酷VIP精选' },
            { 'type_id': '5', 'type_name': '红果短剧' },
            { 'type_id': '2', 'type_name': '电视剧' },
            { 'type_id': '1', 'type_name': '电影' },
            { 'type_id': '4', 'type_name': '动漫' },
            { 'type_id': '3', 'type_name': '综艺' },
        ];
        
        const filters = this.buildFilters();
        
        return {
            'class': classes,
            'filters': filters
        };
    },
    
    // 首页推荐视频
    homeVideo: function() {
        // 首页推荐通常调用分类列表的第一页，或者单独抓取首页
        // 这里简单复用 categoryContent，取电影首页
        return this.category('1', 1, true, {});
    },
    
    // 分类列表
    category: function(tid, page, filter, ext) {
        let url = '';
        let html = '';
        
        // 处理特殊标签路径
        if (tid.startsWith('/label')) {
            url = this.host + tid + '/page/' + page + '.html';
            html = this.fetchHtml(url);
            return this.parseList(html, page);
        }
        
        // 构建筛选参数
        let args = {};
        if (ext && typeof ext === 'object') {
            for (let k in ext) {
                if (ext[k]) args[k] = String(ext[k]);
            }
        }
        
        let routeTid = args['class'] || args['tid'] || tid;
        let area = args['area'] || '';
        let sort = args['sort'] || '';
        let genre = args['genre'] || '';
        let lang = args['lang'] || '';
        let letter = args['letter'] || '';
        let year = args['year'] || '';
        
        // 无筛选：标准分页
        if (!area && !sort && !genre && !lang && !letter && !year) {
            url = this.host + '/cupfox-list/' + routeTid + '--------' + page + '---.html';
        } else {
            // 有筛选：构造特定路径
            // 格式: /cupfox-list/{tid}-{area}-{sort}-{genre}-{lang}-{letter}------{year}.html
            let segs = [routeTid, area, sort, genre, lang, letter, '', '', year];
            url = this.host + '/cupfox-list/' + segs.join('-') + '.html';
        }
        
        html = this.fetchHtml(url);
        return this.parseList(html, page);
    },
    
    // 解析列表
    parseList: function(html, page) {
        const $ = cheerio.load(html);
        const videos = [];
        const seen = new Set();
        
        $('a.public-list-exp').each((i, elem) => {
            const a = $(elem);
            const href = a.attr('href') || '';
            
            // 提取 vod_id
            const match = href.match(/\/detail\/(\d+)\.html/);
            if (!match) return;
            
            const vodId = match[1];
            if (seen.has(vodId)) return;
            seen.add(vodId);
            
            const title = a.attr('title') || '';
            const img = a.find('img').attr('data-src') || '';
            const remarks = a.find('.ft2, .public-list-prb').first().text().trim();
            const spans = a.find('span.public-prt');
            let spanText = '';
            spans.each((j, s) => {
                spanText += $(s).text().trim() + ',';
            });
            
            if (title) {
                videos.push({
                    'vod_id': vodId,
                    'vod_name': title.trim(),
                    'vod_pic': this.fixPic(img),
                    'vod_remarks': remarks,
                    'vod_year': spanText.trim().replace(/,$/, '')
                });
            }
        });
        
        // 计算总页数
        let pageCount = page;
        const lastPageLink = $('a.page-link').filter((i, elem) => {
            return $(elem).text() === '尾页';
        }).first();
        
        if (lastPageLink.length) {
            const href = lastPageLink.attr('href') || '';
            const m = href.match(/---(\d+)---/);
            if (m) pageCount = parseInt(m[1]);
        }
        
        return {
            'list': videos,
            'page': page,
            'pagecount': pageCount,
            'limit': 36,
            'total': pageCount * 36
        };
    },
    
    // 详情
    detail: function(ids) {
        const vid = ids[0];
        const url = this.host + '/detail/' + vid + '.html';
        const html = this.fetchHtml(url);
        
        if (!html) {
            return { 'list': [{ 'vod_id': vid, 'vod_name': '未知', 'vod_remarks': '获取详情失败' }] };
        }
        
        const $ = cheerio.load(html);
        
        const vodName = $('h3.slide-info-title').first().text().trim();
        const vodPic = this.fixPic($('img.lazy').first().attr('data-src') || '');
        
        let vodDirector = '';
        let vodActor = '';
        $('.slide-info').each((i, elem) => {
            const text = $(elem).text().trim();
            if (text.startsWith('导演：')) vodDirector = text.replace('导演：', '').trim();
            if (text.startsWith('演员：')) vodActor = text.replace('演员：', '').trim();
        });
        
        const vodContent = $('#height_limit').first().text().trim();
        
        // 播放源
        const playFrom = [];
        const playUrl = [];
        
        $('.anthology-tab a.swiper-slide').each((i, elem) => {
            const name = $(elem).text().trim();
            if (name) playFrom.push(name);
        });
        
        $('.anthology-list-box').each((i, block) => {
            const eps = [];
            $(block).find('li a').each((j, a) => {
                const href = $(a).attr('href') || '';
                const m = href.match(/\/play\/(.*?)\.html/);
                if (m) {
                    const epName = $(a).text().trim();
                    eps.push(epName + '$' + vid + '-' + m[1]);
                }
            });
            eps.reverse();
            if (eps.length > 0 && i < playFrom.length) {
                playUrl.push(eps.join('#'));
            }
        });
        
        // 过滤空的播放源
        const validFrom = [];
        const validUrl = [];
        for (let i = 0; i < playFrom.length; i++) {
            if (playFrom[i] && playUrl[i]) {
                validFrom.push(playFrom[i]);
                validUrl.push(playUrl[i]);
            }
        }
        
        return {
            'list': [{
                'vod_id': vid,
                'vod_name': vodName,
                'vod_pic': vodPic,
                'vod_director': vodDirector,
                'vod_actor': vodActor,
                'vod_content': vodContent,
                'vod_play_from': validFrom.join('$$$'),
                'vod_play_url': validUrl.join('$$$')
            }]
        };
    },
    
    // 搜索
    search: function(w, quick, pg) {
        pg = pg || 1;
        const url = this.host + '/cupfox-search/' + encodeURIComponent(w) + '----------' + pg + '---.html';
        const html = this.fetchHtml(url);
        
        if (!html) return { 'list': [], 'page': pg, 'pagecount': 1 };
        
        return this.parseList(html, pg);
    },
    
    // 播放
    play: function(flag, id, flags) {
        // id 格式: vid-playNum
        // 如果 id 已经是 http 开头，直接返回
        if (id.startsWith('http')) {
            return { 'parse': 0, 'url': id };
        }
        
        // 构造播放页 URL
        const playUrl = this.host + '/play/' + id + '.html';
        const html = this.fetchHtml(playUrl);
        
        if (!html) {
            return { 'parse': 1, 'url': playUrl }; // 尝试使用内置解析
        }
        
        // 提取 player_aaaa 脚本中的 JSON
        const match = html.match(/player_aaaa=(.*?)<\/script>/s);
        if (match) {
            try {
                const pd = JSON.parse(match[1]);
                const playUrlRaw = pd.url || '';
                
                if (!playUrlRaw) {
                    return { 'parse': 0, 'url': 'https://php.doube.eu.org/error.m3u8', 'header': { 'User-Agent': this.headers['User-Agent'] } };
                }
                
                // 如果直接是 m3u8 或 mp4，直接返回
                if (playUrlRaw.startsWith('http') && (playUrlRaw.endsWith('.m3u8') || playUrlRaw.endsWith('.mp4'))) {
                    return { 'parse': 0, 'url': playUrlRaw, 'header': { 'User-Agent': this.headers['User-Agent'] } };
                }
                
                // 否则，可能需要二次解析或代理
                // 这里简化处理：返回解析标志，让 OmniBox 尝试解析，或者返回 playUrlRaw 给外部解析器
                // 原 Python 代码中有复杂的 token 获取逻辑，这里为了稳定性，先尝试直接返回
                // 如果失败，用户可以配置 OmniBox 的解析接口
                
                return { 'parse': 1, 'url': playUrlRaw };
                
            } catch (e) {
                console.error('JSON Parse Error:', e);
            }
        }
        
        return { 'parse': 1, 'url': playUrl };
    },
    
    // 辅助函数
    fetchHtml: function(url) {
        try {
            const response = axios.get(url, {
                headers: this.headers,
                timeout: 10000,
                responseType: 'text'
            });
            return response.data;
        } catch (e) {
            console.error('Fetch Error:', e.message);
            return '';
        }
    },
    
    fixPic: function(u) {
        if (!u) return '';
        if (u.startsWith('//')) return 'https:' + u;
        return u.replace(/&amp;/g, '&');
    },
    
    buildFilters: function() {
        const area = [
            { 'n': '全部', 'v': '' }, { 'n': '大陆', 'v': '大陆' }, { 'n': '香港', 'v': '香港' },
            { 'n': '台湾', 'v': '台湾' }, { 'n': '美国', 'v': '美国' }, { 'n': '韩国', 'v': '韩国' },
            { 'n': '日本', 'v': '日本' }, { 'n': '泰国', 'v': '泰国' }, { 'n': '新加坡', 'v': '新加坡' },
            { 'n': '马来西亚', 'v': '马来西亚' }, { 'n': '印度', 'v': '印度' }, { 'n': '英国', 'v': '英国' },
            { 'n': '法国', 'v': '法国' }, { 'n': '加拿大', 'v': '加拿大' }, { 'n': '西班牙', 'v': '西班牙' },
            { 'n': '俄罗斯', 'v': '俄罗斯' }, { 'n': '其它', 'v': '其它' }
        ];
        
        const year = [];
        for (let y = 2026; y >= 2004; y--) {
            year.push({ 'n': String(y), 'v': String(y) });
        }
        year.unshift({ 'n': '全部', 'v': '' });
        
        const lang = [
            { 'n': '全部', 'v': '' }, { 'n': '国语', 'v': '国语' }, { 'n': '英语', 'v': '英语' },
            { 'n': '粤语', 'v': '粤语' }, { 'n': '闽南语', 'v': '闽南语' }, { 'n': '韩语', 'v': '韩语' },
            { 'n': '日语', 'v': '日语' }, { 'n': '法语', 'v': '法语' }, { 'n': '德语', 'v': '德语' },
            { 'n': '其它', 'v': '其它' }
        ];
        
        const sort = [
            { 'n': '时间', 'v': 'time' }, { 'n': '人气', 'v': 'hits' }, { 'n': '评分', 'v': 'score' }
        ];
        
        const letter = [{ 'n': '全部', 'v': '' }];
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0-9';
        for (let c of chars) {
            letter.push({ 'n': c, 'v': c });
        }
        
        return {
            '2': [ // 电视剧
                { 'key': 'class', 'name': '类型', 'value': [
                    { 'n': '全部', 'v': '2' }, { 'n': '国产剧', 'v': '13' }, { 'n': '日韩剧', 'v': '15' }, { 'n': '海外剧', 'v': '16' }
                ]},
                { 'key': 'area', 'name': '地区', 'value': area },
                { 'key': 'genre', 'name': '剧情', 'value': [
                    { 'n': '全部', 'v': '' }, { 'n': '古装', 'v': '古装' }, { 'n': '战争', 'v': '战争' },
                    { 'n': '青春偶像', 'v': '青春偶像' }, { 'n': '喜剧', 'v': '喜剧' }, { 'n': '家庭', 'v': '家庭' },
                    { 'n': '犯罪', 'v': '犯罪' }, { 'n': '动作', 'v': '动作' }, { 'n': '奇幻', 'v': '奇幻' },
                    { 'n': '剧情', 'v': '剧情' }, { 'n': '历史', 'v': '历史' }, { 'n': '经典', 'v': '经典' },
                    { 'n': '乡村', 'v': '乡村' }, { 'n': '情景', 'v': '情景' }, { 'n': '商战', 'v': '商战' },
                    { 'n': '网剧', 'v': '网剧' }, { 'n': '其他', 'v': '其他' }
                ]},
                { 'key': 'year', 'name': '年份', 'value': year },
                { 'key': 'lang', 'name': '语言', 'value': lang },
                { 'key': 'letter', 'name': '字母', 'value': letter },
                { 'key': 'sort', 'name': '排序', 'value': sort }
            ],
            '1': [ // 电影
                { 'key': 'class', 'name': '类型', 'value': [
                    { 'n': '全部', 'v': '1' }, { 'n': '动作片', 'v': '6' }, { 'n': '喜剧片', 'v': '7' },
                    { 'n': '恐怖片', 'v': '8' }, { 'n': '科幻片', 'v': '9' }, { 'n': '爱情片', 'v': '10' },
                    { 'n': '剧情片', 'v': '11' }, { 'n': '战争片', 'v': '12' }, { 'n': '纪录片', 'v': '20' }
                ]},
                { 'key': 'area', 'name': '地区', 'value': area },
                { 'key': 'genre', 'name': '剧情', 'value': [
                    { 'n': '全部', 'v': '' }, { 'n': '喜剧', 'v': '喜剧' }, { 'n': '爱情', 'v': '爱情' },
                    { 'n': '恐怖', 'v': '恐怖' }, { 'n': '动作', 'v': '动作' }, { 'n': '科幻', 'v': '科幻' },
                    { 'n': '剧情', 'v': '剧情' }, { 'n': '战争', 'v': '战争' }, { 'n': '警匪', 'v': '警匪' },
                    { 'n': '犯罪', 'v': '犯罪' }, { 'n': '动画', 'v': '动画' }, { 'n': '奇幻', 'v': '奇幻' },
                    { 'n': '武侠', 'v': '武侠' }, { 'n': '冒险', 'v': '冒险' }, { 'n': '枪战', 'v': '枪战' },
                    { 'n': '悬疑', 'v': '悬疑' }, { 'n': '惊悚', 'v': '惊悚' }, { 'n': '经典', 'v': '经典' },
                    { 'n': '青春', 'v': '青春' }, { 'n': '文艺', 'v': '文艺' }, { 'n': '微电影', 'v': '微电影' },
                    { 'n': '古装', 'v': '古装' }, { 'n': '历史', 'v': '历史' }, { 'n': '运动', 'v': '运动' },
                    { 'n': '农村', 'v': '农村' }, { 'n': '儿童', 'v': '儿童' }, { 'n': '网络电影', 'v': '网络电影' }
                ]},
                { 'key': 'year', 'name': '年份', 'value': year },
                { 'key': 'lang', 'name': '语言', 'value': lang },
                { 'key': 'letter', 'name': '字母', 'value': letter },
                { 'key': 'sort', 'name': '排序', 'value': sort }
            ],
            '4': [ // 动漫
                { 'key': 'class', 'name': '类型', 'value': [
                    { 'n': '全部', 'v': '4' }, { 'n': '国产动漫', 'v': '25' }, { 'n': '日韩动漫', 'v': '26' }
                ]},
                { 'key': 'genre', 'name': '剧情', 'value': [
                    { 'n': '全部', 'v': '' }, { 'n': '情感', 'v': '情感' }, { 'n': '科幻', 'v': '科幻' },
                    { 'n': '热血', 'v': '热血' }, { 'n': '推理', 'v': '推理' }, { 'n': '搞笑', 'v': '搞笑' },
                    { 'n': '冒险', 'v': '冒险' }, { 'n': '奇幻', 'v': '奇幻' }, { 'n': '战斗', 'v': '战斗' },
                    { 'n': '校园', 'v': '校园' }, { 'n': '萝莉', 'v': '萝莉' }, { 'n': '治愈', 'v': '治愈' },
                    { 'n': '原创', 'v': '原创' }, { 'n': '亲子', 'v': '亲子' }, { 'n': '益智', 'v': '益智' },
                    { 'n': '励志', 'v': '励志' }, { 'n': '其他', 'v': '其他' }
                ]},
                { 'key': 'area', 'name': '地区', 'value': [
                    { 'n': '全部', 'v': '' }, { 'n': '大陆', 'v': '大陆' }, { 'n': '香港', 'v': '香港' },
                    { 'n': '台湾', 'v': '台湾' }, { 'n': '美国', 'v': '美国' }, { 'n': '韩国', 'v': '韩国' },
                    { 'n': '日本', 'v': '日本' }, { 'n': '法国', 'v': '法国' }, { 'n': '英国', 'v': '英国' },
                    { 'n': '其它', 'v': '其它' }
                ]},
                { 'key': 'year', 'name': '年份', 'value': year },
                { 'key': 'lang', 'name': '语言', 'value': lang },
                { 'key': 'letter', 'name': '字母', 'value': letter },
                { 'key': 'sort', 'name': '排序', 'value': sort }
            ],
            '3': [ // 综艺
                { 'key': 'class', 'name': '类型', 'value': [
                    { 'n': '全部', 'v': '3' }, { 'n': '大陆综艺', 'v': '21' }, { 'n': '日韩综艺', 'v': '22' }
                ]},
                { 'key': 'genre', 'name': '剧情', 'value': [
                    { 'n': '全部', 'v': '' }, { 'n': '选秀', 'v': '选秀' }, { 'n': '情感', 'v': '情感' },
                    { 'n': '访谈', 'v': '访谈' }, { 'n': '播报', 'v': '播报' }, { 'n': '音乐', 'v': '音乐' },
                    { 'n': '美食', 'v': '美食' }, { 'n': '旅游', 'v': '旅游' }, { 'n': '搞笑', 'v': '搞笑' },
                    { 'n': '游戏', 'v': '游戏' }, { 'n': '亲子', 'v': '亲子' }, { 'n': '其它', 'v': '其它' }
                ]},
                { 'key': 'area', 'name': '地区', 'value': [
                    { 'n': '全部', 'v': '' }, { 'n': '大陆', 'v': '大陆' }, { 'n': '香港', 'v': '香港' },
                    { 'n': '台湾', 'v': '台湾' }, { 'n': '美国', 'v': '美国' }, { 'n': '韩国', 'v': '韩国' },
                    { 'n': '日本', 'v': '日本' }, { 'n': '英国', 'v': '英国' }, { 'n': '其它', 'v': '其它' }
                ]},
                { 'key': 'year', 'name': '年份', 'value': year },
                { 'key': 'lang', 'name': '语言', 'value': lang },
                { 'key': 'letter', 'name': '字母', 'value': letter },
                { 'key': 'sort', 'name': '排序', 'value': sort }
            ]
        };
    }
};

module.exports = spider;

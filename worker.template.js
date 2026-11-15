/**
 * 音乐下载器 · Cloudflare Worker 版
 * 支持：网易云（扫码登录）、QQ 音乐、酷狗
 * 纯 Worker（ES Module），不需要 KV / D1 / 任何付费服务
 */

/* ============================================================
 * 内嵌 qrcode-generator（MIT，Kazuhiko Arase）
 * ============================================================ */
@@QRCODE_LIB@@
/* ============================================================ */

/* 赞赏码图片（内嵌，base64）：1 = 微信，2 = 支付宝 */
const DONATE_WECHAT = { type: 'image/webp', b64: '@@WECHAT_B64@@' };
const DONATE_ALIPAY = { type: 'image/jpeg', b64: '@@ALIPAY_B64@@' };

const APP_VER = '9.0.90';
const SESSION_TTL = 43200;      // 12 小时
const UA_NCM = 'NeteaseMusic/' + APP_VER + '.1734239895(8008090);Dalvik/2.1.0 (Linux; U; Android 14)';
const UA_WEB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* ---------- MD5 ---------- */
const MD5 = (() => {
  const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = new Int32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;

  function toBytes(str) {
    return new TextEncoder().encode(str);
  }
  return function md5hex(input) {
    const msg = typeof input === 'string' ? toBytes(input) : input;
    const len = msg.length;
    const bitLen = len * 8;
    const withPad = ((len + 8) >> 6) + 1;
    const words = new Int32Array(withPad * 16);
    for (let i = 0; i < len; i++) words[i >> 2] |= msg[i] << ((i % 4) * 8);
    words[len >> 2] |= 0x80 << ((len % 4) * 8);
    words[withPad * 16 - 2] = bitLen | 0;
    words[withPad * 16 - 1] = Math.floor(bitLen / 4294967296);

    let a0 = 0x67452301, b0 = -271733879, c0 = -1732584194, d0 = 271733878;
    const M = new Int32Array(16);
    for (let chunk = 0; chunk < withPad; chunk++) {
      for (let i = 0; i < 16; i++) M[i] = words[chunk * 16 + i];
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const tmp = D;
        D = C; C = B;
        const sum = (A + F + K[i] + M[g]) | 0;
        B = (B + ((sum << s[i]) | (sum >>> (32 - s[i])))) | 0;
        A = tmp;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const hex = (n) => {
      let h = '';
      for (let i = 0; i < 4; i++) h += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0');
      return h;
    };
    return hex(a0) + hex(b0) + hex(c0) + hex(d0);
  };
})();

/* ---------- AES-128-ECB（用 WebCrypto 的 AES-CBC 逐块模拟） ---------- */
let aesKeyCache = null;
async function aesEcbHex(plain, password = 'e82ckenh8dichen8') {
  if (!aesKeyCache) {
    aesKeyCache = await crypto.subtle.importKey('raw', new TextEncoder().encode(password),
      { name: 'AES-CBC' }, false, ['encrypt']);
  }
  const data = new TextEncoder().encode(plain);
  // PKCS7 填充
  const padLen = 16 - (data.length % 16);
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  padded.fill(padLen, data.length);
  const out = new Uint8Array(padded.length);
  const iv = new Uint8Array(16);
  for (let off = 0; off < padded.length; off += 16) {
    // WebCrypto 的 AES-CBC 一定会加 PKCS7 填充，所以 16 字节明文会得到 32 字节；取前 16 字节即 ECB 结果
    const block = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKeyCache, padded.subarray(off, off + 16));
    out.set(new Uint8Array(block).subarray(0, 16), off);
  }
  let hex = '';
  for (let i = 0; i < out.length; i++) hex += out[i].toString(16).padStart(2, '0');
  return hex.toUpperCase();
}

/* ---------- 通用 HTTP ---------- */
async function httpText(url, { method = 'GET', headers = {}, body = null } = {}) {
  const res = await fetch(url, { method, headers, body, redirect: 'follow' });
  const text = await res.text();
  const setCookie = res.headers.get('set-cookie') || '';
  return { status: res.status, text, setCookie, headers: res.headers };
}

function parseSetCookie(raw) {
  // Workers 的 set-cookie 可能被合并成一行，逐个拆
  const out = {};
  if (!raw) return out;
  const parts = raw.split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
  for (const part of parts) {
    const first = part.split(';')[0].trim();
    const i = first.indexOf('=');
    if (i > 0) out[first.slice(0, i).trim()] = first.slice(i + 1).trim();
  }
  return out;
}

function cookieStr(obj) {
  return Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('; ');
}

/* ---------- 网易云 eapi ---------- */
function deviceCookie() {
  return {
    osver: '16.2', deviceId: 'ncmcf', os: 'iPhone OS', appver: APP_VER, versioncode: '140',
    mobilename: '', resolution: '1920x1080', channel: 'distribution', buildver: String(Math.floor(Date.now() / 1000)),
  };
}

async function eapiPayload(uri, data) {
  const text = JSON.stringify(data);
  const digest = MD5('nobody' + uri + 'use' + text + 'md5forencrypt');
  const raw = uri + '-36cd479b6b5-' + text + '-36cd479b6b5-' + digest;
  const hex = await aesEcbHex(raw);
  return 'params=' + encodeURIComponent(hex);
}

async function ncm(path, payload, session = {}) {
  const uri = '/api/' + path;
  const dev = deviceCookie();
  if (session.MUSIC_U) dev.MUSIC_U = session.MUSIC_U;
  if (session.__csrf) dev.__csrf = session.__csrf;
  dev.requestId = Date.now() + '_' + Math.floor(Math.random() * 9000 + 1000);
  payload.header = dev;
  payload.e_r = false;
  const body = await eapiPayload(uri, payload);
  const { text, setCookie } = await httpText('https://music.163.com/eapi/' + uri.slice(5), {
    method: 'POST',
    headers: {
      'User-Agent': UA_NCM,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://music.163.com/',
    },
    body,
  });
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error('网易云返回了无法解析的内容'); }
  const cookies = parseSetCookie(setCookie);
  if (j.cookie) {
    for (const kv of String(j.cookie).split(';')) {
      const p = kv.split('=');
      if (p.length >= 2) cookies[p[0].trim()] = p.slice(1).join('=').trim();
    }
  }
  j.__cookie = cookies;
  return j;
}

function pickCookieObj(cookies) {
  const keep = ['MUSIC_U', '__csrf', 'NMTID'];
  const out = {};
  for (const k of keep) if (cookies && cookies[k]) out[k] = cookies[k];
  return out;
}

function pickLoginCookie(j) {
  const keep = ['MUSIC_U', '__csrf', 'NMTID', 'os', 'appver'];
  const out = {};
  for (const k of keep) if (j.__cookie && j.__cookie[k]) out[k] = j.__cookie[k];
  return out;
}

/* ---------- 网易云「网页版」扫码接口 ----------
 * 官网自己用的就是这两个接口；用它生成的 codekey，App 扫码时不会被判「设备环境异常」。
 * eapi（客户端接口）作为备用。
 */
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function webQrUnikey() {
  const { text } = await httpText('https://music.163.com/api/login/qrcode/unikey?type=3', {
    headers: { 'User-Agent': WEB_UA, Referer: 'https://music.163.com/' },
  });
  const j = JSON.parse(text);
  return j.unikey || '';
}

async function webQrCheck(key) {
  const { text, setCookie } = await httpText(
    'https://music.163.com/api/login/qrcode/client/login?key=' + encodeURIComponent(key) + '&type=3',
    { headers: { 'User-Agent': WEB_UA, Referer: 'https://music.163.com/' } });
  let j = {};
  try { j = JSON.parse(text); } catch (e) { }
  const cookies = parseSetCookie(setCookie);
  if (j.cookie) {
    for (const kv of String(j.cookie).split(';')) {
      const i = kv.indexOf('=');
      if (i > 0) cookies[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    }
  }
  return { code: Number(j.code || 0), message: j.message || '', cookies };
}

/** 用网页接口取账号资料（昵称 / 头像 / VIP），失败再用 eapi */
async function profile(session) {
  const ck = 'MUSIC_U=' + encodeURIComponent(session.MUSIC_U || '') +
    (session.__csrf ? '; __csrf=' + session.__csrf : '');
  try {
    const { text } = await httpText('https://music.163.com/api/nuser/account/get', {
      headers: { 'User-Agent': WEB_UA, Referer: 'https://music.163.com/', Cookie: ck },
    });
    const j = JSON.parse(text);
    const a = j.account || {};
    const p = j.profile || {};
    if (p.userId || a.id) {
      return {
        loggedIn: true,
        userId: String(p.userId || a.id || ''),
        nickname: p.nickname || a.userName || '用户',
        avatar: p.avatarUrl || '',
        vip: !!(a.vipType || p.vipType),
      };
    }
  } catch (e) { }
  try {
    const me = await loginStatus(session);
    if (me && me.loggedIn) return me;
  } catch (e) { }
  return null;
}

/* ---------- 会话：签名串（浏览器 localStorage 保存） ---------- */
const SESS_SECRET = 'ncm-worker-sess-v1-please-change-me';
async function hmac(data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SESS_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function b64e(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64d(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(s + '='.repeat((4 - s.length % 4) % 4))));
}

async function sealSess(data) {
  const body = b64e(JSON.stringify({ ...data, t: Math.floor(Date.now() / 1000) }));
  return body + '.' + await hmac(body);
}
async function openSess(blob) {
  if (!blob || !blob.includes('.')) return null;
  const [body, sig] = blob.split('.');
  if (await hmac(body) !== sig) return null;
  try {
    const data = JSON.parse(b64d(body));
    if (Math.floor(Date.now() / 1000) - (data.t || 0) > SESSION_TTL) return null;
    return data;
  } catch (e) { return null; }
}

/* ---------- 二维码 SVG ---------- */
function qrSvg(text, margin = 4) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const total = n + 2 * margin;
  let cells = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!qr.isDark(y, x)) { x++; continue; }
      const start = x;
      while (x < n && qr.isDark(y, x)) x++;
      cells += `<rect x="${start + margin}" y="${y + margin}" width="${x - start}" height="1"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${total} ${total}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${cells}</g></svg>`;
}

/** 音乐 CDN 都支持 https，升级一下，避免 https 页面下载 http 资源被拦 */
function httpsify(u) {
  if (typeof u !== 'string') return u;
  return u.replace(/^http:\/\//, 'https://');
}

/* ---------- 网易云业务 ---------- */
async function loginStatus(session) {
  const j = await ncm('nuser/account/get', {}, session);
  const d = j.data || j;
  const p = d.profile || d.account || {};
  if (!p.userId) return { loggedIn: false };
  return {
    loggedIn: true, userId: String(p.userId), nickname: p.nickname || '用户',
    avatar: p.avatarUrl || '', vip: !!(d.account && d.account.vipType),
  };
}

function songOf(x) {
  const al = x.al || x.album || {};
  const ar = x.ar || x.artists || [];
  return {
    id: String(x.id), name: x.name || '',
    artists: ar.map(a => a.name).join(' / '),
    album: al.name || '', pic: al.picUrl || '',
    duration: x.dt || x.duration || 0,
  };
}

async function songDetail(ids, session) {
  if (!ids.length) return [];
  const c = '[' + ids.map(i => '{"id":' + Number(i) + '}').join(',') + ']';
  const j = await ncm('v3/song/detail', { c }, session);
  return (j.songs || []).map(songOf);
}

async function songUrl(id, level, session) {
  const j = await ncm('song/enhance/player/url/v1', { ids: '[' + id + ']', level, encodeType: 'mp3' }, session);
  const d = (j.data && j.data[0]) || {};
  if (d.url) return { url: httpsify(d.url), type: d.type || 'mp3', br: d.br || 0, size: d.size || 0, level };
  const fb = { lossless: 'exhigh', exhigh: 'higher', higher: 'standard', standard: null }[level];
  return fb ? songUrl(id, fb, session) : null;
}

const LEVEL_LABEL = { standard: '标准', higher: '较高', exhigh: '极高 320k', lossless: '无损' };

/* ---------- QQ 音乐 ---------- */
async function qqSearch(kw, cookie) {
  const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&n=20&p=1&w=' + encodeURIComponent(kw) +
    '&cr=1&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0';
  const { text } = await httpText(url, { headers: { 'User-Agent': UA_WEB, Referer: 'https://y.qq.com/', Cookie: cookie || '' } });
  const j = JSON.parse(text);
  const list = (j.data && j.data.song && j.data.song.list) || [];
  return list.map(x => ({
    id: x.songmid || '', name: x.songname || '',
    artists: (x.singer || []).map(a => a.name).join(' / '),
    album: x.albumname || '',
    pic: x.albummid ? `https://y.qq.com/music/photo_new/T002R300x300M000${x.albummid}.jpg` : '',
    duration: (x.interval || 0) * 1000,
  }));
}

function qqUin(cookie) {
  const m = /(?:^|;\s*)(?:p_)?uin=o?(\d+)/.exec(cookie || '');
  return m ? m[1] : '';
}

async function qqUrl(mid, level, cookie) {
  const prefix = { standard: 'M500', higher: 'M500', exhigh: 'M800', lossless: 'F000' }[level] || 'M500';
  const ext = level === 'lossless' ? '.flac' : '.mp3';
  const payload = {
    req_0: {
      module: 'vkey.GetVkeyServer', method: 'CgiGetVkey',
      param: {
        guid: '10000', songmid: [mid], songtype: [0], uin: qqUin(cookie) || '0',
        loginflag: 1, platform: '20', filename: [prefix + mid + mid + ext],
      },
    },
    comm: { uin: Number(qqUin(cookie) || 0), format: 'json', ct: 24, cv: 0 },
  };
  const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify(payload));
  const { text } = await httpText(url, { headers: { 'User-Agent': UA_WEB, Referer: 'https://y.qq.com/', Cookie: cookie || '' } });
  const j = JSON.parse(text);
  const d = (j.req_0 && j.req_0.data) || {};
  const info = (d.midurlinfo || [])[0] || {};
  if (!info.purl) {
    if (level !== 'standard') return qqUrl(mid, 'standard', cookie);
    throw new Error('QQ 音乐没有返回播放地址：这首歌需要会员，或 Cookie 已失效（请更新 QQ Cookie）');
  }
  const sip = (d.sip && d.sip[0]) || 'http://dl.stream.qqmusic.qq.com/';
  return {
    url: httpsify(sip.replace(/\/$/, '') + '/' + info.purl),
    type: level === 'lossless' ? 'flac' : 'mp3',
    br: { standard: 128000, higher: 192000, exhigh: 320000, lossless: 900000 }[level] || 128000,
    size: 0, level,
  };
}

/* ---------- 酷狗 ---------- */
async function kgSearch(kw, cookie) {
  const url = 'https://mobileservice.kugou.com/api/v3/search/song?keyword=' + encodeURIComponent(kw) + '&page=1&pagesize=20&showtype=1';
  const { text } = await httpText(url, { headers: { 'User-Agent': UA_WEB, Referer: 'https://m.kugou.com/', Cookie: cookie || '' } });
  const j = JSON.parse(text);
  return ((j.data && j.data.info) || []).filter(x => x.hash).map(x => ({
    id: x.hash, name: x.songname || '', artists: x.singername || '',
    album: x.album_name || '',
    pic: (x.trans_param && x.trans_param.union_cover) || '',
    duration: (x.duration || 0) * 1000,
  }));
}

async function kgUrl(hash, level, cookie) {
  const url = 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + encodeURIComponent(hash);
  const { text } = await httpText(url, { headers: { 'User-Agent': UA_WEB, Referer: 'https://m.kugou.com/', Cookie: cookie || '' } });
  const j = JSON.parse(text);
  let play = j.url || '';
  if (!play && j.backup_url && j.backup_url[0]) play = j.backup_url[0];
  if (!play) {
    if ((j.privilege || 0) > 0) throw new Error('这首歌在酷狗需要会员/付费，当前没有权限（可在「登录」里贴酷狗 Cookie）');
    throw new Error('酷狗没有返回播放地址，换一首或稍后重试');
  }
  return {
    url: httpsify(play), type: (j.extName || 'mp3').toLowerCase(),
    br: (j.bitRate || 0) * 1000, size: j.fileSize || 0, level,
  };
}

/* ---------- 路由 ---------- */
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function readSess(req) {
  const hdr = req.headers.get('x-sess') || '';
  const s = await openSess(hdr);
  return s || {};
}

async function handleApi(url, req) {
  const a = url.searchParams.get('a') || '';
  const p = url.searchParams.get('p') || 'netease';
  const sess = await readSess(req);

  try {
    if (a === 'me') {
      if (!sess.ncm || !sess.ncm.MUSIC_U) return json({ loggedIn: false });
      const me = await profile(sess.ncm);
      return json(me || { loggedIn: true, nickname: '已登录' });
    }

    if (a === 'status') {
      const out = { netease: { loggedIn: false }, qq: { loggedIn: false }, kg: { loggedIn: false } };
      if (sess.ncm && sess.ncm.MUSIC_U) {
        // 有 Cookie 就算已登录：账号信息只是锦上添花，取不到也不能卡在登录页
        const me = await profile(sess.ncm);
        out.netease = me || { loggedIn: true, nickname: '已登录', cookieOnly: true };
      }
      if (sess.qq) out.qq = { loggedIn: true, nickname: qqUin(sess.qq) ? 'QQ ' + qqUin(sess.qq) : '已粘贴 Cookie' };
      if (sess.kg) out.kg = { loggedIn: true, nickname: '已粘贴 Cookie' };
      return json(out);
    }

    if (a === 'login_qr') {
      let key = '';
      let via = 'web';
      try { key = await webQrUnikey(); } catch (e) { }
      if (!key) {
        via = 'eapi';
        try {
          const k = await ncm('login/qrcode/unikey', { type: 3 });
          key = k.unikey || '';
        } catch (e) { }
      }
      if (!key) return json({ error: '获取二维码失败（网易云接口异常）' }, 502);
      const link = 'https://music.163.com/login?codekey=' + key;
      const blob = await sealSess({ qr: key, ts: Math.floor(Date.now() / 1000) });
      return json({ token: blob, qrurl: link, svg: qrSvg(link, 4), via });
    }

    if (a === 'login_check') {
      const blob = url.searchParams.get('token') || '';
      const st = await openSess(blob);
      if (!st || !st.qr) return json({ code: 800, status: 'expired', error: '二维码已失效，请刷新' });
      let code = 0;
      let ck = null;
      let via = 'web';
      try {
        const w = await webQrCheck(st.qr);
        code = w.code;
        if (code === 803) ck = pickCookieObj(w.cookies);
      } catch (e) { via = 'eapi'; }
      if (via === 'eapi' || !code) {
        const r = await ncm('login/qrcode/client/login', { key: st.qr, type: 3 });
        code = Number(r.code || 0);
        if (code === 803) ck = pickLoginCookie(r);
      }
      if (code === 803 && (!ck || !ck.MUSIC_U)) {
        // 网页接口没给 cookie 时，再用客户端接口问一次同一个 key
        try {
          const r = await ncm('login/qrcode/client/login', { key: st.qr, type: 3 });
          if (Number(r.code || 0) === 803) ck = pickLoginCookie(r);
        } catch (e) { }
      }
      if (code === 803) {
        if (!ck || !ck.MUSIC_U) return json({ code: 803, status: 'fail', error: '登录成功但没拿到 Cookie，请刷新重试' });
        const me = { code: 803, status: 'ok', loggedIn: true, nickname: '已登录', sess: await sealSess({ ncm: ck }) };
        try {
          const info = await profile(ck);
          if (info && info.loggedIn) Object.assign(me, info);
        } catch (e) { }
        return json(me);
      }
      if (code === 802) return json({ code: 802, status: 'scanned' });
      if (code === 800 || Math.floor(Date.now() / 1000) - (st.ts || 0) > 900) return json({ code: 800, status: 'expired', error: '二维码已过期，请刷新' });
      return json({ code: 801, status: 'waiting' });
    }

    if (a === 'set_cookie') {
      const body = await req.json();
      const plat = body.platform;
      const ck = String(body.cookie || '').trim().replace(/\s*\n\s*/g, ' ').replace(/\s*;\s*/g, '; ');
      if (!['qq', 'kg', 'netease'].includes(plat)) return json({ error: '不支持的平台' }, 400);
      if (!ck) return json({ error: 'Cookie 不能为空' }, 400);
      let next;
      if (plat === 'netease') {
        const mm = /MUSIC_U=([^;]+)/.exec(ck);
        if (!mm) return json({ error: '没找到 MUSIC_U，请复制完整 Cookie' }, 400);
        const csrf = /__csrf=([^;]+)/.exec(ck);
        next = { ...sess, ncm: { MUSIC_U: mm[1], ...(csrf ? { __csrf: csrf[1] } : {}) } };
      } else {
        next = { ...sess, [plat]: ck };
      }
      const blob = await sealSess(next);
      const out = { ok: true, sess: blob, netease: { loggedIn: !!sess.ncm }, qq: { loggedIn: false }, kg: { loggedIn: false } };
      if (next.ncm && next.ncm.MUSIC_U) {
        const me = await profile(next.ncm);
        out.netease = me || { loggedIn: true, nickname: '已登录', cookieOnly: true };
      }
      if (next.qq) out.qq = { loggedIn: true, nickname: qqUin(next.qq) ? 'QQ ' + qqUin(next.qq) : '已粘贴 Cookie' };
      if (next.kg) out.kg = { loggedIn: true, nickname: '已粘贴 Cookie' };
      return json(out);
    }

    if (a === 'clear_cookie') {
      const body = await req.json();
      const plat = body.platform;
      const next = { ...sess };
      delete next[plat];
      return json({ ok: true, sess: await sealSess(next) });
    }

    if (a === 'logout') {
      return json({ ok: true, sess: await sealSess({}) });
    }

    if (a === 'resolve') {
      const body = await req.json();
      const input = String(body.input || '').trim();
      if (!input) return json({ error: '请输入歌名或链接' }, 400);
      if (p === 'qq') {
        const m = /playlist\/(\d+)|disstid=(\d+)/.exec(input);
        if (m) {
          const id = m[1] || m[2];
          const payload = { req_0: { module: 'music.srfDissInfo.DissInfo', method: 'CgiGetDiss', param: { disstid: Number(id), enc_host_uin: '', tag: 1, userinfo: 1, song_begin: 0, song_num: 300 } }, comm: { uin: 0, format: 'json', ct: 24, cv: 0 } };
          const u = 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify(payload));
          const { text } = await httpText(u, { headers: { 'User-Agent': UA_WEB, Referer: 'https://y.qq.com/', Cookie: sess.qq || '' } });
          const j = JSON.parse(text);
          const d = (j.req_0 && j.req_0.data) || {};
          const songs = (d.songlist || []).map(x => ({
            id: x.mid, name: x.name, artists: (x.singer || []).map(a => a.name).join(' / '),
            album: (x.album && x.album.name) || '', pic: x.album && x.album.mid ? `https://y.qq.com/music/photo_new/T002R300x300M000${x.album.mid}.jpg` : '',
            duration: (x.interval || 0) * 1000,
          }));
          return json({ type: 'playlist', id, name: (d.dirinfo && d.dirinfo.title) || '歌单', count: songs.length, songs });
        }
        const one = /songDetail\/([0-9A-Za-z]{10,})/.exec(input);
        if (one) {
          const payload = { req_0: { module: 'music.pf_song_detail_svr', method: 'get_song_detail', param: { song_mid: one[1] } }, comm: { uin: 0, format: 'json', ct: 24, cv: 0 } };
          const u = 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify(payload));
          const { text } = await httpText(u, { headers: { 'User-Agent': UA_WEB, Referer: 'https://y.qq.com/' } });
          const j = JSON.parse(text);
          const t = j.req_0 && j.req_0.data && j.req_0.data.track_info;
          if (!t) return json({ error: '没找到这首歌' }, 404);
          return json({ type: 'song', song: {
            id: t.mid, name: t.name, artists: (t.singer || []).map(a => a.name).join(' / '),
            album: (t.album && t.album.name) || '', pic: t.album && t.album.mid ? `https://y.qq.com/music/photo_new/T002R300x300M000${t.album.mid}.jpg` : '',
            duration: (t.interval || 0) * 1000,
          } });
        }
        return json({ type: 'search', keywords: input, songs: await qqSearch(input, sess.qq) });
      }
      if (p === 'kg') {
        const m = /^[0-9a-f]{32}$/i.exec(input);
        if (m) {
          const u = 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + input;
          const { text } = await httpText(u, { headers: { 'User-Agent': UA_WEB, Referer: 'https://m.kugou.com/' } });
          const j = JSON.parse(text);
          if (j.songName) return json({ type: 'song', song: {
            id: input, name: j.songName, artists: j.author_name || '', album: '',
            pic: (j.album_img || '').replace('{size}', '400'), duration: (j.timeLength || 0) * 1000,
          } });
        }
        return json({ type: 'search', keywords: input, songs: await kgSearch(input, sess.kg) });
      }
      // 网易云
      const pl = /playlist(?:\?|%3F)[^#]*id=(\d+)/i.exec(input) || /playlist\/(\d+)/.exec(input);
      if (pl) {
        const j = await ncm('v6/playlist/detail', { id: Number(pl[1]), n: 100000, s: 8 }, sess.ncm || {});
        const plInfo = j.playlist || {};
        const ids = (plInfo.trackIds || []).slice(0, 300).map(x => String(x.id));
        const songs = ids.length ? await songDetail(ids, sess.ncm || {}) : [];
        return json({ type: 'playlist', id: pl[1], name: plInfo.name || '歌单', count: ids.length, songs });
      }
      const ids = [];
      if (/^\d{5,12}$/.test(input)) ids.push(input);
      else {
        const re = /(?:song\?id=|song\/|id=)(\d{5,12})/g;
        let m;
        while ((m = re.exec(input))) if (!ids.includes(m[1])) ids.push(m[1]);
      }
      if (ids.length) {
        const songs = await songDetail(ids.slice(0, 300), sess.ncm || {});
        if (!songs.length) return json({ error: '没找到这首歌，链接可能不对' }, 404);
        return json(songs.length === 1 ? { type: 'song', song: songs[0] } : { type: 'list', songs });
      }
      const j = await ncm('search/get', { s: input, type: 1, limit: 20, offset: 0 }, sess.ncm || {});
      const songs = ((j.result && j.result.songs) || []).map(songOf);
      return json({ type: 'search', keywords: input, songs });
    }

    if (a === 'url') {
      const body = await req.json();
      const id = String(body.id || '');
      const level = String(body.level || 'exhigh');
      if (!id) return json({ error: '缺少 id' }, 400);
      let u;
      if (p === 'qq') u = await qqUrl(id, level, sess.qq);
      else if (p === 'kg') u = await kgUrl(id, level, sess.kg);
      else u = await songUrl(id, level, sess.ncm || {});
      if (!u) return json({ error: '没有可用地址（可能需要 VIP 或无版权）' }, 404);
      return json({ ...u, label: LEVEL_LABEL[u.level] || u.level });
    }

    if (a === 'download') {
      const id = url.searchParams.get('id') || '';
      const level = url.searchParams.get('level') || 'exhigh';
      const name = (url.searchParams.get('name') || '').replace(/[\\/:*?"<>|]+/g, ' ').trim();
      let u;
      if (p === 'qq') u = await qqUrl(id, level, sess.qq);
      else if (p === 'kg') u = await kgUrl(id, level, sess.kg);
      else u = await songUrl(id, level, sess.ncm || {});
      if (!u) return json({ error: '没有可用地址' }, 404);

      const ref = p === 'qq' ? 'https://y.qq.com/' : p === 'kg' ? 'https://www.kugou.com/' : 'https://music.163.com/';
      const wantProxy = url.searchParams.get('proxy') === '1' || !!name;

      if (!wantProxy) {
        // 默认 302 直连 CDN：不占 Worker 带宽，速度最快
        return Response.redirect(u.url, 302);
      }
      // 需要带文件名时由 Worker 转发
      const r = await fetch(u.url, { headers: { 'User-Agent': UA_WEB, Referer: ref } });
      if (!r.ok) return json({ error: '下载失败（CDN 返回 ' + r.status + '）' }, 502);
      const fn = (name || 'music') + '.' + (u.type || 'mp3');
      const headers = {
        'Content-Type': r.headers.get('content-type') || 'audio/mpeg',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(fn),
        'Cache-Control': 'no-store',
      };
      const len = r.headers.get('content-length');
      if (len) headers['Content-Length'] = len;
      return new Response(r.body, { headers });
    }

    if (a === 'diag') {
      const out = { runtime: 'cloudflare-worker', now: new Date().toISOString(), colo: (req.cf && req.cf.colo) || '' };
      try { out.encoder = typeof qrcode === 'function'; out.svgLen = qrSvg('diag').length; } catch (e) { out.qr_error = String(e); }
      // 直接看一下网易云接口的原始返回，方便判断是不是被墙/限流
      try {
        const r = await httpText('https://music.163.com/eapi/login/qrcode/unikey', {
          method: 'POST',
          headers: { 'User-Agent': UA_NCM, 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://music.163.com/' },
          body: await eapiPayload('/api/login/qrcode/unikey', { type: 3, header: deviceCookie(), e_r: false }),
        });
        out.raw_status = r.status;
        out.raw_head = (r.text || '').slice(0, 160);
        try { const j = JSON.parse(r.text); out.netease_api = { code: j.code, has_key: !!j.unikey }; } catch (e) { out.netease_api = { parse_error: true }; }
      } catch (e) {
        out.netease_api = { error: String(e) };
      }
      return json(out);
    }

    return json({ error: '未知操作' }, 404);
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 500);
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.searchParams.has('a')) return handleApi(url, req);

    // 赞赏图：/1 = 微信，/2 = 支付宝（图已内嵌，不需要额外文件）
    const m = /^\/([12])$/.exec(url.pathname);
    if (m) {
      // 如果仓库里放了 public/1.png、public/2.png，优先用它们（方便你随时换图）
      if (env && env.ASSETS) {
        for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
          const res = await env.ASSETS.fetch(new Request(new URL('/' + m[1] + '.' + ext, url), req));
          if (res.ok) {
            return new Response(res.body, {
              headers: { 'Content-Type': res.headers.get('content-type') || 'image/png', 'Cache-Control': 'public, max-age=600' },
            });
          }
        }
      }
      const img = m[1] === '1' ? DONATE_WECHAT : DONATE_ALIPAY;
      if (img) {
        const bin = Uint8Array.from(atob(img.b64), c => c.charCodeAt(0));
        return new Response(bin, { headers: { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=86400' } });
      }
      return new Response('not found', { status: 404 });
    }
    return new Response(PAGE, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
};

/* ============================================================
 * 页面
 * ============================================================ */
const PAGE = @@PAGE@@;

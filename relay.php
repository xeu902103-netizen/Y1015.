<?php
/* 网易云取地址中转（放到任意支持 PHP 的国内主机上）
 * 用法：把本文件传到主机，得到 https://你的域名/relay.php
 *       然后在 worker.js 顶部把 RELAY 改成这个地址，重新部署
 * 作用：Cloudflare 的 IP 拿不到网易云播放地址（会返回 404），
 *       由这台国内主机去取，再把直链返回给 Worker。
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
error_reporting(0);

// 简单口令，防止被白嫖；改成一个只有你知道的字符串，并在 worker.js 里填一样
const TOKEN = 'change-me-please';

$body = json_decode((string)file_get_contents('php://input'), true) ?: [];
if (($body['token'] ?? '') !== TOKEN) {
    http_response_code(403);
    echo json_encode(['error' => 'token 不对']);
    exit;
}
$id = (string)($body['id'] ?? '');
$level = (string)($body['level'] ?? 'exhigh');
$cookie = (string)($body['cookie'] ?? '');
if (!preg_match('/^\d+$/', $id)) {
    http_response_code(400);
    echo json_encode(['error' => 'id 不对']);
    exit;
}

function eapi_payload(string $uri, array $data): string
{
    $text = json_encode($data, JSON_UNESCAPED_UNICODE);
    $digest = md5("nobody{$uri}use{$text}md5forencrypt");
    $raw = "{$uri}-36cd479b6b5-{$text}-36cd479b6b5-{$digest}";
    $enc = openssl_encrypt($raw, 'AES-128-ECB', 'e82ckenh8dichen8', OPENSSL_RAW_DATA);
    return 'params=' . urlencode(strtoupper(bin2hex((string)$enc)));
}

function eapi(string $path, array $payload, string $cookie): array
{
    $uri = '/api/' . $path;
    $dev = [
        'osver' => '16.2', 'deviceId' => 'relay', 'os' => 'iPhone OS', 'appver' => '9.0.90',
        'versioncode' => '140', 'mobilename' => '', 'resolution' => '1920x1080',
        'channel' => 'distribution', 'buildver' => (string)time(), 'requestId' => (string)round(microtime(true) * 1000),
    ];
    if (preg_match('/MUSIC_U=([^;]+)/', $cookie, $m)) $dev['MUSIC_U'] = $m[1];
    if (preg_match('/__csrf=([^;]+)/', $cookie, $m)) $dev['__csrf'] = $m[1];
    $payload['header'] = $dev;
    $payload['e_r'] = false;
    $hdr = "User-Agent: NeteaseMusic/9.0.90.1734239895(8008090);Dalvik/2.1.0 (Linux; U; Android 14)\r\n"
        . "Content-Type: application/x-www-form-urlencoded\r\nReferer: https://music.163.com/\r\n";
    $hdr .= 'Cookie: ' . implode('; ', array_map(fn($k, $v) => "$k=$v", array_keys($dev), $dev)) . "\r\n";
    $ctx = stream_context_create([
        'http' => ['method' => 'POST', 'header' => $hdr, 'content' => eapi_payload($uri, $payload), 'timeout' => 20, 'ignore_errors' => true],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $r = @file_get_contents('https://music.163.com/eapi/' . substr($uri, 5), false, $ctx);
    $j = json_decode((string)$r, true);
    return is_array($j) ? $j : [];
}

$levels = [$level, 'exhigh', 'higher', 'standard'];
$levels = array_values(array_unique($levels));
$diag = [];
foreach ($levels as $lv) {
    $j = eapi('song/enhance/player/url/v1', ['ids' => '[' . $id . ']', 'level' => $lv, 'encodeType' => 'mp3'], $cookie);
    $d = $j['data'][0] ?? [];
    if (!empty($d['url'])) {
        echo json_encode([
            'url' => str_replace('http://', 'https://', (string)$d['url']),
            'type' => $d['type'] ?? 'mp3',
            'br' => $d['br'] ?? 0,
            'size' => $d['size'] ?? 0,
            'level' => $lv,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $diag[$lv] = $d['code'] ?? 0;
}
http_response_code(404);
echo json_encode(['error' => '拿不到地址', 'diag' => $diag], JSON_UNESCAPED_UNICODE);

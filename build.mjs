import fs from 'node:fs';

const root = '/root/workspace/cf';
const lib = fs.readFileSync(root + '/node_modules/qrcode-generator/dist/qrcode.js', 'utf8');
// 去掉 UMD 尾部（Worker 里没有 define/exports，但保险起见裁掉）
const libBody = lib;   // UMD 尾部在 ESM/Worker 里不会执行，原样保留即可

const page = fs.readFileSync(root + '/page.html', 'utf8');
const tpl = fs.readFileSync(root + '/worker.template.js', 'utf8');

const out = tpl
  .replace('@@QRCODE_LIB@@', () => libBody.trim())      // 用函数：避免 $& $' 之类被当成替换模式
  .replace('@@PAGE@@', () => JSON.stringify(page));

fs.writeFileSync(root + '/worker.js', out);
console.log('worker.js bytes', out.length);

import { Game } from './core/game.js';

try {
  const game = new Game(document.getElementById('game'), document.getElementById('hud'));
  game.start();
} catch (e) {
  // WebGL 不可用等致命错误的兜底提示
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:#04060f;color:#ff8fa3;font-family:monospace;font-size:16px;z-index:99;text-align:center;line-height:2;';
  el.innerHTML = `😢 游戏初始化失败<br><span style="color:#7fb8d8;font-size:13px;">${String(e?.message || e)}<br>请使用支持 WebGL 的现代桌面浏览器（Chrome / Edge / Firefox）</span>`;
  document.body.appendChild(el);
  console.error(e);
}

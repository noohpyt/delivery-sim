// 被裁转场：打字机逐行 + 任意键继续
export class LayoffView {
  constructor(root, lines, onDone) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;' +
      'background:#04060f;font-family:"Segoe UI","Microsoft YaHei",monospace;color:#cfeaff;cursor:pointer;';
    this.el.innerHTML = `<div id="layoff-text" style="max-width:620px;font-size:19px;line-height:2.4;text-align:left;"></div>
      <div style="position:absolute;bottom:8%;width:100%;text-align:center;color:#5b7a94;font-size:13px;">按任意键继续</div>`;
    root.appendChild(this.el);
    this.textEl = this.el.querySelector('#layoff-text');
    this.lines = lines;
    this.shown = 0;
    this.charT = 0;
    this.done = false;
    this.onDone = onDone;
    this.advance = () => {
      if (this.shown < this.lines.length) {
        this.shown = this.lines.length; // 先补全
        this.render(true);
      } else if (!this.done) {
        this.done = true;
        this.el.remove();
        removeEventListener('keydown', this.advance);
        onDone?.();
      }
    };
    addEventListener('keydown', this.advance);
    this.el.addEventListener('click', this.advance);
  }
  render(full = false) {
    this.textEl.innerHTML = this.lines.slice(0, this.shown)
      .map((l) => `<div style="opacity:0;animation:fadein .8s forwards;">${l}</div>`).join('');
  }
  update(dt) {
    if (this.shown >= this.lines.length) return;
    this.charT += dt;
    if (this.charT > 1.15) {
      this.charT = 0;
      this.shown++;
      this.render();
    }
  }
}

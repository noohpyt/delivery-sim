// WebAudio 合成音效：无任何外部音频文件
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    const boot = () => { this.ensure(); };
    window.addEventListener('keydown', boot, { once: true });
    window.addEventListener('pointerdown', boot, { once: true });
  }
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    // 引擎底噪：锯齿波 + 低通
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }
  engine(speedNorm) {
    if (!this.ctx) return;
    this.engineOsc.frequency.setTargetAtTime(40 + speedNorm * 160, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.11, this.ctx.currentTime, 0.1);
  }
  tone(freq, dur = 0.12, type = 'square', vol = 0.5, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  accept() { this.tone(660, 0.09, 'square'); this.tone(880, 0.12, 'square', 0.4, 0.09); }
  pickup() { this.tone(520, 0.1, 'triangle'); this.tone(780, 0.14, 'triangle', 0.45, 0.1); }
  deliver() { // 到账
    this.tone(880, 0.1, 'square', 0.5);
    this.tone(1174, 0.1, 'square', 0.5, 0.1);
    this.tone(1568, 0.22, 'square', 0.5, 0.2);
  }
  fail() { this.tone(220, 0.25, 'sawtooth', 0.4); this.tone(160, 0.35, 'sawtooth', 0.4, 0.18); }
  bump() { this.tone(90, 0.12, 'sawtooth', 0.6); }
}

// 温水煮青蛙难度：根据近期表现收紧/放宽订单时限
export class DifficultySystem {
  constructor() {
    this.slackScale = 1;     // 乘在订单时限上
    this.history = [];       // 最近 N 单 timeUsed/limit
    this.windowSize = 6;
    this.min = 0.72;
    this.max = 1.25;
  }
  // 送达一单后记录：ratio = 实际用时 / 时限
  record(ratio) {
    this.history.push(ratio);
    if (this.history.length > this.windowSize) this.history.shift();
    if (this.history.length < 2) return;
    const avg = this.history.reduce((a, b) => a + b, 0) / this.history.length;
    if (avg < 0.55) this.slackScale = Math.max(this.min, this.slackScale - 0.04); // 你越快的单，时限越紧
    else if (avg > 0.85) this.slackScale = Math.min(this.max, this.slackScale + 0.05);
  }
}

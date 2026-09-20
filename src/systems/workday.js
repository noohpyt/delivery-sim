// 工作日时钟：游戏内时间（分钟），timeScale 由 balance 控制
import { BALANCE } from '../config/balance.js';

export class Workday {
  constructor() {
    this.minutes = BALANCE.dayStartMinutes; // 从中午开始（M1）
    this.timeScale = BALANCE.timeScale;
  }
  update(dtReal) {
    this.minutes += (dtReal * this.timeScale) / 60;
  }
  get hhmm() {
    const m = Math.floor(this.minutes) % (24 * 60);
    const h = Math.floor(m / 60);
    return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
}

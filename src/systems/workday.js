// 工作日时钟：自选时段 8 小时、高峰判定、昼夜进度
import { BALANCE } from '../config/balance.js';

export const SHIFTS = [
  { id: 'morning', name: '早班', span: '8:00 – 16:00', start: 8 * 60 },
  { id: 'peak',    name: '高峰班', span: '10:00 – 18:00', start: 10 * 60 },
  { id: 'night',   name: '夜班', span: '16:00 – 24:00', start: 16 * 60 },
];

export class Workday {
  constructor() {
    this.timeScale = BALANCE.timeScale;
    this.startMinutes = BALANCE.dayStartMinutes;
    this.minutes = this.startMinutes;
    this.dayLengthMin = 480; // 8 小时
  }
  startShift(startMin) {
    this.startMinutes = startMin;
    this.minutes = startMin;
  }
  get endMinutes() { return this.startMinutes + this.dayLengthMin; }
  update(dtReal) { this.minutes += (dtReal * this.timeScale) / 60; }
  get hhmm() {
    const m = Math.floor(this.minutes) % (24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  get isPeak() {
    const h = (this.minutes / 60) % 24;
    return (h >= 11 && h < 13) || (h >= 18 && h < 20);
  }
  get isOver() { return this.minutes >= this.endMinutes; }
  get progress() { return Math.min(1, (this.minutes - this.startMinutes) / this.dayLengthMin); }
}

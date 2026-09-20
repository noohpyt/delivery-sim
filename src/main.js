import { Game } from './core/game.js';

const game = new Game(document.getElementById('game'), document.getElementById('hud'));
game.start();

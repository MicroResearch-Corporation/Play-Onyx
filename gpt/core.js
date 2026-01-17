import { DB } from './db.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { Services } from './services.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize DB
  await DB.init();

  // Initialize Player
  Player.init();

  // Initialize UI
  UI.init();

  // Initialize Services
  Services.init();

  console.log('UltraPlay OS Ready');
});

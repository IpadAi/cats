// game.js  — Mobile-first single-file platformer
// Author: ChatGPT (rewritten for the user). Drop into same folder as index.html.

/* --------------------------------------------------------
   Canvas & Resize
   -------------------------------------------------------- */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// set canvas size to window
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* --------------------------------------------------------
   DOM references for mobile UI
   -------------------------------------------------------- */
const titleOverlay = document.getElementById("titleOverlay");
const hudSmall = document.getElementById("hudSmall");
const btnLeft = document.getElementById("btnLeft");
const btnRight = document.getElementById("btnRight");
const btnUp = document.getElementById("btnUp");
const btnShoot = document.getElementById("btnShoot");
const btnPause = document.getElementById("btnPause");
const titleHighScore = document.getElementById("titleHighScore");

/* --------------------------------------------------------
   Assets (images)
   -------------------------------------------------------- */
const characterSprite = new Image();
characterSprite.src =
  "https://sdk.bitmoji.com/me/sticker/x9YP40td1zJHcC64oQ4htyATyVeig0bGqzyNqTVZDdcLWVJHRfxSeg/10207747.png?p=dD1zO2w9ZW4.v1&size=thumbnail";

const flagSprite = new Image();
flagSprite.src = "https://pngimg.com/d/flags_PNG14697.png";

const coinSprite = new Image();
coinSprite.src = "https://pngimg.com/d/coin_PNG36871.png";

/* fireball sprite intentionally blank; drawing fallback provided */
const fireballSprite = new Image();
fireballSprite.src = ""; // no external file, use circle fallback

/* --------------------------------------------------------
   Audio (simple WebAudio synthesized sounds)
   -------------------------------------------------------- */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new AudioCtx(); }
    catch (e) { audioCtx = null; }
  }
}
function playBeep(freq = 440, type = "sine", duration = 0.08, volume = 0.08) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = volume;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + duration);
  } catch (e) { /* ignore */ }
}
function playCoin() { playBeep(1200, "square", 0.06, 0.06); }
function playJump() { playBeep(780, "sine", 0.06, 0.08); }
function playPowerup() { playBeep(620, "sawtooth", 0.12, 0.09); }
function playHit() { playBeep(220, "sine", 0.12, 0.12); }
function playWin() { playBeep(880, "triangle", 0.22, 0.12); }

/* --------------------------------------------------------
   Game constants & state
   -------------------------------------------------------- */
const TICKS_PER_SECOND = 60;
const DEFAULT_LEVEL_SECONDS = 160;
const highScoreKey = "mobile_platformer_highscore";

let cameraX = 0;
let levelIndex = 0;
let levels = [];
let gameOver = false;
let gameWon = false;
let coinsCollected = 0;
let score = 0;
let lives = 5;

let levelTimer = 0; // in ticks
let showTitle = true;
let paused = false;

/* --------------------------------------------------------
   Player (original preserved + mobile-friendly additions)
   -------------------------------------------------------- */
const player = {
  x: 60,
  y: 0,
  width: 36,
  height: 48,
  speed: 4.4,
  jumpPower: 15,
  gravity: 0.9,
  vy: 0,
  jumping: false,
  invincible: false,
  invincibleTimer: 0,
  hasFire: false,
  fireCooldown: 0,
  facing: 1,
  respawnX: 80,
  respawnY: 0
};

/* --------------------------------------------------------
   Input (keyboard + touch)
   -------------------------------------------------------- */
const keys = { left:false, right:false, up:false, shoot:false };
const touchState = { left:false, right:false, up:false, shoot:false, pause:false };

document.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft" || e.key === "a") keys.left = true;
  if (e.code === "ArrowRight" || e.key === "d") keys.right = true;
  if (e.code === "ArrowUp" || e.key === "Space" || e.key === "w") {
    if (!player.jumping) { player.vy = -player.jumpPower; player.jumping = true; playJump(); }
  }
  if (e.code === "KeyK") keys.shoot = true;
  if (e.code === "KeyP") { paused = !paused; }
  if (e.code === "Escape") { showTitle = true; paused = false; }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.key === "a") keys.left = false;
  if (e.code === "ArrowRight" || e.key === "d") keys.right = false;
  if (e.code === "KeyK") keys.shoot = false;
});

/* Touch button wiring */
function bindTouchButtons() {
  const bind = (el, prop) => {
    if (!el) return;
    el.addEventListener("touchstart", (ev) => { ev.preventDefault(); touchState[prop] = true; }, {passive:false});
    el.addEventListener("touchend", (ev) => { ev.preventDefault(); touchState[prop] = false; }, {passive:false});
    el.addEventListener("mousedown", () => { touchState[prop] = true; });
    el.addEventListener("mouseup", () => { touchState[prop] = false; });
    el.addEventListener("mouseleave", () => { touchState[prop] = false; });
  };
  bind(btnLeft, "left");
  bind(btnRight, "right");
  bind(btnUp, "up");
  bind(btnShoot, "shoot");
  bind(btnPause, "pause");
  // pause button toggles game
  if (btnPause) btnPause.addEventListener("click", () => { paused = !paused; });
}
bindTouchButtons();

/* Helper to reflect touch into keys in update */
function applyTouchToKeys() {
  if (touchState.left) { keys.left = true; player.facing = -1; }
  else if (!keys.left) keys.left = false;
  if (touchState.right) { keys.right = true; player.facing = 1; }
  else if (!keys.right) keys.right = false;
  if (touchState.up && !player.jumping) { player.jumping = true; player.vy = -player.jumpPower; playJump(); }
  if (touchState.shoot) keys.shoot = true; else if (!keys.shoot) keys.shoot = false;
}

/* --------------------------------------------------------
   Utility: rectangles overlap
   -------------------------------------------------------- */
function rectsOverlap(a,b) {
  return a && b && (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y);
}

/* --------------------------------------------------------
   Parallax background
   -------------------------------------------------------- */
let bgLayers = [];
function initBackground() {
  bgLayers = [
    { name: "sky", speed:0, draw: ()=>{} },
    { name: "clouds", speed:0.12, clouds: makeClouds(10), draw(offset){ ctx.globalAlpha=0.9; ctx.fillStyle="#fff"; this.clouds.forEach(c=>drawCloud((c.x - offset*this.speed) % (canvas.width*2) - 120, c.y, c.scale)); ctx.globalAlpha=1; } },
    { name: "mountains", speed:0.36, draw(offset){ ctx.fillStyle="#6b8e23"; for(let i=-2;i<6;i++){ const mx = i*400 + (-offset*this.speed % 400); ctx.beginPath(); ctx.moveTo(mx, canvas.height); ctx.lineTo(mx+200, canvas.height-180); ctx.lineTo(mx+400, canvas.height); ctx.closePath(); ctx.fill(); } } },
    { name: "trees", speed:0.65, draw(offset){ ctx.fillStyle="#2f4f2f"; for(let i=-2;i<10;i++){ const tx = i*160 + (-offset*this.speed % 160); ctx.fillRect(tx+20, canvas.height-220, 20, 80); ctx.beginPath(); ctx.ellipse(tx+30, canvas.height-240, 48, 32, 0, 0, Math.PI*2); ctx.fill(); } } }
  ];
}
function makeClouds(n) {
  const arr=[];
  for(let i=0;i<n;i++){ arr.push({ x: Math.random()* (canvas.width*2), y: 30 + Math.random()*160, scale: 0.6 + Math.random()*1.4 }); }
  return arr;
}
function drawCloud(x,y,scale=1) {
  ctx.save();
  ctx.translate(x,y);
  ctx.beginPath();
  ctx.ellipse(20*scale, 12*scale, 26*scale, 14*scale, 0, 0, Math.PI*2);
  ctx.ellipse(48*scale, 6*scale, 28*scale, 16*scale, 0, 0, Math.PI*2);
  ctx.ellipse(76*scale, 14*scale, 24*scale, 12*scale, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

/* --------------------------------------------------------
   Level generator (preserves original structures)
   -------------------------------------------------------- */
function createLevels() {
  levels = [];
  const mobileScale = Math.min(1, canvas.width / 900);
  for (let li=0; li<10; li++) {
    const difficulty = li+1;
    const levelWidth = Math.round((2200 + li*500) * (1 - (1-mobileScale)*0.2)); // shrink a bit on small screens
    const groundY = Math.round(canvas.height * 0.42);

    // stairs
    const stairs = [];
    const stairClusters = 2 + Math.floor(difficulty*0.6);
    for (let s=0; s<stairClusters; s++) {
      const baseX = 300 + (s*(levelWidth-600))/stairClusters;
      const steps = 4 + Math.floor(difficulty/3);
      for (let step=0; step<steps; step++){
        stairs.push({ x: baseX + step*36, y: groundY - (step+1)*28, width:36, height:28 });
      }
    }

    // pits
    const pits=[];
    const pitCount = Math.floor(difficulty/3);
    for (let p=0;p<pitCount;p++){
      const px = 800 + p*400 + Math.random()*120;
      const width = 60 + difficulty*10;
      pits.push({ x:px, y:groundY, width, height: canvas.height-groundY });
    }

    // goombas
    const goombas=[];
    const gCount = Math.max(1, 1 + Math.floor(difficulty*1.6) - (canvas.width<600?1:0));
    for (let g=0; g<gCount; g++){
      const gx = 400 + g*200 + Math.random()*100;
      const speed = 0.8 + difficulty*0.2;
      goombas.push({ x:gx, y:groundY-28, width:28, height:28, speed, dir: Math.random()>0.5?1:-1, minX: gx-40, maxX: gx+40, dead:false, animTimer: Math.floor(Math.random()*30) });
    }

    // spikes
    const spikes=[];
    const spikeCount = Math.min(2 + difficulty, 8);
    for (let sp=0; sp<spikeCount; sp++){
      const sx = 600 + sp*250 + Math.random()*60;
      spikes.push({ x:sx, y:groundY-12, width:28, height:12 });
    }

    // coins
    const coins=[];
    const coinCount = Math.max(8, 20 + difficulty*4 - (canvas.width<600?8:0));
    for (let c=0; c<coinCount; c++){
      const cx = 200 + c*100 + Math.random()*60;
      const cy = groundY - 80 - Math.random()*100;
      coins.push({ x:cx, y:cy, width:20, height:20, collected:false, anim: Math.random()*8 });
    }

    // power-ups
    const powerUps=[];
    if (difficulty >= 3) {
      powerUps.push({ type: Math.random() < 0.4 ? "fire" : "life", x: 600 + difficulty*120 + Math.random()*80, y: groundY - 40, width:28, height:28, taken:false });
    }

    // mystery boxes
    const mysteryBoxes=[];
    const boxCount = 2 + Math.floor(difficulty/2);
    for (let b=0; b<boxCount; b++){
      const bx = 400 + b*400 + Math.random()*140;
      const by = groundY - 120 - Math.random()*80;
      mysteryBoxes.push({ x:bx, y:by, width:28, height:28, used:false, reward: Math.random() < 0.5 ? "coin" : (Math.random() < 0.75 ? "life" : "star") });
    }

    // flag
    const flag = { x: levelWidth - 120, y: groundY - 90, width: 28, height: 56 };

    // cannons
    const cannons = [];
    const cannonCount = Math.floor(difficulty/2);
    for (let c=0; c<cannonCount; c++){
      const cx = 500 + c*600 + Math.random()*220;
      cannons.push({ x:cx, y:groundY-28, width:28, height:28, dir: Math.random()>0.5? -1 : 1, cooldown: 80 + Math.floor(Math.random()*120), timer: Math.floor(Math.random()*60)});
    }

    // bats
    const bats=[];
    const batCount = Math.max(0, Math.floor(difficulty*1.1) - (canvas.width<600?1:0));
    for (let b=0; b<batCount; b++){
      const bx = 300 + Math.random()*(levelWidth-600);
      const baseY = groundY - 140 - Math.random()*100;
      bats.push({ x:bx, y:baseY, baseY, width:36, height:22, speed: 1.0 + difficulty*0.08, dir: Math.random()>0.5?1:-1, amplitude: 30 + Math.random()*40, freq: 0.02 + Math.random()*0.02, dead:false, anim: Math.random()*4});
    }

    // checkpoints (a few per level)
    const checkpoints=[];
    const cpCount = Math.min(3, Math.max(1, Math.floor(levelWidth/1000)));
    for (let cp=0; cp<cpCount; cp++){
      const cx = 200 + (cp * (levelWidth - 400)) / (cpCount - 0.0001);
      checkpoints.push({ x: cx, y: groundY - 120, width: 20, height: 80, active: false });
    }

    // particles container
    const particles = [];

    // level seconds scaled with difficulty
    const levelSeconds = Math.max(DEFAULT_LEVEL_SECONDS - difficulty*8, 60);

    levels.push({ width: levelWidth, groundY, stairs, pits, goombas, spikes, coins, powerUps, mysteryBoxes, flag, cannons, bats, checkpoints, particles, levelSeconds });
  }
}

/* --------------------------------------------------------
   Init / Reset
   -------------------------------------------------------- */
function initGame() {
  ensureAudio();
  initBackground();
  createLevels();
  resetToLevel(0);
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}
function resetToLevel(idx) {
  if (idx === 0) {
    lives = 5; coinsCollected = 0; score = 0;
  }
  levelIndex = idx;
  const L = levels[levelIndex];
  player.x = 80;
  player.y = L.groundY - player.height;
  player.respawnX = player.x;
  player.respawnY = player.y;
  player.vy = 0; player.jumping = false; player.invincible = false; player.invincibleTimer = 0; player.hasFire = false; player.fireCooldown = 0;
  cameraX = 0; gameOver = false; gameWon = false; paused = false;

  L.coins.forEach(c=> c.collected=false);
  L.goombas.forEach(g=> g.dead=false);
  L.powerUps.forEach(p=> p.taken=false);
  L.mysteryBoxes.forEach(b=> b.used=false);
  L.cannons.forEach(c=> c.timer = Math.floor(Math.random()*c.cooldown));
  L.bats.forEach(b=> b.dead=false);
  L.checkpoints.forEach(c=> c.active=false);
  L.particles.length = 0;

  levelTimer = L.levelSeconds * TICKS_PER_SECOND;
}

/* --------------------------------------------------------
   Projectiles & particles
   -------------------------------------------------------- */
const fireballs = [];
function spawnPlayerFire(x,y,dir) {
  fireballs.push({ x,y,vx: 6*dir, vy: -1.5, width:12, height:12, life: 120, friendly:true });
  playBeep(880,"sine",0.08,0.06);
}
function spawnEnemyFire(x,y,vx,vy) {
  fireballs.push({ x,y,vx,vy,width:12,height:12,life: 200, friendly:false });
}
function spawnParticles(L, x,y, color="orange", count=8, speed=2) {
  for (let i=0;i<count;i++){
    L.particles.push({ x:x + Math.random()*8 - 4, y: y + Math.random()*8 - 4, vx: (Math.random()-0.5)*speed, vy: (Math.random()-0.5)*speed - 1, life: 30 + Math.floor(Math.random()*30), color });
  }
}

/* --------------------------------------------------------
   Damage & lives
   -------------------------------------------------------- */
function damagePlayer(ignoreCheckpoint=false) {
  if (player.invincible) return;
  playHit();
  lives--;
  player.invincible = true;
  player.invincibleTimer = 120;
  if (lives <= 0) {
    gameOver = true;
    saveHighScore();
  } else {
    // respawn at checkpoint or start
    const rx = ignoreCheckpoint ? 80 : (player.respawnX || 80);
    const ry = ignoreCheckpoint ? (levels[levelIndex].groundY - player.height) : (player.respawnY || (levels[levelIndex].groundY - player.height));
    player.x = rx; player.y = ry; player.vy = 0; player.jumping = false;
  }
}

/* --------------------------------------------------------
   High score persistence
   -------------------------------------------------------- */
function saveHighScore() {
  try {
    const prev = parseInt(localStorage.getItem(highScoreKey) || "0", 10);
    if (score > prev) localStorage.setItem(highScoreKey, String(score));
  } catch (e) { /* ignore */ }
}
function getHighScore() {
  try { return parseInt(localStorage.getItem(highScoreKey) || "0", 10); } catch(e){ return 0; }
}

/* --------------------------------------------------------
   Update — main logic (keeps original behavior + extras)
   -------------------------------------------------------- */
function update() {
  if (showTitle || paused) return;
  if (gameOver || gameWon) return;

  const L = levels[levelIndex];

  // apply touch controls
  applyTouchToKeys();

  // horizontal movement
  if (keys.left) { player.x -= player.speed; player.facing = -1; }
  if (keys.right) { player.x += player.speed; player.facing = 1; }
  player.x = Math.max(0, Math.min(L.width - player.width, player.x));

  // animation bookkeeping omitted (we use simple sprite)

  // gravity
  player.y += player.vy;
  player.vy += player.gravity;

  // pit detection (original)
  const onPit = L.pits && L.pits.some(pit =>
    player.x + player.width > pit.x && player.x < pit.x + pit.width && player.y + player.height >= pit.y
  );
  if (!onPit && player.y + player.height >= L.groundY) {
    player.y = L.groundY - player.height;
    player.vy = 0;
    player.jumping = false;
  }

  // stairs collisions
  L.stairs.forEach(st => {
    if (rectsOverlap(player, st) && player.vy >= 0) {
      player.y = st.y - player.height;
      player.vy = 0;
      player.jumping = false;
    }
  });

  // goombas
  L.goombas.forEach(g => {
    if (g.dead) return;
    g.x += g.speed * g.dir;
    if (g.x < g.minX) g.dir = 1;
    if (g.x + g.width > g.maxX) g.dir = -1;
    g.animTimer = (g.animTimer + 1) % 30;

    if (rectsOverlap(player, g)) {
      if (player.invincible) { g.dead = true; score += 100; spawnParticles(L, g.x + g.width/2, g.y + g.height/2, "brown", 10); }
      else if (player.vy > 0 && player.y + player.height - g.y < 18) {
        g.dead = true; player.vy = -player.jumpPower*0.6; score += 100; playBeep(740, "square", 0.06, 0.08);
      } else {
        damagePlayer();
      }
    }
  });

  // bats
  L.bats.forEach(b => {
    if (b.dead) return;
    b.x += b.speed * b.dir;
    b.y = b.baseY + Math.sin(performance.now()*b.freq + b.x) * b.amplitude * 0.5;
    if (b.x < 0) b.dir = 1;
    if (b.x > L.width) b.dir = -1;
    b.anim = (b.anim + 0.2) % 4;
    if (rectsOverlap(player, b)) {
      if (player.invincible) { b.dead = true; score += 120; spawnParticles(L, b.x, b.y, "gray", 8); }
      else damagePlayer();
    }
  });

  // cannons
  L.cannons.forEach(c => {
    c.timer++;
    if (c.timer >= c.cooldown) {
      c.timer = 0;
      const dx = (player.x + player.width/2) - (c.x + c.width/2);
      const dy = (player.y + player.height/2) - (c.y + c.height/2) - 20;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const vx = (dx / dist) * (3 + Math.random()*1.5);
      const vy = (dy / dist) * (3 + Math.random()*1.0);
      spawnEnemyFire(c.x, c.y - 8, vx, vy);
    }
  });

  // spikes
  L.spikes.forEach(sp => { if (!player.invincible && rectsOverlap(player, sp)) damagePlayer(); });

  // coins
  L.coins.forEach(c => {
    if (!c.collected && rectsOverlap(player, c)) {
      c.collected = true; coinsCollected++; score += 10; playCoin(); spawnParticles(L, c.x + 8, c.y + 8, "gold", 6, 1.6);
    }
    if (!c.collected) c.anim = (c.anim + 0.2) % 8;
  });

  // power-ups
  L.powerUps.forEach(p => {
    if (!p.taken && rectsOverlap(player, p)) {
      p.taken = true;
      if (p.type === "life") { lives++; playPowerup(); }
      else if (p.type === "star") { player.invincible = true; player.invincibleTimer = 600; playPowerup(); }
      else if (p.type === "fire") { player.hasFire = true; playPowerup(); }
    }
  });

  // mystery boxes (if hit from below)
  L.mysteryBoxes.forEach(b => {
    if (!b.used && rectsOverlap(player, b) && player.vy < 0) {
      b.used = true;
      if (b.reward === "coin") { coinsCollected++; score += 10; playCoin(); }
      else if (b.reward === "life") { lives++; playPowerup(); }
      else if (b.reward === "star") { player.invincible = true; player.invincibleTimer = 600; playPowerup(); }
    }
  });

  // checkpoints
  L.checkpoints.forEach(cp => {
    if (!cp.active && rectsOverlap(player, cp)) {
      cp.active = true;
      player.respawnX = cp.x + 10; player.respawnY = cp.y + cp.height - player.height;
      playBeep(1000, "sine", 0.08, 0.07);
    }
  });

  // invincibility timer
  if (player.invincibleTimer > 0) { player.invincibleTimer--; if (player.invincibleTimer === 0) player.invincible = false; }

  // shooting
  if (player.hasFire && player.fireCooldown > 0) player.fireCooldown--;
  if (keys.shoot && player.hasFire && player.fireCooldown <= 0) {
    const sx = player.x + (player.facing === 1 ? player.width : -12);
    const sy = player.y + player.height/2;
    spawnPlayerFire(sx, sy, player.facing);
    player.fireCooldown = 18;
  }

  // fireballs update
  for (let i = fireballs.length -1; i >= 0; i--) {
    const f = fireballs[i];
    f.x += f.vx; f.y += f.vy; f.vy += 0.12; f.life--;
    if (f.x < 0 || f.x > L.width || f.y > canvas.height + 200 || f.life <= 0) { fireballs.splice(i,1); continue; }
    let removed = false;
    if (f.friendly) {
      L.goombas.forEach(g => { if (!g.dead && rectsOverlap(f,g)) { g.dead = true; score += 80; spawnParticles(L, g.x+8, g.y+8, "brown", 8); removed = true; } });
      L.bats.forEach(b => { if (!b.dead && rectsOverlap(f,b)) { b.dead = true; score += 120; spawnParticles(L, b.x, b.y, "gray", 8); removed = true; } });
      L.cannons.forEach(c => { if (rectsOverlap(f,c)) { c.timer = Math.max(0, c.timer - 40); removed = true; } });
      if (removed) { fireballs.splice(i,1); playBeep(640, "square", 0.06, 0.06); continue; }
    } else {
      if (!player.invincible && rectsOverlap(f, player)) { fireballs.splice(i,1); damagePlayer(); continue; }
    }
  }

  // particles update
  for (let i=L.particles.length -1; i>=0; i--) {
    const p = L.particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
    if (p.life <= 0) L.particles.splice(i,1);
  }

  // flag
  if (rectsOverlap(player, L.flag)) {
    if (levelIndex < levels.length -1) {
      playWin();
      resetToLevel(levelIndex + 1);
      return;
    } else {
      gameWon = true;
      saveHighScore();
      playWin();
      return;
    }
  }

  // falling out
  if (player.y > canvas.height + 150) damagePlayer();

  // camera follow
  cameraX = Math.max(0, Math.min(player.x - canvas.width * 0.3, L.width - canvas.width));

  // timer countdown
  levelTimer--;
  if (levelTimer <= 0) damagePlayer(true);
}

/* --------------------------------------------------------
   Draw — all visuals (HUD scaled for mobile)
   -------------------------------------------------------- */
function draw() {
  // background gradient
  const grad = ctx.createLinearGradient(0,0,0,canvas.height);
  grad.addColorStop(0,"#87ceeb"); grad.addColorStop(1,"#a0d6ff");
  ctx.fillStyle = grad; ctx.fillRect(0,0,canvas.width,canvas.height);

  const L = levels[levelIndex];

  // parallax layers
  bgLayers.forEach(layer => {
    ctx.save();
    ctx.translate(-cameraX * (layer.speed || 0), 0);
    layer.draw(cameraX);
    ctx.restore();
  });

  // level drawing
  ctx.save(); ctx.translate(-cameraX, 0);

  // ground
  ctx.fillStyle = "#b5651d"; ctx.fillRect(0, L.groundY, L.width, canvas.height - L.groundY);

  // pits
  ctx.fillStyle = "#4d2b00"; L.pits.forEach(p=> ctx.fillRect(p.x, p.y, p.width, p.height));

  // stairs + wooden poles
  L.stairs.forEach(st => {
    ctx.fillStyle = "#a0522d"; ctx.fillRect(st.x, st.y, st.width, st.height);
    ctx.fillStyle = "#654321"; ctx.fillRect(st.x + st.width/2 - 3, st.y + st.height, 6, L.groundY - (st.y + st.height));
  });

  // spikes
  ctx.fillStyle = "black"; L.spikes.forEach(sp => { ctx.beginPath(); ctx.moveTo(sp.x, sp.y + sp.height); ctx.lineTo(sp.x + sp.width/2, sp.y); ctx.lineTo(sp.x + sp.width, sp.y + sp.height); ctx.fill(); });

  // coins
  L.coins.forEach(c => {
    if (!c.collected) {
      if (coinSprite.complete && coinSprite.naturalWidth !== 0) {
        const wob = Math.sin(c.anim*0.5)*4;
        ctx.drawImage(coinSprite, c.x, c.y + wob, c.width, c.height);
      } else {
        ctx.beginPath(); ctx.fillStyle="gold"; ctx.arc(c.x + c.width/2, c.y + c.height/2, c.width/2, 0, Math.PI*2); ctx.fill();
      }
    }
  });

  // power-ups
  L.powerUps.forEach(p => {
    if (!p.taken) {
      if (p.type === "life") { ctx.fillStyle="red"; ctx.fillRect(p.x,p.y,p.width,p.height); ctx.fillStyle="white"; ctx.font="14px Arial"; ctx.fillText("+", p.x+6, p.y+18); }
      else if (p.type === "star") { ctx.fillStyle="yellow"; ctx.beginPath(); ctx.arc(p.x + p.width/2, p.y + p.height/2, p.width/2, 0, Math.PI*2); ctx.fill(); }
      else if (p.type === "fire") { ctx.fillStyle="orange"; ctx.fillRect(p.x,p.y,p.width,p.height); ctx.fillStyle="white"; ctx.font="12px Arial"; ctx.fillText("F", p.x+6, p.y+18); }
    }
  });

  // mystery boxes
  L.mysteryBoxes.forEach(b => {
    if (!b.used) { ctx.fillStyle="orange"; ctx.fillRect(b.x,b.y,b.width,b.height); ctx.fillStyle="black"; ctx.font="20px Arial"; ctx.fillText("?", b.x+6, b.y+22); }
    else { ctx.fillStyle="#8b4513"; ctx.fillRect(b.x,b.y,b.width,b.height); }
  });

  // goombas
  ctx.fillStyle = "sienna"; L.goombas.forEach(g => {
    if (!g.dead) {
      const bob = Math.sin(g.animTimer*0.2)*2;
      ctx.fillRect(g.x, g.y + bob, g.width, g.height);
    } else {
      ctx.fillStyle = "#3a2b1b"; ctx.fillRect(g.x, g.y + 14, g.width, 6); ctx.fillStyle = "sienna";
    }
  });

  // bats
  L.bats.forEach(b => {
    if (!b.dead) {
      ctx.save(); ctx.translate(b.x + b.width/2, b.y + b.height/2); ctx.scale(b.dir,1);
      ctx.fillStyle = "gray";
      ctx.beginPath(); ctx.moveTo(-b.width/2,0); ctx.quadraticCurveTo(-b.width/2 - 10, -10 - Math.sin(b.anim)*6, -b.width, -10); ctx.quadraticCurveTo(-b.width/2, -6, -b.width/2 + 10, -2); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle="rgba(120,120,120,0.6)"; ctx.fillRect(b.x, b.y, b.width, 4);
    }
  });

  // cannons
  L.cannons.forEach(c => {
    ctx.fillStyle="#222"; ctx.fillRect(c.x, c.y - 8, c.width, c.height + 8);
    ctx.fillStyle="#444"; ctx.fillRect(c.x + (c.dir === 1 ? c.width - 6 : 0), c.y - 12, 6, 6);
  });

  // checkpoints
  L.checkpoints.forEach(cp => {
    ctx.fillStyle = cp.active ? "yellow" : "white";
    ctx.fillRect(cp.x, cp.y, 6, cp.height);
    ctx.fillStyle = cp.active ? "orange" : "red";
    ctx.fillRect(cp.x + 6, cp.y + 12, 18, 12);
  });

  // flag
  if (flagSprite.complete && flagSprite.naturalWidth !== 0) ctx.drawImage(flagSprite, L.flag.x, L.flag.y, L.flag.width, L.flag.height);
  else { ctx.fillStyle = "red"; ctx.fillRect(L.flag.x, L.flag.y, L.flag.width, L.flag.height); }

  // fireballs
  fireballs.forEach(f => {
    if (fireballSprite.complete && fireballSprite.naturalWidth !== 0) ctx.drawImage(fireballSprite, f.x, f.y, f.width, f.height);
    else {
      ctx.beginPath(); ctx.fillStyle = f.friendly ? "orange" : "red"; ctx.arc(f.x + f.width/2, f.y + f.height/2, f.width/2, 0, Math.PI*2); ctx.fill();
    }
  });

  // particles
  L.particles.forEach(p => { ctx.globalAlpha = Math.max(0, Math.min(1, p.life/60)); ctx.fillStyle = p.color || "orange"; ctx.fillRect(p.x, p.y, 3, 3); ctx.globalAlpha = 1; });

  // player
  if (characterSprite.complete && characterSprite.naturalWidth !== 0) {
    if (!(player.invincible && Math.floor(performance.now()/120) % 2 === 0)) {
      ctx.drawImage(characterSprite, player.x, player.y, player.width, player.height);
    }
  } else {
    ctx.fillStyle = "blue"; ctx.fillRect(player.x, player.y, player.width, player.height);
  }

  ctx.restore();

  // HUD — adapt font sizes for mobile
  const small = canvas.width < 600;
  ctx.fillStyle = "black";
  ctx.font = small ? "14px Arial" : "18px Arial";
  ctx.fillText(`Lvl ${levelIndex+1}/${levels.length}`, 12, 24);
  ctx.fillText(`Coins: ${coinsCollected}`, 12, 24 + (small?20:26));
  ctx.fillText(`Score: ${score}`, 12, 24 + (small?40:52));
  ctx.fillText(`Lives: ${lives}`, 12, 24 + (small?60:78));
  if (player.invincible) ctx.fillText("Invincible!", 12, 24 + (small?80:104));
  if (player.hasFire) ctx.fillText("Fire: Ready", canvas.width - 130, 24);

  // level timer
  const secondsLeft = Math.max(0, Math.floor(levelTimer / TICKS_PER_SECOND));
  ctx.fillStyle = "black";
  ctx.font = small ? "14px Arial" : "16px Arial";
  ctx.fillText(`Time: ${secondsLeft}s`, canvas.width - (small?110:140), 24);

  // top-right small panel for high score readability
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(canvas.width - 220, 34, 200, 38);
  ctx.fillStyle = "white"; ctx.font = "14px Arial"; ctx.fillText(`High: ${getHighScore()}`, canvas.width - 200, 58);

  // overlays
  if (paused) {
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "white"; ctx.font = "46px Arial"; ctx.fillText("PAUSED", canvas.width/2 - 100, canvas.height/2);
  }
  if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, canvas.height/2 - 60, canvas.width, 140);
    ctx.fillStyle = "white"; ctx.font = "48px Arial"; ctx.fillText("GAME OVER", canvas.width/2 - 160, canvas.height/2);
    ctx.font = "20px Arial"; ctx.fillText("Tap the screen to restart (or use buttons)", canvas.width/2 - 160, canvas.height/2 + 40);
  } else if (gameWon) {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, canvas.height/2 - 60, canvas.width, 140);
    ctx.fillStyle = "white"; ctx.font = "42px Arial"; ctx.fillText("YOU WIN!", canvas.width/2 - 100, canvas.height/2);
    ctx.font = "20px Arial"; ctx.fillText(`Final Score: ${score}`, canvas.width/2 - 70, canvas.height/2 + 40);
  }

  // small help text at bottom
  ctx.font = "12px Arial"; ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText("Controls: use on-screen buttons or arrow keys/A-D (desktop).", 12, canvas.height - 12);

  // also reflect minimal HUD into DOM for accessibility on tiny screens
  hudSmall.innerHTML = `Lvl:${levelIndex+1} • Coins:${coinsCollected} • Score:${score} • Lives:${lives} • Time:${secondsLeft}s`;
}

/* --------------------------------------------------------
   Game loop orchestration
   -------------------------------------------------------- */
let lastTime = performance.now();
function gameLoop(now = performance.now()) {
  const dt = now - lastTime;
  lastTime = now;
  // keep audio resumed on first gesture (some browsers)
  if (!audioCtx && !showTitle) ensureAudio();

  // update & draw
  for (let i=0;i<1;i++) update();
  draw();

  if (!gameOver && !gameWon && !showTitle) requestAnimationFrame(gameLoop);
  else if (showTitle) {
    // draw title overlay remains handled by DOM element; but continue loop to flash
    // we still want animation for parallax behind overlay
    bgLayers.forEach(layer => {
      // minor movement to animate clouds even while title is shown
      if (layer.name === "clouds") layer.clouds.forEach(c => { c.x += 0.02; });
    });
    requestAnimationFrame(gameLoop);
  }
}

/* --------------------------------------------------------
   Title & click-to-start handling
   -------------------------------------------------------- */
function showTitleOverlay(show=true) {
  showTitle = show;
  if (show) {
    titleOverlay.classList.remove("hidden");
    titleHighScore.innerText = `High Score: ${getHighScore()}`;
  } else {
    titleOverlay.classList.add("hidden");
  }
}
titleOverlay.addEventListener("click", (e) => {
  // start/resume the game
  ensureAudio();
  showTitleOverlay(false);
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
});

/* restart on click when game over or win */
canvas.addEventListener("click", () => {
  if (!gameOver && !gameWon) return;
  if (gameOver) { if (lives > 0) resetToLevel(levelIndex); else resetToLevel(0); showTitleOverlay(false); lastTime = performance.now(); requestAnimationFrame(gameLoop); }
  else if (gameWon) { resetToLevel(0); showTitleOverlay(false); lastTime = performance.now(); requestAnimationFrame(gameLoop); }
});

/* keyboard Enter to restart */
document.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && (gameOver || gameWon)) {
    if (lives > 0) resetToLevel(levelIndex); else resetToLevel(0);
    showTitleOverlay(false);
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
});

/* --------------------------------------------------------
   Utilities & debug console integration
   -------------------------------------------------------- */
window.__MOBILEGAME = {
  addCoins(n=10) { coinsCollected+=n; score += n*10; },
  nextLevel() { resetToLevel(Math.min(levelIndex+1, levels.length-1)); },
  giveLife() { lives++; },
  setTime(s) { levelTimer = s * TICKS_PER_SECOND; },
  toggleInvincible() { player.invincible = !player.invincible; },
  teleport(x) { player.x = x; cameraX = Math.max(0, Math.min(player.x - canvas.width * 0.3, levels[levelIndex].width - canvas.width)); }
};

/* --------------------------------------------------------
   Boot sequence: wait for images then start
   -------------------------------------------------------- */
let assetsLoaded = 0;
function assetReady() { assetsLoaded++; if (assetsLoaded >= 3) { initGame(); showTitleOverlay(true); } }
characterSprite.onload = assetReady;
flagSprite.onload = assetReady;
coinSprite.onload = assetReady;
// If images fail to load quickly, still start after short timeout for mobile
setTimeout(()=>{ if (assetsLoaded < 3) { initGame(); showTitleOverlay(true); } }, 2500);

/* --------------------------------------------------------
   End of file
   -------------------------------------------------------- */

/* Notes:
 - The file preserves and expands on your original features:
   coins, goombas, spikes, pits, power-ups, mystery boxes, flags.
 - Added mobile-first responsive canvas, on-screen touch buttons, parallax,
   additional enemies (bats, cannons), fireball projectile, checkpoints,
   level timer, particles, simple WebAudio sounds, and persistence for high score.
 - Tweak constants (speeds, counts, timers) near top of file for balancing.
 - If you'd like audio samples instead of synth beeps, I can swap them in.
 - If you want the file split into modules, tell me and I will export separate files.
*/


/* =====================================================================
   GAMEPLUS EXPANSION PACK
   - Adds: settings menu, achievements, quests, toasts, moving platforms,
           springs, gems, secret letters, boss prototype,
           and extra content/data (to bring the file to ~5000 lines).
   - Designed to be appended to your existing game.js without breaking it.
   ===================================================================== */

;(() => {
  "use strict";

  // Guard: if the base game didn't load, do nothing.
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (typeof canvas === "undefined" || typeof ctx === "undefined") return;

  const GP = (window.GamePlus = window.GamePlus || {});
  GP.VERSION = "2026.01.10";
  GP.BUILD = "gameplus-5000lines";

  /* --------------------------------------------------------
     Small utility helpers
     -------------------------------------------------------- */
  const U = GP.U = {
    clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
    lerp(a, b, t) { return a + (b - a) * t; },
    rand(min, max) { return min + Math.random() * (max - min); },
    randi(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); },
    choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    sign(v) { return v < 0 ? -1 : 1; },
    now() { return performance && performance.now ? performance.now() : Date.now(); },
    pad2(n) { return String(n).padStart(2, "0"); },
    fmtTime(sec) {
      sec = Math.max(0, Math.floor(sec));
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${U.pad2(s)}`;
    },
    safeJSONParse(str, fallback) {
      try { return JSON.parse(str); } catch (e) { return fallback; }
    },
    safeJSONStringify(obj, fallback="") {
      try { return JSON.stringify(obj); } catch (e) { return fallback; }
    }
  };

  /* --------------------------------------------------------
     Lightweight event bus (for add-ons)
     -------------------------------------------------------- */
  GP.bus = GP.bus || (() => {
    const handlers = new Map();
    return {
      on(evt, fn) {
        if (!handlers.has(evt)) handlers.set(evt, new Set());
        handlers.get(evt).add(fn);
        return () => handlers.get(evt)?.delete(fn);
      },
      emit(evt, payload) {
        const set = handlers.get(evt);
        if (!set) return;
        set.forEach(fn => {
          try { fn(payload); } catch (e) { /* ignore */ }
        });
      }
    };
  })();

  /* --------------------------------------------------------
     Storage (versioned)
     -------------------------------------------------------- */
  GP.storage = GP.storage || (() => {
    const prefix = "omyusuf_gameplus_v2__";
    return {
      get(key, fallback=null) {
        try {
          const raw = localStorage.getItem(prefix + key);
          if (raw == null) return fallback;
          return U.safeJSONParse(raw, fallback);
        } catch (e) { return fallback; }
      },
      set(key, value) {
        try { localStorage.setItem(prefix + key, U.safeJSONStringify(value, "null")); } catch (e) { /* ignore */ }
      },
      del(key) {
        try { localStorage.removeItem(prefix + key); } catch (e) { /* ignore */ }
      }
    };
  })();

  /* --------------------------------------------------------
     Settings (accessibility-friendly)
     -------------------------------------------------------- */
  const SETTINGS_DEFAULTS = {
    masterVolume: 0.9,
    music: false,
    sfx: true,
    screenShake: true,
    reducedMotion: false,
    showMinimap: true,
    showToasts: true,
    showHitboxes: false,
    difficultyAssist: true,
    largeText: false
  };
  GP.settings = GP.settings || GP.storage.get("settings", SETTINGS_DEFAULTS);
  GP.saveSettings = () => GP.storage.set("settings", GP.settings);

  // Apply settings that affect the base game right away.
  function applySettingsToBase() {
    // WebAudio synth volume is hard-coded in base beeps; we apply a multiplier by wrapping playBeep.
    if (typeof playBeep === "function" && !playBeep.__gpWrapped) {
      const _base = playBeep;
      const wrapped = function(freq=440, type="sine", duration=0.08, volume=0.08) {
        if (!GP.settings.sfx) return;
        const v = volume * U.clamp(GP.settings.masterVolume, 0, 1);
        return _base(freq, type, duration, v);
      };
      wrapped.__gpWrapped = true;
      window.playBeep = wrapped;
    }
  }
  applySettingsToBase();

  /* --------------------------------------------------------
     Simple toast system (messages that fade)
     -------------------------------------------------------- */
  GP.toasts = GP.toasts || [];
  GP.toast = function(text, opts={}) {
    if (!GP.settings.showToasts) return;
    const t = {
      text: String(text || ""),
      x: (opts.x ?? canvas.width * 0.5),
      y: (opts.y ?? canvas.height * 0.22),
      life: (opts.life ?? 150),
      maxLife: (opts.life ?? 150),
      size: (opts.size ?? (GP.settings.largeText ? 26 : 18)),
      align: opts.align || "center",
      color: opts.color || "white",
      shadow: opts.shadow ?? true
    };
    GP.toasts.push(t);
  };

  /* --------------------------------------------------------
     Stats tracking (for achievements/quests)
     -------------------------------------------------------- */
  GP.stats = GP.storage.get("stats", {
    coins: 0,
    scoreBest: 0,
    kills: 0,
    levels: 0,
    deaths: 0,
    shots: 0,
    distance: 0,
    jumps: 0,
    timePlayedSec: 0,
    secretLetters: 0
  });
  GP.saveStats = () => GP.storage.set("stats", GP.stats);

  // Update rolling distance/time
  let __gpLastX = (typeof player !== "undefined") ? player.x : 0;
  let __gpLastTick = U.now();

  /* --------------------------------------------------------
     Achievements (data-driven)
     -------------------------------------------------------- */
  GP.ach = GP.ach || {};
  GP.ach.unlocked = GP.storage.get("ach_unlocked", {}); // id -> true
  GP.ach.unlock = function(id) {
    if (GP.ach.unlocked[id]) return false;
    GP.ach.unlocked[id] = true;
    GP.storage.set("ach_unlocked", GP.ach.unlocked);
    const def = GP.ach.defsById[id];
    GP.toast(`Achievement: ${def?.name || id}`, { y: canvas.height * 0.18, life: 220, size: GP.settings.largeText ? 28 : 20 });
    return true;
  };
  GP.ach.defs = GP.ach.defs || [];
  GP.ach.defsById = GP.ach.defsById || Object.create(null);

  // Bulk register
  GP.ach.register = function(defs) {
    defs.forEach(d => {
      GP.ach.defs.push(d);
      GP.ach.defsById[d.id] = d;
    });
  };

  // Evaluate achievements by type/threshold
  GP.ach.evaluate = function() {
    for (let i = 0; i < GP.ach.defs.length; i++) {
      const d = GP.ach.defs[i];
      if (GP.ach.unlocked[d.id]) continue;
      const v =
        d.type === "coins" ? GP.stats.coins :
        d.type === "score" ? Math.max(GP.stats.scoreBest, score || 0) :
        d.type === "kills" ? GP.stats.kills :
        d.type === "levels" ? GP.stats.levels :
        d.type === "deaths" ? GP.stats.deaths :
        d.type === "shots" ? GP.stats.shots :
        d.type === "distance" ? GP.stats.distance :
        0;
      if (v >= d.threshold) GP.ach.unlock(d.id);
    }
  };

  /* --------------------------------------------------------
     Quests (pick 3 "daily" quests)
     -------------------------------------------------------- */
  GP.quests = GP.quests || {};
  GP.quests.pool = GP.quests.pool || [];
  GP.quests.active = GP.storage.get("quests_active", null);
  GP.quests.lastDayKey = GP.storage.get("quests_daykey", "");

  function dayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${U.pad2(d.getMonth()+1)}-${U.pad2(d.getDate())}`;
  }

  GP.quests.rollDaily = function(force=false) {
    const dk = dayKey();
    if (!force && GP.quests.lastDayKey === dk && GP.quests.active) return;

    // weighted pick 3
    const picks = [];
    const used = new Set();
    const totalWeight = GP.quests.pool.reduce((a,q)=>a+(q.weight||1),0) || 1;

    function pickOne() {
      let r = Math.random() * totalWeight;
      for (const q of GP.quests.pool) {
        r -= (q.weight || 1);
        if (r <= 0) return q;
      }
      return GP.quests.pool[GP.quests.pool.length-1];
    }

        while (picks.length < 3 && GP.quests.pool.length) {
      const q = pickOne();
      if (used.has(q.id)) continue;
      used.add(q.id);
      picks.push({ ...q, progress: 0, done: false });
    }

    GP.quests.active = {
      day: dk,
      quests: picks,
      claimed: false
    };
    GP.quests.lastDayKey = dk;
GP.storage.set("quests_active", GP.quests.active);
    GP.storage.set("quests_daykey", dk);
  };

  GP.quests.updateProgress = function(type, delta=1, extra={}) {
    if (!GP.quests.active) return;
    let changed = false;

    GP.quests.active.quests.forEach(q => {
      if (q.done) return;
      if (q.type !== type) return;

      // Special: time_left uses extra.secondsLeft
      if (q.type === "time_left") {
        const s = extra.secondsLeft ?? 0;
        if (s >= q.target) {
          q.progress = q.target;
          q.done = true;
          changed = true;
          GP.toast(`Quest complete: ${q.title}`, { y: canvas.height*0.26, life: 220 });
        }
        return;
      }

      q.progress = U.clamp(q.progress + delta, 0, q.target);
      if (q.progress >= q.target) {
        q.done = true;
        changed = true;
        GP.toast(`Quest complete: ${q.title}`, { y: canvas.height*0.26, life: 220 });
      } else {
        changed = true;
      }
    });

    if (changed) GP.storage.set("quests_active", GP.quests.active);
  };

  GP.quests.tryClaim = function() {
    if (!GP.quests.active || GP.quests.active.claimed) return false;
    const allDone = GP.quests.active.quests.every(q => q.done);
    if (!allDone) return false;

    const rewardCoins = GP.quests.active.quests.reduce((a,q)=>a+q.rewardCoins,0);
    const rewardScore = GP.quests.active.quests.reduce((a,q)=>a+q.rewardScore,0);

    // Apply rewards to this run
    coinsCollected += rewardCoins;
    score += rewardScore;

    GP.quests.active.claimed = true;
    GP.storage.set("quests_active", GP.quests.active);
    GP.toast(`Daily reward claimed: +${rewardCoins} coins, +${rewardScore} score`, { y: canvas.height*0.30, life: 260, size: GP.settings.largeText ? 26 : 18 });
    return true;
  };

  // Roll quests on load
  GP.quests.rollDaily(false);

  /* --------------------------------------------------------
     Extra level features (moving platforms, springs, gems, secrets)
     -------------------------------------------------------- */
  GP.levelEnhancer = GP.levelEnhancer || {};

  GP.levelEnhancer.addBasics = function(L, difficulty) {
    // Defaults so old code doesn't explode
    if (!L.movingPlatforms) L.movingPlatforms = [];
    if (!L.springs) L.springs = [];
    if (!L.gems) L.gems = [];
    if (!L.secrets) L.secrets = [];
    if (!L.doors) L.doors = [];
    if (!L.keys) L.keys = [];
    if (!L.portals) L.portals = [];
    if (!L.decor) L.decor = [];

    // Moving platforms: keep count small for performance
    const count = Math.min(2 + Math.floor(difficulty/3), 5);
    for (let i=0; i<count; i++) {
      const px = 450 + i*520 + U.rand(-80, 80);
      const py = L.groundY - 180 - U.rand(0, 120);
      const w = 120;
      const h = 18;
      const range = 90 + difficulty*12;
      const spd = (GP.settings.reducedMotion ? 0.6 : 1.0) * (0.8 + difficulty*0.06);
      L.movingPlatforms.push({
        x: px, y: py, width: w, height: h,
        baseX: px, baseY: py,
        axis: (i%2===0) ? "x" : "y",
        range,
        speed: spd,
        phase: Math.random()*Math.PI*2,
        dx: 0, dy: 0
      });
    }

    // Springs
    const springCount = Math.min(1 + Math.floor(difficulty/4), 3);
    for (let i=0; i<springCount; i++) {
      const sx = 650 + i*700 + U.rand(-90, 90);
      L.springs.push({ x: sx, y: L.groundY - 12, width: 22, height: 12, power: 18 + difficulty*0.8 });
    }

    // Gems: bigger points than coins
    const gemCount = Math.min(6 + difficulty, 18);
    for (let i=0; i<gemCount; i++) {
      const gx = 260 + i*160 + U.rand(-50, 50);
      const gy = L.groundY - 110 - U.rand(0, 140);
      L.gems.push({ x: gx, y: gy, width: 18, height: 18, collected: false, hue: U.randi(180, 300), anim: Math.random()*10 });
    }

    // Secret letters: spells "OMAR" across levels (one per level, sometimes none)
    const letters = ["O","M","A","R"];
    if (difficulty <= levels.length && difficulty <= 10 && Math.random() < 0.85) {
      const letter = letters[(difficulty-1) % letters.length];
      const lx = 900 + U.rand(0, L.width - 1200);
      const ly = L.groundY - 210 - U.rand(0, 140);
      L.secrets.push({ kind: "letter", value: letter, x: lx, y: ly, width: 26, height: 26, collected: false });
    }

    // Key + door: optional shortcut
    if (difficulty >= 4 && Math.random() < 0.7) {
      const kx = 500 + U.rand(0, L.width*0.45);
      const ky = L.groundY - 170 - U.rand(0, 90);
      L.keys.push({ x: kx, y: ky, width: 18, height: 18, collected: false });
      const dx = L.width - 420 - U.rand(0, 120);
      const dy = L.groundY - 84;
      L.doors.push({ x: dx, y: dy, width: 44, height: 84, open: false });
    }

    // Portal: fun teleport for faster runs
    if (difficulty >= 6 && Math.random() < 0.5) {
      const ax = 350 + U.rand(0, L.width*0.35);
      const bx = L.width - 650 - U.rand(0, 220);
      const py = L.groundY - 70 - U.rand(0, 120);
      L.portals.push({ ax, ay: py, bx, by: py, r: 22, cooldown: 0 });
    }

    // Decoration: floating fireflies (pure visual)
    const fireflyCount = Math.min(20, 8 + difficulty*1.2);
    for (let i=0;i<fireflyCount;i++) {
      L.decor.push({
        kind: "firefly",
        x: U.rand(0, L.width),
        y: U.rand(60, L.groundY-60),
        phase: U.rand(0, Math.PI*2),
        speed: U.rand(0.002, 0.01),
        radius: U.rand(1, 2.6)
      });
    }
  };

  // Patch createLevels to enhance each generated level
  if (typeof createLevels === "function" && !createLevels.__gpPatched) {
    const _createLevels = createLevels;
    createLevels = function() {
      _createLevels();
      try {
        for (let i=0; i<levels.length; i++) {
          const L = levels[i];
          GP.levelEnhancer.addBasics(L, i+1);
        }
      } catch (e) { /* ignore */ }
    };
    createLevels.__gpPatched = true;
  }

  // Patch resetToLevel so new feature state resets properly
  if (typeof resetToLevel === "function" && !resetToLevel.__gpPatched) {
    const _resetToLevel = resetToLevel;
    resetToLevel = function(idx) {
      _resetToLevel(idx);
      try {
        const L = levels[levelIndex];
        (L.gems || []).forEach(g => g.collected = false);
        (L.secrets || []).forEach(s => s.collected = false);
        (L.keys || []).forEach(k => k.collected = false);
        (L.doors || []).forEach(d => d.open = false);
        (L.portals || []).forEach(p => p.cooldown = 0);
      } catch (e) { /* ignore */ }
    };
    resetToLevel.__gpPatched = true;
  }

  /* --------------------------------------------------------
     UI Modes: settings, quests, achievements
     -------------------------------------------------------- */
  GP.ui = GP.ui || {};
  GP.ui.mode = "none"; // none | settings | quests | achievements
  GP.ui.selection = 0;
  GP.ui.pointer = { x: 0, y: 0 };
  GP.ui.lastClick = 0;

  function setMode(mode) {
    GP.ui.mode = mode;
    GP.ui.selection = 0;
  }

  GP.ui.banner = {
    text: "",
    life: 0,
    max: 0
  };
  function showBanner(text, life=140) {
    GP.ui.banner.text = text;
    GP.ui.banner.life = life;
    GP.ui.banner.max = life;
  }

  // Very tiny shop menu (spend coinsCollected)
  GP.shop = GP.shop || {
    items: [
      { id:"life", name:"+1 Life", cost: 35, apply() { lives += 1; GP.toast("+1 Life!", { y: canvas.height*0.22 }); } },
      { id:"fire", name:"Fire Power", cost: 50, apply() { player.hasFire = true; GP.toast("Fire power unlocked!", { y: canvas.height*0.22 }); } },
      { id:"star", name:"Invincible (10s)", cost: 60, apply() { player.invincible = true; player.invincibleTimer = 600; GP.toast("Star power!", { y: canvas.height*0.22 }); } },
      { id:"time", name:"+15s Timer", cost: 40, apply() { levelTimer += 15 * TICKS_PER_SECOND; GP.toast("+15 seconds!", { y: canvas.height*0.22 }); } }
    ],
    buy(index) {
      const item = GP.shop.items[index];
      if (!item) return false;
      if (coinsCollected < item.cost) {
        GP.toast("Not enough coins.", { y: canvas.height*0.22 });
        return false;
      }
      coinsCollected -= item.cost;
      item.apply();
      return true;
    }
  };

  function getCanvasPos(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  // Pointer handling:
  // - Hot corners open menus even on mobile
  // - When a menu is open, taps are captured for UI clicks
  canvas.addEventListener("pointerdown", (ev) => {
    const p = getCanvasPos(ev);

    // Hot corners (mobile-friendly):
    if (GP.ui && GP.ui.mode === "none" && !showTitle && !gameOver && !gameWon) {
      // Top-right: Settings
      if (p.y < 70 && p.x > canvas.width - 70) { setMode("settings"); return; }
      // Top-left: Quests
      if (p.y < 70 && p.x < 70) { setMode("quests"); return; }
      // Top-middle-right: Achievements
      if (p.y < 70 && p.x > canvas.width - 170 && p.x <= canvas.width - 90) { setMode("achievements"); return; }
    }

    if (!GP.ui || GP.ui.mode === "none") return;
    GP.ui.pointer = p;
    GP.ui.lastClick = U.now();
  });

  // Toggle menus with keyboard shortcuts (desktop)
  document.addEventListener("keydown", (e) => {
    if (e.code === "KeyO") {
      if (showTitle || gameOver || gameWon) return;
      setMode(GP.ui.mode === "settings" ? "none" : "settings");
    }
    if (e.code === "KeyQ") {
      if (showTitle || gameOver || gameWon) return;
      setMode(GP.ui.mode === "quests" ? "none" : "quests");
    }
    if (e.code === "KeyH") {
      if (showTitle || gameOver || gameWon) return;
      setMode(GP.ui.mode === "achievements" ? "none" : "achievements");
    }
  });

  /* --------------------------------------------------------
     Boss prototype (only appears on final level)
     -------------------------------------------------------- */
  GP.boss = GP.boss || {
    active: false,
    hp: 0,
    maxHp: 0,
    x: 0,
    y: 0,
    width: 90,
    height: 90,
    dir: -1,
    cooldown: 0,
    intro: 0
  };

  function maybeSpawnBoss() {
    if (!levels || !levels.length) return;
    const isFinal = (levelIndex === levels.length - 1);
    if (!isFinal) {
      GP.boss.active = false;
      return;
    }
    const L = levels[levelIndex];
    if (!GP.boss.active) {
      GP.boss.active = true;
      GP.boss.maxHp = 14;
      GP.boss.hp = GP.boss.maxHp;
      GP.boss.x = L.width - 520;
      GP.boss.y = L.groundY - GP.boss.height;
      GP.boss.dir = -1;
      GP.boss.cooldown = 80;
      GP.boss.intro = 180;
      showBanner("FINAL BOSS!", 180);
      GP.toast("Defeat the boss to claim the last flag!", { y: canvas.height*0.30, life: 220 });
    }
  }

  function updateBoss(L) {
    const B = GP.boss;
    if (!B.active) return;

    if (B.intro > 0) {
      B.intro--;
      return;
    }

    const speed = 1.2 + (GP.settings.reducedMotion ? -0.3 : 0);
    B.x += speed * B.dir;
    if (B.x < L.width - 900) B.dir = 1;
    if (B.x > L.width - 240) B.dir = -1;

    if (B.cooldown > 0) B.cooldown--;
    if (B.cooldown <= 0) {
      B.cooldown = 80 + U.randi(0, 60);
      const dx = (player.x + player.width/2) - (B.x + B.width/2);
      const dy = (player.y + player.height/2) - (B.y + B.height/2);
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const vx = (dx / dist) * 4.2;
      const vy = (dy / dist) * 3.6 - 0.5;
      if (typeof spawnEnemyFire === "function") spawnEnemyFire(B.x + B.width/2, B.y + 18, vx, vy);
    }

    if (!player.invincible && rectsOverlap(player, B)) {
      damagePlayer();
    }

    for (let i = fireballs.length - 1; i >= 0; i--) {
      const f = fireballs[i];
      if (!f.friendly) continue;
      if (rectsOverlap(f, B)) {
        fireballs.splice(i, 1);
        B.hp = Math.max(0, B.hp - 1);
        score += 250;
        if (typeof spawnParticles === "function") spawnParticles(L, B.x + B.width/2, B.y + B.height/2, "purple", 12, 2.6);
        if (B.hp <= 0) {
          B.active = false;
          score += 2000;
          GP.toast("Boss defeated!", { y: canvas.height*0.25, life: 300, size: GP.settings.largeText ? 30 : 22 });
          showBanner("FLAG UNLOCKED!", 180);
          if (L.flag) L.flag.x = Math.min(L.flag.x, L.width - 220);
        }
      }
    }
  }

  /* --------------------------------------------------------
     Extra gameplay: update moving platforms + collisions carry
     -------------------------------------------------------- */
  function updatePlatforms(L) {
    if (!L.movingPlatforms) return;
    L.movingPlatforms.forEach(p => {
      const t = U.now() * 0.001;
      const s = Math.sin(t * p.speed + p.phase);
      const prevX = p.x, prevY = p.y;
      if (p.axis === "x") p.x = p.baseX + s * p.range;
      else p.y = p.baseY + s * (p.range * 0.6);
      p.dx = p.x - prevX;
      p.dy = p.y - prevY;
    });
  }

  function carryPlayerOnPlatforms(L) {
    if (!L.movingPlatforms) return;
    const px = player.x, py = player.y;
    const pw = player.width, ph = player.height;
    const feetY = py + ph;

    for (const p of L.movingPlatforms) {
      const onTop =
        (Math.abs(feetY - p.y) <= 2) &&
        (px + pw > p.x) && (px < p.x + p.width) &&
        (py < p.y) &&
        (player.vy >= 0);
      if (onTop) {
        player.x += p.dx;
        player.y += p.dy;
        player.x = U.clamp(player.x, 0, L.width - player.width);
      }
    }
  }

  function updateSprings(L) {
    if (!L.springs) return;
    L.springs.forEach(s => {
      if (rectsOverlap(player, s) && player.vy >= 0) {
        player.vy = -Math.max(12, s.power);
        player.jumping = true;
        GP.toast("Boing!", { y: canvas.height*0.22, life: 60, size: GP.settings.largeText ? 24 : 18 });
        if (typeof playBeep === "function") playBeep(960, "triangle", 0.06, 0.08);
      }
    });
  }

  function updateGemsAndSecrets(L) {
    if (L.gems) {
      for (const g of L.gems) {
        if (g.collected) continue;
        g.anim = (g.anim + 0.25) % 10;
        if (rectsOverlap(player, g)) {
          g.collected = true;
          score += 35;
          GP.stats.scoreBest = Math.max(GP.stats.scoreBest, score);
          GP.toast("+35", { x: (g.x - cameraX) + 10, y: g.y, life: 70, size: 16 });
          if (typeof spawnParticles === "function") spawnParticles(L, g.x+8, g.y+8, "cyan", 10, 2.2);
        }
      }
    }

    if (L.secrets) {
      for (const s of L.secrets) {
        if (s.collected) continue;
        if (rectsOverlap(player, s)) {
          s.collected = true;
          GP.stats.secretLetters += 1;
          GP.saveStats();
          GP.toast(`Secret letter: ${s.value}`, { y: canvas.height*0.20, life: 240 });
          if (typeof playBeep === "function") playBeep(1200, "square", 0.08, 0.06);
        }
      }
    }
  }

  let __gpHasKeyThisLevel = false;
  function updateKeysDoorsPortals(L) {
    if (L.keys) {
      for (const k of L.keys) {
        if (k.collected) continue;
        if (rectsOverlap(player, k)) {
          k.collected = true;
          __gpHasKeyThisLevel = true;
          GP.toast("Key collected!", { y: canvas.height*0.20, life: 180 });
          if (typeof playBeep === "function") playBeep(880, "square", 0.06, 0.07);
        }
      }
    }
    if (L.doors) {
      for (const d of L.doors) {
        if (!d.open && __gpHasKeyThisLevel) {
          const near = Math.abs((player.x + player.width/2) - (d.x + d.width/2)) < 90;
          if (near) {
            d.open = true;
            score += 150;
            GP.toast("Door opened!", { y: canvas.height*0.20, life: 180 });
          }
        }
        if (!d.open && rectsOverlap(player, d)) {
          if (player.x < d.x) player.x = d.x - player.width - 1;
          else player.x = d.x + d.width + 1;
        }
      }
    }
    if (L.portals) {
      for (const p of L.portals) {
        if (p.cooldown > 0) p.cooldown--;
        const a = { x: p.ax - p.r, y: p.ay - p.r, width: p.r*2, height: p.r*2 };
        const b = { x: p.bx - p.r, y: p.by - p.r, width: p.r*2, height: p.r*2 };
        if (p.cooldown <= 0 && rectsOverlap(player, a)) {
          player.x = p.bx; player.y = p.by - player.height;
          p.cooldown = 90;
          GP.toast("Woosh!", { y: canvas.height*0.22, life: 80 });
          if (typeof playBeep === "function") playBeep(760, "sawtooth", 0.06, 0.06);
        } else if (p.cooldown <= 0 && rectsOverlap(player, b)) {
          player.x = p.ax; player.y = p.ay - player.height;
          p.cooldown = 90;
          GP.toast("Woosh!", { y: canvas.height*0.22, life: 80 });
          if (typeof playBeep === "function") playBeep(760, "sawtooth", 0.06, 0.06);
        }
      }
    }
  }

  /* --------------------------------------------------------
     Patch update(): inject platform collisions + stats/quests
     -------------------------------------------------------- */
  if (typeof update === "function" && !update.__gpPatched) {
    const _update = update;

    update = function() {
      const beforeCoins = coinsCollected;
      const beforeScore = score;
      const beforeLives = lives;
      const beforeLevel = levelIndex;

      const L = levels && levels[levelIndex];

      let oldSpeed = player.speed;
      if (GP.settings.difficultyAssist && L) {
        const progress = (player.x / (L.width || 1));
        const timeSec = Math.max(1, levelTimer / TICKS_PER_SECOND);
        if (timeSec < 30 && progress < 0.6) player.speed = oldSpeed * 1.07;
      }

      let stairsBackup = null;
      if (L && L.movingPlatforms && L.movingPlatforms.length) {
        updatePlatforms(L);
        stairsBackup = L.stairs;
        const extra = L.movingPlatforms.map(p => ({ x:p.x, y:p.y, width:p.width, height:p.height, __gp:true }));
        L.stairs = stairsBackup.concat(extra);
      }

      _update();

      if (L && stairsBackup) L.stairs = stairsBackup;
      player.speed = oldSpeed;

      if (beforeLevel !== levelIndex) {
        __gpHasKeyThisLevel = false;
        showBanner(`Level ${levelIndex+1}`, 120);
      }

      const L2 = levels && levels[levelIndex];
      if (L2) {
        carryPlayerOnPlatforms(L2);
        updateSprings(L2);
        updateGemsAndSecrets(L2);
        updateKeysDoorsPortals(L2);
        maybeSpawnBoss();
        updateBoss(L2);
      }

      const dtSec = (U.now() - __gpLastTick) / 1000;
      __gpLastTick = U.now();
      GP.stats.timePlayedSec += Math.max(0, Math.min(dtSec, 0.25));

      if (typeof player !== "undefined" && L2) {
        const dx = Math.abs(player.x - __gpLastX);
        __gpLastX = player.x;
        GP.stats.distance += dx * 0.05;
      }

      if (coinsCollected > beforeCoins) {
        const delta = coinsCollected - beforeCoins;
        GP.stats.coins += delta;
        GP.quests.updateProgress("coins", delta);
      }
      if (score > beforeScore) {
        GP.stats.scoreBest = Math.max(GP.stats.scoreBest, score);
      }
      if (lives < beforeLives) {
        GP.stats.deaths += (beforeLives - lives);
      }

      if (L2) {
        const gDead = (L2.goombas || []).filter(g=>g.dead).length;
        const bDead = (L2.bats || []).filter(b=>b.dead).length;
        const totalDead = gDead + bDead;
        L2.__gpDeadSnapshot = L2.__gpDeadSnapshot || 0;
        if (totalDead > L2.__gpDeadSnapshot) {
          const delta = totalDead - L2.__gpDeadSnapshot;
          L2.__gpDeadSnapshot = totalDead;
          GP.stats.kills += delta;
          GP.quests.updateProgress("kills", delta);
        }
      }

      if (player.hasFire) {
        GP.__lastFriendly = GP.__lastFriendly || 0;
        const friendlyNow = fireballs.filter(f=>f.friendly).length;
        if (friendlyNow > GP.__lastFriendly) {
          const delta = friendlyNow - GP.__lastFriendly;
          GP.stats.shots += delta;
          GP.quests.updateProgress("shots", delta);
        }
        GP.__lastFriendly = friendlyNow;
      }

      GP.__lastLevelIndex = GP.__lastLevelIndex ?? levelIndex;
      if (levelIndex > GP.__lastLevelIndex) {
        GP.stats.levels += (levelIndex - GP.__lastLevelIndex);
        GP.quests.updateProgress("levels", (levelIndex - GP.__lastLevelIndex));
        GP.__lastLevelIndex = levelIndex;

        const secondsLeft = Math.max(0, Math.floor(levelTimer / TICKS_PER_SECOND));
        GP.quests.updateProgress("time_left", 1, { secondsLeft });
      }

      GP.__saveTicker = (GP.__saveTicker || 0) + 1;
      if (GP.__saveTicker % 90 === 0) {
        GP.ach.evaluate();
        GP.saveStats();
      }
    };

    update.__gpPatched = true;
  }

  /* --------------------------------------------------------
     Patch draw(): render add-on content and menus
     -------------------------------------------------------- */
  if (typeof draw === "function" && !draw.__gpPatched) {
    const _draw = draw;

    draw = function() {
      _draw();

      const L = levels && levels[levelIndex];
      if (L) {
        ctx.save();
        ctx.translate(-cameraX, 0);

        if (!GP.settings.reducedMotion) {
          for (const d of (L.decor || [])) {
            if (d.kind !== "firefly") continue;
            const t = U.now() * 0.001;
            const fx = d.x + Math.sin(t + d.phase) * 12;
            const fy = d.y + Math.cos(t*1.2 + d.phase) * 8;
            ctx.globalAlpha = 0.65;
            ctx.fillStyle = "rgba(255,255,180,0.9)";
            ctx.beginPath();
            ctx.arc(fx, fy, d.radius, 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }

        (L.movingPlatforms || []).forEach(p => {
          ctx.fillStyle = "rgba(20,20,20,0.85)";
          ctx.fillRect(p.x, p.y, p.width, p.height);
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fillRect(p.x, p.y, p.width, 4);
        });

        (L.springs || []).forEach(s => {
          ctx.fillStyle = "rgba(0,120,0,0.85)";
          ctx.fillRect(s.x, s.y, s.width, s.height);
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fillRect(s.x, s.y, s.width, 3);
        });

        (L.gems || []).forEach(g => {
          if (g.collected) return;
          const wob = Math.sin(g.anim*0.6)*3;
          ctx.save();
          ctx.translate(g.x + g.width/2, g.y + g.height/2 + wob);
          ctx.rotate(Math.sin(g.anim*0.3)*0.2);
          ctx.fillStyle = "rgba(0,200,255,0.9)";
          ctx.beginPath();
          ctx.moveTo(0, -8);
          ctx.lineTo(8, 0);
          ctx.lineTo(0, 8);
          ctx.lineTo(-8, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });

        (L.secrets || []).forEach(s => {
          if (s.collected) return;
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fillRect(s.x, s.y, s.width, s.height);
          ctx.fillStyle = "rgba(0,0,0,0.9)";
          ctx.font = "18px Arial";
          ctx.fillText(String(s.value || "?"), s.x + 7, s.y + 20);
        });

        (L.keys || []).forEach(k => {
          if (k.collected) return;
          ctx.fillStyle = "rgba(255,215,0,0.95)";
          ctx.beginPath();
          ctx.arc(k.x + 8, k.y + 8, 8, 0, Math.PI*2);
          ctx.fill();
          ctx.fillRect(k.x + 12, k.y + 6, 10, 4);
        });
        (L.doors || []).forEach(d => {
          ctx.fillStyle = d.open ? "rgba(60,160,60,0.35)" : "rgba(110,70,30,0.95)";
          ctx.fillRect(d.x, d.y, d.width, d.height);
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(d.x+6, d.y+8, d.width-12, d.height-16);
        });

        (L.portals || []).forEach(p => {
          ctx.globalAlpha = p.cooldown>0 ? 0.35 : 0.85;
          ctx.strokeStyle = "rgba(180,0,255,0.9)";
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(p.ax, p.ay, p.r, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.arc(p.bx, p.by, p.r, 0, Math.PI*2); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1;
        });

        if (GP.boss.active) {
          const B = GP.boss;
          ctx.fillStyle = "rgba(120,0,120,0.85)";
          ctx.fillRect(B.x, B.y, B.width, B.height);
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fillRect(B.x, B.y, B.width, 6);
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(B.x, B.y - 16, B.width, 10);
          ctx.fillStyle = "rgba(255,0,255,0.9)";
          const bw = (B.hp / Math.max(1, B.maxHp)) * B.width;
          ctx.fillRect(B.x, B.y - 16, bw, 10);
        }

        ctx.restore();
      }

      if (GP.toasts && GP.toasts.length) {
        for (let i = GP.toasts.length - 1; i >= 0; i--) {
          const t = GP.toasts[i];
          t.life--;
          const alpha = U.clamp(t.life / t.maxLife, 0, 1);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = t.color;
          ctx.font = `${t.size}px Arial`;
          ctx.textAlign = t.align;
          if (t.shadow) {
            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur = 10;
          }
          ctx.fillText(t.text, t.x, t.y);
          ctx.restore();
          t.y -= 0.08;
          if (t.life <= 0) GP.toasts.splice(i, 1);
        }
      }

      if (GP.ui.banner.life > 0) {
        GP.ui.banner.life--;
        const a = U.clamp(GP.ui.banner.life / GP.ui.banner.max, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.85 * a;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 92, canvas.width, 44);
        ctx.fillStyle = "white";
        ctx.font = GP.settings.largeText ? "26px Arial" : "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(GP.ui.banner.text, canvas.width/2, 122);
        ctx.restore();
      }

      if (GP.settings.showMinimap && levels && levels[levelIndex]) {
        const L = levels[levelIndex];
        const mapW = 180, mapH = 38;
        const mx = canvas.width - mapW - 14;
        const my = canvas.height - mapH - 92;
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(mx, my, mapW, mapH);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(mx+6, my+6, mapW-12, mapH-12);

        const t = (player.x / Math.max(1, L.width));
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(mx+6 + t*(mapW-14), my+10, 6, mapH-20);

        const ft = (L.flag?.x || (L.width-100)) / Math.max(1, L.width);
        ctx.fillStyle = "rgba(255,0,0,0.9)";
        ctx.fillRect(mx+6 + ft*(mapW-14), my+10, 4, mapH-20);
        ctx.restore();
      }

      if (GP.ui.mode !== "none") {
        drawMenuOverlay();
      }
    };

    draw.__gpPatched = true;
  }

  function drawMenuOverlay() {
    const w = Math.min(520, canvas.width - 40);
    const h = Math.min(380, canvas.height - 60);
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle = "rgba(20,20,20,0.88)";
    ctx.fillRect(x,y,w,h);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(x,y,w,56);

    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = GP.settings.largeText ? "24px Arial" : "20px Arial";
    ctx.fillText(titleForMode(GP.ui.mode), x+16, y+36);

    ctx.font = GP.settings.largeText ? "18px Arial" : "14px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("Desktop: O=Settings • Q=Quests • H=Achievements • Tap outside to close", x+16, y+54);

    if (GP.ui.lastClick && (U.now() - GP.ui.lastClick < 140)) {
      const p = GP.ui.pointer;
      if (p.x < x || p.x > x+w || p.y < y || p.y > y+h) {
        GP.ui.lastClick = 0;
        setMode("none");
        return;
      }
    }

    const bodyY = y + 72;
    if (GP.ui.mode === "settings") drawSettings(x, bodyY, w, h-90);
    if (GP.ui.mode === "quests") drawQuests(x, bodyY, w, h-90);
    if (GP.ui.mode === "achievements") drawAchievements(x, bodyY, w, h-90);

    ctx.restore();
  }

  function titleForMode(mode) {
    if (mode === "settings") return "Settings";
    if (mode === "quests") return "Daily Quests";
    if (mode === "achievements") return "Achievements";
    return "Menu";
  }

  function inRect(x,y,w,h,p) {
    return !!p && (p.x >= x && p.x <= x+w && p.y >= y && p.y <= y+h);
  }

  function drawToggleRow(x, y, w, label, value, onToggle) {
    const rowH = GP.settings.largeText ? 44 : 34;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x+12, y, w-24, rowH);

    ctx.fillStyle = "white";
    ctx.font = GP.settings.largeText ? "20px Arial" : "16px Arial";
    ctx.textAlign = "left";
    ctx.fillText(label, x+22, y + (rowH*0.68));

    ctx.textAlign = "right";
    ctx.fillStyle = value ? "rgba(80,220,120,0.95)" : "rgba(220,80,80,0.95)";
    ctx.fillText(value ? "ON" : "OFF", x + w - 24, y + (rowH*0.68));

    if (GP.ui.lastClick && (U.now() - GP.ui.lastClick < 140)) {
      const p = GP.ui.pointer;
      if (inRect(x+12, y, w-24, rowH, p)) {
        GP.ui.lastClick = 0;
        onToggle();
      }
    }
    return rowH + 10;
  }

  function drawSettings(x, y, w, h) {
    let cy = y + 10;
    cy += drawToggleRow(x, cy, w, "SFX", GP.settings.sfx, () => { GP.settings.sfx = !GP.settings.sfx; GP.saveSettings(); applySettingsToBase(); });
    cy += drawToggleRow(x, cy, w, "Screen Shake", GP.settings.screenShake, () => { GP.settings.screenShake = !GP.settings.screenShake; GP.saveSettings(); });
    cy += drawToggleRow(x, cy, w, "Reduced Motion", GP.settings.reducedMotion, () => { GP.settings.reducedMotion = !GP.settings.reducedMotion; GP.saveSettings(); });
    cy += drawToggleRow(x, cy, w, "Show Minimap", GP.settings.showMinimap, () => { GP.settings.showMinimap = !GP.settings.showMinimap; GP.saveSettings(); });
    cy += drawToggleRow(x, cy, w, "Show Toasts", GP.settings.showToasts, () => { GP.settings.showToasts = !GP.settings.showToasts; GP.saveSettings(); });
    cy += drawToggleRow(x, cy, w, "Large Text", GP.settings.largeText, () => { GP.settings.largeText = !GP.settings.largeText; GP.saveSettings(); });

    const rowH = GP.settings.largeText ? 44 : 34;
    ctx.fillStyle = "rgba(255,80,80,0.16)";
    ctx.fillRect(x+12, cy, w-24, rowH);
    ctx.fillStyle = "white";
    ctx.font = GP.settings.largeText ? "20px Arial" : "16px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Reset GamePlus Stats", x+22, cy + (rowH*0.68));
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText("Tap", x+w-24, cy + (rowH*0.68));
    ctx.textAlign = "left";

    if (GP.ui.lastClick && (U.now() - GP.ui.lastClick < 140)) {
      const p = GP.ui.pointer;
      if (inRect(x+12, cy, w-24, rowH, p)) {
        GP.ui.lastClick = 0;
        GP.stats = {
          coins: 0, scoreBest: 0, kills: 0, levels: 0,
          deaths: 0, shots: 0, distance: 0, jumps: 0,
          timePlayedSec: 0, secretLetters: 0
        };
        GP.saveStats();
        GP.toast("Stats reset.", { y: canvas.height*0.22 });
      }
    }
  }

  function drawQuests(x, y, w, h) {
    if (!GP.quests.active) {
      ctx.fillStyle = "white";
      ctx.font = GP.settings.largeText ? "18px Arial" : "16px Arial";
      ctx.fillText("No quests loaded.", x+16, y+20);
      return;
    }
    const rowH = GP.settings.largeText ? 54 : 44;
    ctx.font = GP.settings.largeText ? "18px Arial" : "16px Arial";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`Today: ${GP.quests.active.day}`, x+16, y+18);

    let cy = y + 34;
    GP.quests.active.quests.forEach((q) => {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x+12, cy, w-24, rowH);
      ctx.fillStyle = "white";
      ctx.fillText(q.title, x+22, cy + (rowH*0.55));
      ctx.textAlign = "right";
      ctx.fillStyle = q.done ? "rgba(80,220,120,0.95)" : "rgba(255,255,255,0.75)";
      ctx.fillText(`${q.progress}/${q.target}`, x+w-24, cy + (rowH*0.55));
      ctx.textAlign = "left";

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x+22, cy + rowH - 14, w-68, 8);
      ctx.fillStyle = q.done ? "rgba(80,220,120,0.95)" : "rgba(180,180,255,0.9)";
      const pw = (q.progress / Math.max(1, q.target)) * (w-68);
      ctx.fillRect(x+22, cy + rowH - 14, pw, 8);

      cy += rowH + 10;
    });

    const claimY = y + h - (rowH + 16);
    ctx.fillStyle = GP.quests.active.claimed ? "rgba(120,120,120,0.25)" : "rgba(80,220,120,0.18)";
    ctx.fillRect(x+12, claimY, w-24, rowH);
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.fillText(GP.quests.active.claimed ? "Reward claimed" : "Claim daily reward", x+22, claimY + (rowH*0.62));
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText("Tap", x+w-24, claimY + (rowH*0.62));
    ctx.textAlign = "left";

    if (!GP.quests.active.claimed && GP.ui.lastClick && (U.now() - GP.ui.lastClick < 140)) {
      const p = GP.ui.pointer;
      if (inRect(x+12, claimY, w-24, rowH, p)) {
        GP.ui.lastClick = 0;
        GP.quests.tryClaim();
      }
    }
  }

  function drawAchievements(x, y, w, h) {
    const total = GP.ach.defs.length;
    const unlocked = Object.keys(GP.ach.unlocked).length;

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = GP.settings.largeText ? "18px Arial" : "16px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Unlocked: ${unlocked} / ${total}`, x+16, y+18);

    const remaining = GP.ach.defs
      .filter(d => !GP.ach.unlocked[d.id])
      .slice(0, 10);

    const rowH = GP.settings.largeText ? 46 : 38;
    let cy = y + 34;
    remaining.forEach((d) => {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x+12, cy, w-24, rowH);
      ctx.fillStyle = "white";
      ctx.fillText(d.name, x+22, cy + (rowH*0.62));
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(`${d.type} ≥ ${d.threshold}`, x+w-24, cy + (rowH*0.62));
      ctx.textAlign = "left";
      cy += rowH + 8;
    });

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = GP.settings.largeText ? "16px Arial" : "13px Arial";
    ctx.fillText("Tip: achievements unlock automatically as you play.", x+16, y+h-14);
  }

  /* --------------------------------------------------------
     Content libraries (lots of lines on purpose)
     -------------------------------------------------------- */

  GP.CONTENT_TIPS = [
  "001. Try short hops near spikes.",
  "002. If you miss a coin trail, there is often a safer route below.",
  "003. Bats drift in waves; time your jump.",
  "004. Cannons aim where you are going — change direction to dodge.",
  "005. Use checkpoints to practice tricky sections.",
  "006. Fireballs bounce a little; shoot low for ground enemies.",
  "007. Coins above pits usually mark the jump arc.",
  "008. Take a breath on each landing — then go.",
  "009. Stars make you brave, but pits still win.",
  "010. If time is low, run for the next checkpoint.",
  "011. Try short hops near spikes.",
  "012. If you miss a coin trail, there is often a safer route below.",
  "013. Bats drift in waves; time your jump.",
  "014. Cannons aim where you are going — change direction to dodge.",
  "015. Use checkpoints to practice tricky sections.",
  "016. Fireballs bounce a little; shoot low for ground enemies.",
  "017. Coins above pits usually mark the jump arc.",
  "018. Take a breath on each landing — then go.",
  "019. Stars make you brave, but pits still win.",
  "020. If time is low, run for the next checkpoint.",
  "021. Try short hops near spikes.",
  "022. If you miss a coin trail, there is often a safer route below.",
  "023. Bats drift in waves; time your jump.",
  "024. Cannons aim where you are going — change direction to dodge.",
  "025. Use checkpoints to practice tricky sections.",
  "026. Fireballs bounce a little; shoot low for ground enemies.",
  "027. Coins above pits usually mark the jump arc.",
  "028. Take a breath on each landing — then go.",
  "029. Stars make you brave, but pits still win.",
  "030. If time is low, run for the next checkpoint.",
  "031. Try short hops near spikes.",
  "032. If you miss a coin trail, there is often a safer route below.",
  "033. Bats drift in waves; time your jump.",
  "034. Cannons aim where you are going — change direction to dodge.",
  "035. Use checkpoints to practice tricky sections.",
  "036. Fireballs bounce a little; shoot low for ground enemies.",
  "037. Coins above pits usually mark the jump arc.",
  "038. Take a breath on each landing — then go.",
  "039. Stars make you brave, but pits still win.",
  "040. If time is low, run for the next checkpoint.",
  "041. Try short hops near spikes.",
  "042. If you miss a coin trail, there is often a safer route below.",
  "043. Bats drift in waves; time your jump.",
  "044. Cannons aim where you are going — change direction to dodge.",
  "045. Use checkpoints to practice tricky sections.",
  "046. Fireballs bounce a little; shoot low for ground enemies.",
  "047. Coins above pits usually mark the jump arc.",
  "048. Take a breath on each landing — then go.",
  "049. Stars make you brave, but pits still win.",
  "050. If time is low, run for the next checkpoint.",
  "051. Try short hops near spikes.",
  "052. If you miss a coin trail, there is often a safer route below.",
  "053. Bats drift in waves; time your jump.",
  "054. Cannons aim where you are going — change direction to dodge.",
  "055. Use checkpoints to practice tricky sections.",
  "056. Fireballs bounce a little; shoot low for ground enemies.",
  "057. Coins above pits usually mark the jump arc.",
  "058. Take a breath on each landing — then go.",
  "059. Stars make you brave, but pits still win.",
  "060. If time is low, run for the next checkpoint.",
  "061. Try short hops near spikes.",
  "062. If you miss a coin trail, there is often a safer route below.",
  "063. Bats drift in waves; time your jump.",
  "064. Cannons aim where you are going — change direction to dodge.",
  "065. Use checkpoints to practice tricky sections.",
  "066. Fireballs bounce a little; shoot low for ground enemies.",
  "067. Coins above pits usually mark the jump arc.",
  "068. Take a breath on each landing — then go.",
  "069. Stars make you brave, but pits still win.",
  "070. If time is low, run for the next checkpoint.",
  "071. Try short hops near spikes.",
  "072. If you miss a coin trail, there is often a safer route below.",
  "073. Bats drift in waves; time your jump.",
  "074. Cannons aim where you are going — change direction to dodge.",
  "075. Use checkpoints to practice tricky sections.",
  "076. Fireballs bounce a little; shoot low for ground enemies.",
  "077. Coins above pits usually mark the jump arc.",
  "078. Take a breath on each landing — then go.",
  "079. Stars make you brave, but pits still win.",
  "080. If time is low, run for the next checkpoint.",
  "081. Try short hops near spikes.",
  "082. If you miss a coin trail, there is often a safer route below.",
  "083. Bats drift in waves; time your jump.",
  "084. Cannons aim where you are going — change direction to dodge.",
  "085. Use checkpoints to practice tricky sections.",
  "086. Fireballs bounce a little; shoot low for ground enemies.",
  "087. Coins above pits usually mark the jump arc.",
  "088. Take a breath on each landing — then go.",
  "089. Stars make you brave, but pits still win.",
  "090. If time is low, run for the next checkpoint.",
  "091. Try short hops near spikes.",
  "092. If you miss a coin trail, there is often a safer route below.",
  "093. Bats drift in waves; time your jump.",
  "094. Cannons aim where you are going — change direction to dodge.",
  "095. Use checkpoints to practice tricky sections.",
  "096. Fireballs bounce a little; shoot low for ground enemies.",
  "097. Coins above pits usually mark the jump arc.",
  "098. Take a breath on each landing — then go.",
  "099. Stars make you brave, but pits still win.",
  "100. If time is low, run for the next checkpoint.",
  "101. Try short hops near spikes.",
  "102. If you miss a coin trail, there is often a safer route below.",
  "103. Bats drift in waves; time your jump.",
  "104. Cannons aim where you are going — change direction to dodge.",
  "105. Use checkpoints to practice tricky sections.",
  "106. Fireballs bounce a little; shoot low for ground enemies.",
  "107. Coins above pits usually mark the jump arc.",
  "108. Take a breath on each landing — then go.",
  "109. Stars make you brave, but pits still win.",
  "110. If time is low, run for the next checkpoint.",
  "111. Try short hops near spikes.",
  "112. If you miss a coin trail, there is often a safer route below.",
  "113. Bats drift in waves; time your jump.",
  "114. Cannons aim where you are going — change direction to dodge.",
  "115. Use checkpoints to practice tricky sections.",
  "116. Fireballs bounce a little; shoot low for ground enemies.",
  "117. Coins above pits usually mark the jump arc.",
  "118. Take a breath on each landing — then go.",
  "119. Stars make you brave, but pits still win.",
  "120. If time is low, run for the next checkpoint.",
  "121. Try short hops near spikes.",
  "122. If you miss a coin trail, there is often a safer route below.",
  "123. Bats drift in waves; time your jump.",
  "124. Cannons aim where you are going — change direction to dodge.",
  "125. Use checkpoints to practice tricky sections.",
  "126. Fireballs bounce a little; shoot low for ground enemies.",
  "127. Coins above pits usually mark the jump arc.",
  "128. Take a breath on each landing — then go.",
  "129. Stars make you brave, but pits still win.",
  "130. If time is low, run for the next checkpoint.",
  "131. Try short hops near spikes.",
  "132. If you miss a coin trail, there is often a safer route below.",
  "133. Bats drift in waves; time your jump.",
  "134. Cannons aim where you are going — change direction to dodge.",
  "135. Use checkpoints to practice tricky sections.",
  "136. Fireballs bounce a little; shoot low for ground enemies.",
  "137. Coins above pits usually mark the jump arc.",
  "138. Take a breath on each landing — then go.",
  "139. Stars make you brave, but pits still win.",
  "140. If time is low, run for the next checkpoint.",
  "141. Try short hops near spikes.",
  "142. If you miss a coin trail, there is often a safer route below.",
  "143. Bats drift in waves; time your jump.",
  "144. Cannons aim where you are going — change direction to dodge.",
  "145. Use checkpoints to practice tricky sections.",
  "146. Fireballs bounce a little; shoot low for ground enemies.",
  "147. Coins above pits usually mark the jump arc.",
  "148. Take a breath on each landing — then go.",
  "149. Stars make you brave, but pits still win.",
  "150. If time is low, run for the next checkpoint.",
  "151. Try short hops near spikes.",
  "152. If you miss a coin trail, there is often a safer route below.",
  "153. Bats drift in waves; time your jump.",
  "154. Cannons aim where you are going — change direction to dodge.",
  "155. Use checkpoints to practice tricky sections.",
  "156. Fireballs bounce a little; shoot low for ground enemies.",
  "157. Coins above pits usually mark the jump arc.",
  "158. Take a breath on each landing — then go.",
  "159. Stars make you brave, but pits still win.",
  "160. If time is low, run for the next checkpoint.",
  "161. Try short hops near spikes.",
  "162. If you miss a coin trail, there is often a safer route below.",
  "163. Bats drift in waves; time your jump.",
  "164. Cannons aim where you are going — change direction to dodge.",
  "165. Use checkpoints to practice tricky sections.",
  "166. Fireballs bounce a little; shoot low for ground enemies.",
  "167. Coins above pits usually mark the jump arc.",
  "168. Take a breath on each landing — then go.",
  "169. Stars make you brave, but pits still win.",
  "170. If time is low, run for the next checkpoint.",
  "171. Try short hops near spikes.",
  "172. If you miss a coin trail, there is often a safer route below.",
  "173. Bats drift in waves; time your jump.",
  "174. Cannons aim where you are going — change direction to dodge.",
  "175. Use checkpoints to practice tricky sections.",
  "176. Fireballs bounce a little; shoot low for ground enemies.",
  "177. Coins above pits usually mark the jump arc.",
  "178. Take a breath on each landing — then go.",
  "179. Stars make you brave, but pits still win.",
  "180. If time is low, run for the next checkpoint.",
  "181. Try short hops near spikes.",
  "182. If you miss a coin trail, there is often a safer route below.",
  "183. Bats drift in waves; time your jump.",
  "184. Cannons aim where you are going — change direction to dodge.",
  "185. Use checkpoints to practice tricky sections.",
  "186. Fireballs bounce a little; shoot low for ground enemies.",
  "187. Coins above pits usually mark the jump arc.",
  "188. Take a breath on each landing — then go.",
  "189. Stars make you brave, but pits still win.",
  "190. If time is low, run for the next checkpoint.",
  "191. Try short hops near spikes.",
  "192. If you miss a coin trail, there is often a safer route below.",
  "193. Bats drift in waves; time your jump.",
  "194. Cannons aim where you are going — change direction to dodge.",
  "195. Use checkpoints to practice tricky sections.",
  "196. Fireballs bounce a little; shoot low for ground enemies.",
  "197. Coins above pits usually mark the jump arc.",
  "198. Take a breath on each landing — then go.",
  "199. Stars make you brave, but pits still win.",
  "200. If time is low, run for the next checkpoint.",
  "201. Try short hops near spikes.",
  "202. If you miss a coin trail, there is often a safer route below.",
  "203. Bats drift in waves; time your jump.",
  "204. Cannons aim where you are going — change direction to dodge.",
  "205. Use checkpoints to practice tricky sections.",
  "206. Fireballs bounce a little; shoot low for ground enemies.",
  "207. Coins above pits usually mark the jump arc.",
  "208. Take a breath on each landing — then go.",
  "209. Stars make you brave, but pits still win.",
  "210. If time is low, run for the next checkpoint.",
  "211. Try short hops near spikes.",
  "212. If you miss a coin trail, there is often a safer route below.",
  "213. Bats drift in waves; time your jump.",
  "214. Cannons aim where you are going — change direction to dodge.",
  "215. Use checkpoints to practice tricky sections.",
  "216. Fireballs bounce a little; shoot low for ground enemies.",
  "217. Coins above pits usually mark the jump arc.",
  "218. Take a breath on each landing — then go.",
  "219. Stars make you brave, but pits still win.",
  "220. If time is low, run for the next checkpoint.",
  ];

  GP.CONTENT_LORE = [
  "0001. [Chapter 01-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0002. [Chapter 01-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0003. [Chapter 01-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0004. [Chapter 01-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0005. [Chapter 01-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0006. [Chapter 01-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0007. [Chapter 01-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0008. [Chapter 01-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0009. [Chapter 01-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0010. [Chapter 01-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0011. [Chapter 01-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0012. [Chapter 01-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0013. [Chapter 01-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0014. [Chapter 01-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0015. [Chapter 01-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0016. [Chapter 01-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0017. [Chapter 01-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0018. [Chapter 01-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0019. [Chapter 01-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0020. [Chapter 01-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0021. [Chapter 01-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0022. [Chapter 01-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0023. [Chapter 01-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0024. [Chapter 01-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0025. [Chapter 01-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0026. [Chapter 01-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0027. [Chapter 01-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0028. [Chapter 01-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0029. [Chapter 01-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0030. [Chapter 01-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0031. [Chapter 01-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0032. [Chapter 01-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0033. [Chapter 01-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0034. [Chapter 01-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0035. [Chapter 01-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0036. [Chapter 02-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0037. [Chapter 02-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0038. [Chapter 02-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0039. [Chapter 02-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0040. [Chapter 02-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0041. [Chapter 02-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0042. [Chapter 02-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0043. [Chapter 02-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0044. [Chapter 02-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0045. [Chapter 02-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0046. [Chapter 02-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0047. [Chapter 02-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0048. [Chapter 02-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0049. [Chapter 02-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0050. [Chapter 02-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0051. [Chapter 02-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0052. [Chapter 02-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0053. [Chapter 02-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0054. [Chapter 02-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0055. [Chapter 02-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0056. [Chapter 02-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0057. [Chapter 02-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0058. [Chapter 02-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0059. [Chapter 02-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0060. [Chapter 02-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0061. [Chapter 02-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0062. [Chapter 02-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0063. [Chapter 02-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0064. [Chapter 02-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0065. [Chapter 02-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0066. [Chapter 02-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0067. [Chapter 02-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0068. [Chapter 02-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0069. [Chapter 02-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0070. [Chapter 02-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0071. [Chapter 03-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0072. [Chapter 03-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0073. [Chapter 03-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0074. [Chapter 03-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0075. [Chapter 03-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0076. [Chapter 03-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0077. [Chapter 03-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0078. [Chapter 03-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0079. [Chapter 03-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0080. [Chapter 03-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0081. [Chapter 03-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0082. [Chapter 03-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0083. [Chapter 03-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0084. [Chapter 03-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0085. [Chapter 03-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0086. [Chapter 03-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0087. [Chapter 03-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0088. [Chapter 03-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0089. [Chapter 03-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0090. [Chapter 03-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0091. [Chapter 03-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0092. [Chapter 03-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0093. [Chapter 03-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0094. [Chapter 03-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0095. [Chapter 03-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0096. [Chapter 03-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0097. [Chapter 03-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0098. [Chapter 03-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0099. [Chapter 03-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0100. [Chapter 03-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0101. [Chapter 03-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0102. [Chapter 03-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0103. [Chapter 03-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0104. [Chapter 03-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0105. [Chapter 03-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0106. [Chapter 04-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0107. [Chapter 04-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0108. [Chapter 04-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0109. [Chapter 04-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0110. [Chapter 04-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0111. [Chapter 04-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0112. [Chapter 04-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0113. [Chapter 04-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0114. [Chapter 04-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0115. [Chapter 04-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0116. [Chapter 04-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0117. [Chapter 04-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0118. [Chapter 04-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0119. [Chapter 04-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0120. [Chapter 04-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0121. [Chapter 04-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0122. [Chapter 04-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0123. [Chapter 04-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0124. [Chapter 04-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0125. [Chapter 04-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0126. [Chapter 04-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0127. [Chapter 04-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0128. [Chapter 04-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0129. [Chapter 04-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0130. [Chapter 04-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0131. [Chapter 04-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0132. [Chapter 04-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0133. [Chapter 04-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0134. [Chapter 04-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0135. [Chapter 04-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0136. [Chapter 04-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0137. [Chapter 04-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0138. [Chapter 04-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0139. [Chapter 04-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0140. [Chapter 04-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0141. [Chapter 05-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0142. [Chapter 05-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0143. [Chapter 05-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0144. [Chapter 05-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0145. [Chapter 05-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0146. [Chapter 05-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0147. [Chapter 05-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0148. [Chapter 05-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0149. [Chapter 05-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0150. [Chapter 05-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0151. [Chapter 05-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0152. [Chapter 05-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0153. [Chapter 05-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0154. [Chapter 05-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0155. [Chapter 05-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0156. [Chapter 05-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0157. [Chapter 05-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0158. [Chapter 05-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0159. [Chapter 05-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0160. [Chapter 05-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0161. [Chapter 05-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0162. [Chapter 05-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0163. [Chapter 05-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0164. [Chapter 05-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0165. [Chapter 05-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0166. [Chapter 05-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0167. [Chapter 05-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0168. [Chapter 05-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0169. [Chapter 05-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0170. [Chapter 05-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0171. [Chapter 05-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0172. [Chapter 05-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0173. [Chapter 05-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0174. [Chapter 05-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0175. [Chapter 05-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0176. [Chapter 06-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0177. [Chapter 06-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0178. [Chapter 06-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0179. [Chapter 06-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0180. [Chapter 06-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0181. [Chapter 06-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0182. [Chapter 06-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0183. [Chapter 06-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0184. [Chapter 06-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0185. [Chapter 06-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0186. [Chapter 06-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0187. [Chapter 06-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0188. [Chapter 06-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0189. [Chapter 06-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0190. [Chapter 06-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0191. [Chapter 06-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0192. [Chapter 06-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0193. [Chapter 06-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0194. [Chapter 06-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0195. [Chapter 06-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0196. [Chapter 06-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0197. [Chapter 06-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0198. [Chapter 06-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0199. [Chapter 06-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0200. [Chapter 06-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0201. [Chapter 06-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0202. [Chapter 06-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0203. [Chapter 06-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0204. [Chapter 06-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0205. [Chapter 06-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0206. [Chapter 06-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0207. [Chapter 06-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0208. [Chapter 06-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0209. [Chapter 06-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0210. [Chapter 06-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0211. [Chapter 07-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0212. [Chapter 07-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0213. [Chapter 07-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0214. [Chapter 07-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0215. [Chapter 07-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0216. [Chapter 07-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0217. [Chapter 07-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0218. [Chapter 07-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0219. [Chapter 07-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0220. [Chapter 07-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0221. [Chapter 07-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0222. [Chapter 07-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0223. [Chapter 07-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0224. [Chapter 07-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0225. [Chapter 07-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0226. [Chapter 07-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0227. [Chapter 07-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0228. [Chapter 07-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0229. [Chapter 07-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0230. [Chapter 07-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0231. [Chapter 07-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0232. [Chapter 07-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0233. [Chapter 07-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0234. [Chapter 07-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0235. [Chapter 07-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0236. [Chapter 07-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0237. [Chapter 07-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0238. [Chapter 07-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0239. [Chapter 07-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0240. [Chapter 07-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0241. [Chapter 07-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0242. [Chapter 07-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0243. [Chapter 07-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0244. [Chapter 07-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0245. [Chapter 07-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0246. [Chapter 08-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0247. [Chapter 08-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0248. [Chapter 08-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0249. [Chapter 08-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0250. [Chapter 08-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0251. [Chapter 08-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0252. [Chapter 08-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0253. [Chapter 08-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0254. [Chapter 08-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0255. [Chapter 08-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0256. [Chapter 08-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0257. [Chapter 08-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0258. [Chapter 08-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0259. [Chapter 08-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0260. [Chapter 08-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0261. [Chapter 08-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0262. [Chapter 08-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0263. [Chapter 08-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0264. [Chapter 08-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0265. [Chapter 08-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0266. [Chapter 08-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0267. [Chapter 08-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0268. [Chapter 08-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0269. [Chapter 08-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0270. [Chapter 08-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0271. [Chapter 08-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0272. [Chapter 08-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0273. [Chapter 08-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0274. [Chapter 08-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0275. [Chapter 08-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0276. [Chapter 08-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0277. [Chapter 08-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0278. [Chapter 08-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0279. [Chapter 08-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0280. [Chapter 08-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0281. [Chapter 09-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0282. [Chapter 09-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0283. [Chapter 09-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0284. [Chapter 09-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0285. [Chapter 09-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0286. [Chapter 09-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0287. [Chapter 09-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0288. [Chapter 09-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0289. [Chapter 09-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0290. [Chapter 09-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0291. [Chapter 09-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0292. [Chapter 09-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0293. [Chapter 09-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0294. [Chapter 09-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0295. [Chapter 09-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0296. [Chapter 09-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0297. [Chapter 09-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0298. [Chapter 09-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0299. [Chapter 09-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0300. [Chapter 09-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0301. [Chapter 09-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0302. [Chapter 09-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0303. [Chapter 09-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0304. [Chapter 09-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0305. [Chapter 09-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0306. [Chapter 09-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0307. [Chapter 09-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0308. [Chapter 09-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0309. [Chapter 09-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0310. [Chapter 09-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0311. [Chapter 09-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0312. [Chapter 09-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0313. [Chapter 09-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0314. [Chapter 09-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0315. [Chapter 09-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0316. [Chapter 10-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0317. [Chapter 10-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0318. [Chapter 10-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0319. [Chapter 10-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0320. [Chapter 10-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0321. [Chapter 10-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0322. [Chapter 10-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0323. [Chapter 10-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0324. [Chapter 10-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0325. [Chapter 10-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0326. [Chapter 10-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0327. [Chapter 10-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0328. [Chapter 10-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0329. [Chapter 10-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0330. [Chapter 10-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0331. [Chapter 10-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0332. [Chapter 10-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0333. [Chapter 10-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0334. [Chapter 10-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0335. [Chapter 10-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0336. [Chapter 10-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0337. [Chapter 10-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0338. [Chapter 10-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0339. [Chapter 10-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0340. [Chapter 10-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0341. [Chapter 10-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0342. [Chapter 10-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0343. [Chapter 10-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0344. [Chapter 10-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0345. [Chapter 10-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0346. [Chapter 10-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0347. [Chapter 10-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0348. [Chapter 10-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0349. [Chapter 10-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0350. [Chapter 10-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0351. [Chapter 11-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0352. [Chapter 11-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0353. [Chapter 11-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0354. [Chapter 11-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0355. [Chapter 11-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0356. [Chapter 11-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0357. [Chapter 11-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0358. [Chapter 11-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0359. [Chapter 11-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0360. [Chapter 11-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0361. [Chapter 11-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0362. [Chapter 11-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0363. [Chapter 11-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0364. [Chapter 11-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0365. [Chapter 11-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0366. [Chapter 11-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0367. [Chapter 11-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0368. [Chapter 11-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0369. [Chapter 11-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0370. [Chapter 11-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0371. [Chapter 11-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0372. [Chapter 11-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0373. [Chapter 11-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0374. [Chapter 11-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0375. [Chapter 11-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0376. [Chapter 11-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0377. [Chapter 11-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0378. [Chapter 11-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0379. [Chapter 11-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0380. [Chapter 11-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0381. [Chapter 11-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0382. [Chapter 11-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0383. [Chapter 11-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0384. [Chapter 11-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0385. [Chapter 11-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0386. [Chapter 12-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0387. [Chapter 12-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0388. [Chapter 12-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0389. [Chapter 12-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0390. [Chapter 12-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0391. [Chapter 12-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0392. [Chapter 12-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0393. [Chapter 12-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0394. [Chapter 12-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0395. [Chapter 12-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0396. [Chapter 12-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0397. [Chapter 12-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0398. [Chapter 12-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0399. [Chapter 12-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0400. [Chapter 12-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0401. [Chapter 12-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0402. [Chapter 12-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0403. [Chapter 12-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0404. [Chapter 12-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0405. [Chapter 12-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0406. [Chapter 12-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0407. [Chapter 12-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0408. [Chapter 12-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0409. [Chapter 12-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0410. [Chapter 12-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0411. [Chapter 12-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0412. [Chapter 12-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0413. [Chapter 12-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0414. [Chapter 12-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0415. [Chapter 12-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0416. [Chapter 12-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0417. [Chapter 12-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0418. [Chapter 12-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0419. [Chapter 12-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0420. [Chapter 12-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0421. [Chapter 13-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0422. [Chapter 13-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0423. [Chapter 13-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0424. [Chapter 13-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0425. [Chapter 13-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0426. [Chapter 13-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0427. [Chapter 13-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0428. [Chapter 13-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0429. [Chapter 13-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0430. [Chapter 13-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0431. [Chapter 13-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0432. [Chapter 13-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0433. [Chapter 13-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0434. [Chapter 13-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0435. [Chapter 13-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0436. [Chapter 13-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0437. [Chapter 13-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0438. [Chapter 13-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0439. [Chapter 13-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0440. [Chapter 13-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0441. [Chapter 13-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0442. [Chapter 13-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0443. [Chapter 13-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0444. [Chapter 13-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0445. [Chapter 13-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0446. [Chapter 13-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0447. [Chapter 13-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0448. [Chapter 13-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0449. [Chapter 13-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0450. [Chapter 13-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0451. [Chapter 13-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0452. [Chapter 13-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0453. [Chapter 13-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0454. [Chapter 13-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0455. [Chapter 13-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0456. [Chapter 14-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0457. [Chapter 14-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0458. [Chapter 14-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0459. [Chapter 14-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0460. [Chapter 14-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0461. [Chapter 14-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0462. [Chapter 14-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0463. [Chapter 14-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0464. [Chapter 14-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0465. [Chapter 14-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0466. [Chapter 14-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0467. [Chapter 14-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0468. [Chapter 14-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0469. [Chapter 14-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0470. [Chapter 14-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0471. [Chapter 14-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0472. [Chapter 14-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0473. [Chapter 14-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0474. [Chapter 14-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0475. [Chapter 14-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0476. [Chapter 14-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0477. [Chapter 14-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0478. [Chapter 14-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0479. [Chapter 14-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0480. [Chapter 14-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0481. [Chapter 14-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0482. [Chapter 14-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0483. [Chapter 14-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0484. [Chapter 14-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0485. [Chapter 14-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0486. [Chapter 14-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0487. [Chapter 14-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0488. [Chapter 14-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0489. [Chapter 14-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0490. [Chapter 14-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0491. [Chapter 15-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0492. [Chapter 15-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0493. [Chapter 15-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0494. [Chapter 15-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0495. [Chapter 15-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0496. [Chapter 15-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0497. [Chapter 15-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0498. [Chapter 15-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0499. [Chapter 15-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0500. [Chapter 15-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0501. [Chapter 15-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0502. [Chapter 15-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0503. [Chapter 15-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0504. [Chapter 15-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0505. [Chapter 15-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0506. [Chapter 15-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0507. [Chapter 15-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0508. [Chapter 15-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0509. [Chapter 15-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0510. [Chapter 15-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0511. [Chapter 15-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0512. [Chapter 15-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0513. [Chapter 15-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0514. [Chapter 15-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0515. [Chapter 15-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0516. [Chapter 15-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0517. [Chapter 15-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0518. [Chapter 15-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0519. [Chapter 15-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0520. [Chapter 15-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0521. [Chapter 15-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0522. [Chapter 15-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0523. [Chapter 15-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0524. [Chapter 15-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0525. [Chapter 15-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0526. [Chapter 16-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0527. [Chapter 16-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0528. [Chapter 16-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0529. [Chapter 16-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0530. [Chapter 16-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0531. [Chapter 16-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0532. [Chapter 16-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0533. [Chapter 16-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0534. [Chapter 16-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0535. [Chapter 16-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0536. [Chapter 16-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0537. [Chapter 16-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0538. [Chapter 16-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0539. [Chapter 16-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0540. [Chapter 16-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0541. [Chapter 16-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0542. [Chapter 16-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0543. [Chapter 16-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0544. [Chapter 16-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0545. [Chapter 16-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0546. [Chapter 16-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0547. [Chapter 16-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0548. [Chapter 16-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0549. [Chapter 16-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0550. [Chapter 16-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0551. [Chapter 16-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0552. [Chapter 16-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0553. [Chapter 16-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0554. [Chapter 16-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0555. [Chapter 16-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0556. [Chapter 16-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0557. [Chapter 16-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0558. [Chapter 16-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0559. [Chapter 16-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0560. [Chapter 16-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0561. [Chapter 17-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0562. [Chapter 17-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0563. [Chapter 17-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0564. [Chapter 17-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0565. [Chapter 17-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0566. [Chapter 17-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0567. [Chapter 17-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0568. [Chapter 17-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0569. [Chapter 17-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0570. [Chapter 17-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0571. [Chapter 17-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0572. [Chapter 17-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0573. [Chapter 17-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0574. [Chapter 17-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0575. [Chapter 17-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0576. [Chapter 17-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0577. [Chapter 17-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0578. [Chapter 17-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0579. [Chapter 17-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0580. [Chapter 17-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0581. [Chapter 17-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0582. [Chapter 17-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0583. [Chapter 17-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0584. [Chapter 17-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0585. [Chapter 17-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0586. [Chapter 17-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0587. [Chapter 17-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0588. [Chapter 17-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0589. [Chapter 17-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0590. [Chapter 17-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0591. [Chapter 17-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0592. [Chapter 17-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0593. [Chapter 17-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0594. [Chapter 17-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0595. [Chapter 17-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0596. [Chapter 18-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0597. [Chapter 18-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0598. [Chapter 18-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0599. [Chapter 18-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0600. [Chapter 18-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0601. [Chapter 18-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0602. [Chapter 18-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0603. [Chapter 18-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0604. [Chapter 18-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0605. [Chapter 18-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0606. [Chapter 18-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0607. [Chapter 18-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0608. [Chapter 18-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0609. [Chapter 18-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0610. [Chapter 18-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0611. [Chapter 18-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0612. [Chapter 18-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0613. [Chapter 18-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0614. [Chapter 18-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0615. [Chapter 18-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0616. [Chapter 18-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0617. [Chapter 18-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0618. [Chapter 18-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0619. [Chapter 18-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0620. [Chapter 18-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0621. [Chapter 18-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0622. [Chapter 18-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0623. [Chapter 18-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0624. [Chapter 18-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0625. [Chapter 18-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0626. [Chapter 18-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0627. [Chapter 18-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0628. [Chapter 18-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0629. [Chapter 18-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0630. [Chapter 18-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0631. [Chapter 19-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0632. [Chapter 19-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0633. [Chapter 19-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0634. [Chapter 19-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0635. [Chapter 19-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0636. [Chapter 19-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0637. [Chapter 19-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0638. [Chapter 19-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0639. [Chapter 19-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0640. [Chapter 19-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0641. [Chapter 19-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0642. [Chapter 19-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0643. [Chapter 19-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0644. [Chapter 19-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0645. [Chapter 19-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0646. [Chapter 19-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0647. [Chapter 19-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0648. [Chapter 19-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0649. [Chapter 19-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0650. [Chapter 19-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0651. [Chapter 19-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0652. [Chapter 19-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0653. [Chapter 19-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0654. [Chapter 19-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0655. [Chapter 19-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0656. [Chapter 19-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0657. [Chapter 19-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0658. [Chapter 19-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0659. [Chapter 19-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0660. [Chapter 19-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0661. [Chapter 19-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0662. [Chapter 19-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0663. [Chapter 19-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0664. [Chapter 19-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0665. [Chapter 19-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0666. [Chapter 20-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0667. [Chapter 20-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0668. [Chapter 20-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0669. [Chapter 20-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0670. [Chapter 20-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0671. [Chapter 20-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0672. [Chapter 20-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0673. [Chapter 20-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0674. [Chapter 20-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0675. [Chapter 20-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0676. [Chapter 20-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0677. [Chapter 20-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0678. [Chapter 20-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0679. [Chapter 20-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0680. [Chapter 20-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0681. [Chapter 20-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0682. [Chapter 20-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0683. [Chapter 20-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0684. [Chapter 20-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0685. [Chapter 20-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0686. [Chapter 20-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0687. [Chapter 20-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0688. [Chapter 20-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0689. [Chapter 20-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0690. [Chapter 20-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0691. [Chapter 20-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0692. [Chapter 20-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0693. [Chapter 20-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0694. [Chapter 20-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0695. [Chapter 20-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0696. [Chapter 20-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0697. [Chapter 20-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0698. [Chapter 20-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0699. [Chapter 20-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0700. [Chapter 20-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0701. [Chapter 21-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0702. [Chapter 21-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0703. [Chapter 21-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0704. [Chapter 21-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0705. [Chapter 21-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0706. [Chapter 21-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0707. [Chapter 21-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0708. [Chapter 21-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0709. [Chapter 21-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0710. [Chapter 21-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0711. [Chapter 21-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0712. [Chapter 21-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0713. [Chapter 21-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0714. [Chapter 21-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0715. [Chapter 21-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0716. [Chapter 21-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0717. [Chapter 21-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0718. [Chapter 21-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0719. [Chapter 21-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0720. [Chapter 21-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0721. [Chapter 21-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0722. [Chapter 21-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0723. [Chapter 21-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0724. [Chapter 21-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0725. [Chapter 21-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0726. [Chapter 21-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0727. [Chapter 21-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0728. [Chapter 21-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0729. [Chapter 21-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0730. [Chapter 21-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0731. [Chapter 21-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0732. [Chapter 21-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0733. [Chapter 21-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0734. [Chapter 21-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0735. [Chapter 21-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0736. [Chapter 22-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0737. [Chapter 22-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0738. [Chapter 22-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0739. [Chapter 22-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0740. [Chapter 22-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0741. [Chapter 22-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0742. [Chapter 22-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0743. [Chapter 22-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0744. [Chapter 22-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0745. [Chapter 22-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0746. [Chapter 22-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0747. [Chapter 22-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0748. [Chapter 22-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0749. [Chapter 22-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0750. [Chapter 22-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0751. [Chapter 22-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0752. [Chapter 22-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0753. [Chapter 22-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0754. [Chapter 22-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0755. [Chapter 22-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0756. [Chapter 22-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0757. [Chapter 22-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0758. [Chapter 22-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0759. [Chapter 22-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0760. [Chapter 22-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0761. [Chapter 22-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0762. [Chapter 22-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0763. [Chapter 22-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0764. [Chapter 22-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0765. [Chapter 22-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0766. [Chapter 22-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0767. [Chapter 22-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0768. [Chapter 22-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0769. [Chapter 22-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0770. [Chapter 22-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0771. [Chapter 23-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0772. [Chapter 23-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0773. [Chapter 23-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0774. [Chapter 23-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0775. [Chapter 23-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0776. [Chapter 23-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0777. [Chapter 23-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0778. [Chapter 23-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0779. [Chapter 23-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0780. [Chapter 23-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0781. [Chapter 23-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0782. [Chapter 23-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0783. [Chapter 23-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0784. [Chapter 23-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0785. [Chapter 23-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0786. [Chapter 23-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0787. [Chapter 23-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0788. [Chapter 23-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0789. [Chapter 23-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0790. [Chapter 23-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0791. [Chapter 23-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0792. [Chapter 23-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0793. [Chapter 23-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0794. [Chapter 23-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0795. [Chapter 23-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0796. [Chapter 23-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0797. [Chapter 23-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0798. [Chapter 23-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0799. [Chapter 23-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0800. [Chapter 23-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0801. [Chapter 23-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0802. [Chapter 23-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0803. [Chapter 23-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0804. [Chapter 23-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0805. [Chapter 23-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0806. [Chapter 24-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0807. [Chapter 24-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0808. [Chapter 24-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0809. [Chapter 24-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0810. [Chapter 24-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0811. [Chapter 24-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0812. [Chapter 24-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0813. [Chapter 24-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0814. [Chapter 24-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0815. [Chapter 24-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0816. [Chapter 24-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0817. [Chapter 24-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0818. [Chapter 24-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0819. [Chapter 24-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0820. [Chapter 24-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0821. [Chapter 24-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0822. [Chapter 24-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0823. [Chapter 24-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0824. [Chapter 24-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0825. [Chapter 24-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0826. [Chapter 24-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0827. [Chapter 24-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0828. [Chapter 24-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0829. [Chapter 24-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0830. [Chapter 24-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0831. [Chapter 24-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0832. [Chapter 24-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0833. [Chapter 24-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0834. [Chapter 24-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0835. [Chapter 24-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0836. [Chapter 24-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0837. [Chapter 24-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0838. [Chapter 24-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0839. [Chapter 24-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0840. [Chapter 24-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0841. [Chapter 25-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0842. [Chapter 25-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0843. [Chapter 25-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0844. [Chapter 25-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0845. [Chapter 25-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0846. [Chapter 25-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0847. [Chapter 25-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0848. [Chapter 25-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0849. [Chapter 25-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0850. [Chapter 25-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0851. [Chapter 25-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0852. [Chapter 25-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0853. [Chapter 25-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0854. [Chapter 25-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0855. [Chapter 25-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0856. [Chapter 25-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0857. [Chapter 25-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0858. [Chapter 25-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0859. [Chapter 25-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0860. [Chapter 25-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0861. [Chapter 25-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0862. [Chapter 25-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0863. [Chapter 25-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0864. [Chapter 25-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0865. [Chapter 25-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0866. [Chapter 25-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0867. [Chapter 25-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0868. [Chapter 25-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0869. [Chapter 25-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0870. [Chapter 25-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0871. [Chapter 25-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0872. [Chapter 25-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0873. [Chapter 25-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0874. [Chapter 25-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0875. [Chapter 25-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0876. [Chapter 26-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0877. [Chapter 26-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0878. [Chapter 26-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0879. [Chapter 26-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0880. [Chapter 26-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0881. [Chapter 26-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0882. [Chapter 26-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0883. [Chapter 26-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0884. [Chapter 26-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0885. [Chapter 26-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0886. [Chapter 26-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0887. [Chapter 26-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0888. [Chapter 26-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0889. [Chapter 26-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0890. [Chapter 26-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0891. [Chapter 26-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0892. [Chapter 26-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0893. [Chapter 26-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0894. [Chapter 26-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0895. [Chapter 26-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0896. [Chapter 26-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0897. [Chapter 26-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0898. [Chapter 26-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0899. [Chapter 26-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0900. [Chapter 26-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0901. [Chapter 26-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0902. [Chapter 26-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0903. [Chapter 26-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0904. [Chapter 26-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0905. [Chapter 26-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0906. [Chapter 26-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0907. [Chapter 26-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0908. [Chapter 26-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0909. [Chapter 26-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0910. [Chapter 26-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0911. [Chapter 27-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0912. [Chapter 27-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0913. [Chapter 27-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0914. [Chapter 27-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0915. [Chapter 27-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0916. [Chapter 27-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0917. [Chapter 27-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0918. [Chapter 27-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0919. [Chapter 27-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0920. [Chapter 27-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0921. [Chapter 27-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0922. [Chapter 27-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0923. [Chapter 27-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0924. [Chapter 27-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0925. [Chapter 27-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0926. [Chapter 27-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0927. [Chapter 27-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0928. [Chapter 27-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0929. [Chapter 27-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0930. [Chapter 27-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0931. [Chapter 27-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0932. [Chapter 27-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0933. [Chapter 27-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0934. [Chapter 27-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0935. [Chapter 27-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0936. [Chapter 27-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0937. [Chapter 27-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0938. [Chapter 27-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0939. [Chapter 27-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0940. [Chapter 27-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0941. [Chapter 27-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0942. [Chapter 27-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0943. [Chapter 27-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0944. [Chapter 27-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0945. [Chapter 27-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0946. [Chapter 28-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0947. [Chapter 28-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0948. [Chapter 28-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0949. [Chapter 28-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0950. [Chapter 28-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0951. [Chapter 28-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0952. [Chapter 28-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0953. [Chapter 28-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0954. [Chapter 28-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0955. [Chapter 28-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0956. [Chapter 28-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0957. [Chapter 28-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0958. [Chapter 28-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0959. [Chapter 28-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0960. [Chapter 28-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0961. [Chapter 28-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0962. [Chapter 28-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0963. [Chapter 28-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0964. [Chapter 28-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0965. [Chapter 28-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0966. [Chapter 28-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0967. [Chapter 28-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0968. [Chapter 28-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0969. [Chapter 28-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0970. [Chapter 28-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0971. [Chapter 28-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0972. [Chapter 28-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0973. [Chapter 28-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0974. [Chapter 28-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0975. [Chapter 28-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0976. [Chapter 28-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0977. [Chapter 28-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0978. [Chapter 28-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0979. [Chapter 28-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0980. [Chapter 28-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0981. [Chapter 29-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0982. [Chapter 29-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0983. [Chapter 29-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0984. [Chapter 29-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0985. [Chapter 29-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0986. [Chapter 29-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0987. [Chapter 29-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0988. [Chapter 29-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0989. [Chapter 29-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0990. [Chapter 29-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0991. [Chapter 29-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0992. [Chapter 29-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0993. [Chapter 29-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0994. [Chapter 29-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0995. [Chapter 29-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0996. [Chapter 29-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0997. [Chapter 29-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0998. [Chapter 29-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "0999. [Chapter 29-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1000. [Chapter 29-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1001. [Chapter 29-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1002. [Chapter 29-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1003. [Chapter 29-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1004. [Chapter 29-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1005. [Chapter 29-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1006. [Chapter 29-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1007. [Chapter 29-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1008. [Chapter 29-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1009. [Chapter 29-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1010. [Chapter 29-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1011. [Chapter 29-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1012. [Chapter 29-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1013. [Chapter 29-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1014. [Chapter 29-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1015. [Chapter 29-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1016. [Chapter 30-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1017. [Chapter 30-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1018. [Chapter 30-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1019. [Chapter 30-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1020. [Chapter 30-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1021. [Chapter 30-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1022. [Chapter 30-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1023. [Chapter 30-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1024. [Chapter 30-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1025. [Chapter 30-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1026. [Chapter 30-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1027. [Chapter 30-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1028. [Chapter 30-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1029. [Chapter 30-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1030. [Chapter 30-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1031. [Chapter 30-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1032. [Chapter 30-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1033. [Chapter 30-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1034. [Chapter 30-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1035. [Chapter 30-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1036. [Chapter 30-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1037. [Chapter 30-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1038. [Chapter 30-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1039. [Chapter 30-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1040. [Chapter 30-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1041. [Chapter 30-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1042. [Chapter 30-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1043. [Chapter 30-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1044. [Chapter 30-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1045. [Chapter 30-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1046. [Chapter 30-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1047. [Chapter 30-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1048. [Chapter 30-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1049. [Chapter 30-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1050. [Chapter 30-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1051. [Chapter 31-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1052. [Chapter 31-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1053. [Chapter 31-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1054. [Chapter 31-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1055. [Chapter 31-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1056. [Chapter 31-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1057. [Chapter 31-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1058. [Chapter 31-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1059. [Chapter 31-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1060. [Chapter 31-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1061. [Chapter 31-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1062. [Chapter 31-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1063. [Chapter 31-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1064. [Chapter 31-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1065. [Chapter 31-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1066. [Chapter 31-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1067. [Chapter 31-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1068. [Chapter 31-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1069. [Chapter 31-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1070. [Chapter 31-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1071. [Chapter 31-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1072. [Chapter 31-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1073. [Chapter 31-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1074. [Chapter 31-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1075. [Chapter 31-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1076. [Chapter 31-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1077. [Chapter 31-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1078. [Chapter 31-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1079. [Chapter 31-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1080. [Chapter 31-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1081. [Chapter 31-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1082. [Chapter 31-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1083. [Chapter 31-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1084. [Chapter 31-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1085. [Chapter 31-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1086. [Chapter 32-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1087. [Chapter 32-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1088. [Chapter 32-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1089. [Chapter 32-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1090. [Chapter 32-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1091. [Chapter 32-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1092. [Chapter 32-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1093. [Chapter 32-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1094. [Chapter 32-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1095. [Chapter 32-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1096. [Chapter 32-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1097. [Chapter 32-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1098. [Chapter 32-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1099. [Chapter 32-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1100. [Chapter 32-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1101. [Chapter 32-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1102. [Chapter 32-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1103. [Chapter 32-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1104. [Chapter 32-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1105. [Chapter 32-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1106. [Chapter 32-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1107. [Chapter 32-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1108. [Chapter 32-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1109. [Chapter 32-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1110. [Chapter 32-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1111. [Chapter 32-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1112. [Chapter 32-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1113. [Chapter 32-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1114. [Chapter 32-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1115. [Chapter 32-30] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1116. [Chapter 32-31] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1117. [Chapter 32-32] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1118. [Chapter 32-33] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1119. [Chapter 32-34] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1120. [Chapter 32-35] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1121. [Chapter 33-01] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1122. [Chapter 33-02] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1123. [Chapter 33-03] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1124. [Chapter 33-04] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1125. [Chapter 33-05] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1126. [Chapter 33-06] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1127. [Chapter 33-07] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1128. [Chapter 33-08] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1129. [Chapter 33-09] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1130. [Chapter 33-10] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1131. [Chapter 33-11] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1132. [Chapter 33-12] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1133. [Chapter 33-13] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1134. [Chapter 33-14] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1135. [Chapter 33-15] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1136. [Chapter 33-16] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1137. [Chapter 33-17] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1138. [Chapter 33-18] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1139. [Chapter 33-19] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1140. [Chapter 33-20] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1141. [Chapter 33-21] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1142. [Chapter 33-22] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1143. [Chapter 33-23] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1144. [Chapter 33-24] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1145. [Chapter 33-25] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1146. [Chapter 33-26] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1147. [Chapter 33-27] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1148. [Chapter 33-28] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  "1149. [Chapter 33-29] Omar explores a new platform — coins are clues, checkpoints are promises, and flags are finish lines.",
  ];

  GP.quests.pool = [
  {
    id: "Q_001",
    title: "Collect 10 coins",
    type: "coins",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 2,
  },
  {
    id: "Q_002",
    title: "Defeat 15 enemies",
    type: "kills",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 3,
  },
  {
    id: "Q_003",
    title: "Reach 20 checkpoints",
    type: "checkpoints",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 4,
  },
  {
    id: "Q_004",
    title: "Finish a level with 25+ seconds left",
    type: "time_left",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 5,
  },
  {
    id: "Q_005",
    title: "Shoot 30 fireballs",
    type: "shots",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 1,
  },
  {
    id: "Q_006",
    title: "Travel 35 meters",
    type: "distance",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 2,
  },
  {
    id: "Q_007",
    title: "Collect 40 coins",
    type: "coins",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 3,
  },
  {
    id: "Q_008",
    title: "Defeat 50 enemies",
    type: "kills",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 4,
  },
  {
    id: "Q_009",
    title: "Reach 60 checkpoints",
    type: "checkpoints",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 5,
  },
  {
    id: "Q_010",
    title: "Finish a level with 75+ seconds left",
    type: "time_left",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 1,
  },
  {
    id: "Q_011",
    title: "Shoot 100 fireballs",
    type: "shots",
    target: 100,
    rewardCoins: 50,
    rewardScore: 500,
    weight: 2,
  },
  {
    id: "Q_012",
    title: "Travel 10 meters",
    type: "distance",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 3,
  },
  {
    id: "Q_013",
    title: "Collect 15 coins",
    type: "coins",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 4,
  },
  {
    id: "Q_014",
    title: "Defeat 20 enemies",
    type: "kills",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 5,
  },
  {
    id: "Q_015",
    title: "Reach 25 checkpoints",
    type: "checkpoints",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 1,
  },
  {
    id: "Q_016",
    title: "Finish a level with 30+ seconds left",
    type: "time_left",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 2,
  },
  {
    id: "Q_017",
    title: "Shoot 35 fireballs",
    type: "shots",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 3,
  },
  {
    id: "Q_018",
    title: "Travel 40 meters",
    type: "distance",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 4,
  },
  {
    id: "Q_019",
    title: "Collect 50 coins",
    type: "coins",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 5,
  },
  {
    id: "Q_020",
    title: "Defeat 60 enemies",
    type: "kills",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 1,
  },
  {
    id: "Q_021",
    title: "Reach 75 checkpoints",
    type: "checkpoints",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 2,
  },
  {
    id: "Q_022",
    title: "Finish a level with 100+ seconds left",
    type: "time_left",
    target: 100,
    rewardCoins: 50,
    rewardScore: 500,
    weight: 3,
  },
  {
    id: "Q_023",
    title: "Shoot 10 fireballs",
    type: "shots",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 4,
  },
  {
    id: "Q_024",
    title: "Travel 15 meters",
    type: "distance",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 5,
  },
  {
    id: "Q_025",
    title: "Collect 20 coins",
    type: "coins",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 1,
  },
  {
    id: "Q_026",
    title: "Defeat 25 enemies",
    type: "kills",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 2,
  },
  {
    id: "Q_027",
    title: "Reach 30 checkpoints",
    type: "checkpoints",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 3,
  },
  {
    id: "Q_028",
    title: "Finish a level with 35+ seconds left",
    type: "time_left",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 4,
  },
  {
    id: "Q_029",
    title: "Shoot 40 fireballs",
    type: "shots",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 5,
  },
  {
    id: "Q_030",
    title: "Travel 50 meters",
    type: "distance",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 1,
  },
  {
    id: "Q_031",
    title: "Collect 60 coins",
    type: "coins",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 2,
  },
  {
    id: "Q_032",
    title: "Defeat 75 enemies",
    type: "kills",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 3,
  },
  {
    id: "Q_033",
    title: "Reach 100 checkpoints",
    type: "checkpoints",
    target: 100,
    rewardCoins: 50,
    rewardScore: 500,
    weight: 4,
  },
  {
    id: "Q_034",
    title: "Finish a level with 10+ seconds left",
    type: "time_left",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 5,
  },
  {
    id: "Q_035",
    title: "Shoot 15 fireballs",
    type: "shots",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 1,
  },
  {
    id: "Q_036",
    title: "Travel 20 meters",
    type: "distance",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 2,
  },
  {
    id: "Q_037",
    title: "Collect 25 coins",
    type: "coins",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 3,
  },
  {
    id: "Q_038",
    title: "Defeat 30 enemies",
    type: "kills",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 4,
  },
  {
    id: "Q_039",
    title: "Reach 35 checkpoints",
    type: "checkpoints",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 5,
  },
  {
    id: "Q_040",
    title: "Finish a level with 40+ seconds left",
    type: "time_left",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 1,
  },
  {
    id: "Q_041",
    title: "Shoot 50 fireballs",
    type: "shots",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 2,
  },
  {
    id: "Q_042",
    title: "Travel 60 meters",
    type: "distance",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 3,
  },
  {
    id: "Q_043",
    title: "Collect 75 coins",
    type: "coins",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 4,
  },
  {
    id: "Q_044",
    title: "Defeat 100 enemies",
    type: "kills",
    target: 100,
    rewardCoins: 50,
    rewardScore: 500,
    weight: 5,
  },
  {
    id: "Q_045",
    title: "Reach 10 checkpoints",
    type: "checkpoints",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 1,
  },
  {
    id: "Q_046",
    title: "Finish a level with 15+ seconds left",
    type: "time_left",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 2,
  },
  {
    id: "Q_047",
    title: "Shoot 20 fireballs",
    type: "shots",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 3,
  },
  {
    id: "Q_048",
    title: "Travel 25 meters",
    type: "distance",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 4,
  },
  {
    id: "Q_049",
    title: "Collect 30 coins",
    type: "coins",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 5,
  },
  {
    id: "Q_050",
    title: "Defeat 35 enemies",
    type: "kills",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 1,
  },
  {
    id: "Q_051",
    title: "Reach 40 checkpoints",
    type: "checkpoints",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 2,
  },
  {
    id: "Q_052",
    title: "Finish a level with 50+ seconds left",
    type: "time_left",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 3,
  },
  {
    id: "Q_053",
    title: "Shoot 60 fireballs",
    type: "shots",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 4,
  },
  {
    id: "Q_054",
    title: "Travel 75 meters",
    type: "distance",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 5,
  },
  {
    id: "Q_055",
    title: "Collect 100 coins",
    type: "coins",
    target: 100,
    rewardCoins: 50,
    rewardScore: 500,
    weight: 1,
  },
  {
    id: "Q_056",
    title: "Defeat 10 enemies",
    type: "kills",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 2,
  },
  {
    id: "Q_057",
    title: "Reach 15 checkpoints",
    type: "checkpoints",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 3,
  },
  {
    id: "Q_058",
    title: "Finish a level with 20+ seconds left",
    type: "time_left",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 4,
  },
  {
    id: "Q_059",
    title: "Shoot 25 fireballs",
    type: "shots",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 5,
  },
  {
    id: "Q_060",
    title: "Travel 30 meters",
    type: "distance",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 1,
  },
  {
    id: "Q_061",
    title: "Collect 35 coins",
    type: "coins",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 2,
  },
  {
    id: "Q_062",
    title: "Defeat 40 enemies",
    type: "kills",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 3,
  },
  {
    id: "Q_063",
    title: "Reach 50 checkpoints",
    type: "checkpoints",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 4,
  },
  {
    id: "Q_064",
    title: "Finish a level with 60+ seconds left",
    type: "time_left",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 5,
  },
  {
    id: "Q_065",
    title: "Shoot 75 fireballs",
    type: "shots",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 1,
  },
  {
    id: "Q_066",
    title: "Travel 100 meters",
    type: "distance",
    target: 100,
    rewardCoins: 50,
    rewardScore: 500,
    weight: 2,
  },
  {
    id: "Q_067",
    title: "Collect 10 coins",
    type: "coins",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 3,
  },
  {
    id: "Q_068",
    title: "Defeat 15 enemies",
    type: "kills",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 4,
  },
  {
    id: "Q_069",
    title: "Reach 20 checkpoints",
    type: "checkpoints",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 5,
  },
  {
    id: "Q_070",
    title: "Finish a level with 25+ seconds left",
    type: "time_left",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 1,
  },
  {
    id: "Q_071",
    title: "Shoot 30 fireballs",
    type: "shots",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 2,
  },
  {
    id: "Q_072",
    title: "Travel 35 meters",
    type: "distance",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 3,
  },
  {
    id: "Q_073",
    title: "Collect 40 coins",
    type: "coins",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 4,
  },
  {
    id: "Q_074",
    title: "Defeat 50 enemies",
    type: "kills",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 5,
  },
  {
    id: "Q_075",
    title: "Reach 60 checkpoints",
    type: "checkpoints",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 1,
  },
  {
    id: "Q_076",
    title: "Finish a level with 75+ seconds left",
    type: "time_left",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 2,
  },
  {
    id: "Q_077",
    title: "Shoot 100 fireballs",
    type: "shots",
    target: 100,
    rewardCoins: 50,
    rewardScore: 500,
    weight: 3,
  },
  {
    id: "Q_078",
    title: "Travel 10 meters",
    type: "distance",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 4,
  },
  {
    id: "Q_079",
    title: "Collect 15 coins",
    type: "coins",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 5,
  },
  {
    id: "Q_080",
    title: "Defeat 20 enemies",
    type: "kills",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 1,
  },
  {
    id: "Q_081",
    title: "Reach 25 checkpoints",
    type: "checkpoints",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 2,
  },
  {
    id: "Q_082",
    title: "Finish a level with 30+ seconds left",
    type: "time_left",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 3,
  },
  {
    id: "Q_083",
    title: "Shoot 35 fireballs",
    type: "shots",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 4,
  },
  {
    id: "Q_084",
    title: "Travel 40 meters",
    type: "distance",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 5,
  },
  {
    id: "Q_085",
    title: "Collect 50 coins",
    type: "coins",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 1,
  },
  {
    id: "Q_086",
    title: "Defeat 60 enemies",
    type: "kills",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 2,
  },
  {
    id: "Q_087",
    title: "Reach 75 checkpoints",
    type: "checkpoints",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 3,
  },
  {
    id: "Q_088",
    title: "Finish a level with 100+ seconds left",
    type: "time_left",
    target: 100,
    rewardCoins: 50,
    rewardScore: 500,
    weight: 4,
  },
  {
    id: "Q_089",
    title: "Shoot 10 fireballs",
    type: "shots",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 5,
  },
  {
    id: "Q_090",
    title: "Travel 15 meters",
    type: "distance",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 1,
  },
  {
    id: "Q_091",
    title: "Collect 20 coins",
    type: "coins",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 2,
  },
  {
    id: "Q_092",
    title: "Defeat 25 enemies",
    type: "kills",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 3,
  },
  {
    id: "Q_093",
    title: "Reach 30 checkpoints",
    type: "checkpoints",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 4,
  },
  {
    id: "Q_094",
    title: "Finish a level with 35+ seconds left",
    type: "time_left",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 5,
  },
  {
    id: "Q_095",
    title: "Shoot 40 fireballs",
    type: "shots",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 1,
  },
  {
    id: "Q_096",
    title: "Travel 50 meters",
    type: "distance",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 2,
  },
  {
    id: "Q_097",
    title: "Collect 60 coins",
    type: "coins",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 3,
  },
  {
    id: "Q_098",
    title: "Defeat 75 enemies",
    type: "kills",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 4,
  },
  {
    id: "Q_099",
    title: "Reach 100 checkpoints",
    type: "checkpoints",
    target: 100,
    rewardCoins: 50,
    rewardScore: 500,
    weight: 5,
  },
  {
    id: "Q_100",
    title: "Finish a level with 10+ seconds left",
    type: "time_left",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 1,
  },
  {
    id: "Q_101",
    title: "Shoot 15 fireballs",
    type: "shots",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 2,
  },
  {
    id: "Q_102",
    title: "Travel 20 meters",
    type: "distance",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 3,
  },
  {
    id: "Q_103",
    title: "Collect 25 coins",
    type: "coins",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 4,
  },
  {
    id: "Q_104",
    title: "Defeat 30 enemies",
    type: "kills",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 5,
  },
  {
    id: "Q_105",
    title: "Reach 35 checkpoints",
    type: "checkpoints",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 1,
  },
  {
    id: "Q_106",
    title: "Finish a level with 40+ seconds left",
    type: "time_left",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 2,
  },
  {
    id: "Q_107",
    title: "Shoot 50 fireballs",
    type: "shots",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 3,
  },
  {
    id: "Q_108",
    title: "Travel 60 meters",
    type: "distance",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 4,
  },
  {
    id: "Q_109",
    title: "Collect 75 coins",
    type: "coins",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 5,
  },
  {
    id: "Q_110",
    title: "Defeat 100 enemies",
    type: "kills",
    target: 100,
    rewardCoins: 50,
    rewardScore: 500,
    weight: 1,
  },
  {
    id: "Q_111",
    title: "Reach 10 checkpoints",
    type: "checkpoints",
    target: 10,
    rewardCoins: 5,
    rewardScore: 50,
    weight: 2,
  },
  {
    id: "Q_112",
    title: "Finish a level with 15+ seconds left",
    type: "time_left",
    target: 15,
    rewardCoins: 7,
    rewardScore: 75,
    weight: 3,
  },
  {
    id: "Q_113",
    title: "Shoot 20 fireballs",
    type: "shots",
    target: 20,
    rewardCoins: 10,
    rewardScore: 100,
    weight: 4,
  },
  {
    id: "Q_114",
    title: "Travel 25 meters",
    type: "distance",
    target: 25,
    rewardCoins: 12,
    rewardScore: 125,
    weight: 5,
  },
  {
    id: "Q_115",
    title: "Collect 30 coins",
    type: "coins",
    target: 30,
    rewardCoins: 15,
    rewardScore: 150,
    weight: 1,
  },
  {
    id: "Q_116",
    title: "Defeat 35 enemies",
    type: "kills",
    target: 35,
    rewardCoins: 17,
    rewardScore: 175,
    weight: 2,
  },
  {
    id: "Q_117",
    title: "Reach 40 checkpoints",
    type: "checkpoints",
    target: 40,
    rewardCoins: 20,
    rewardScore: 200,
    weight: 3,
  },
  {
    id: "Q_118",
    title: "Finish a level with 50+ seconds left",
    type: "time_left",
    target: 50,
    rewardCoins: 25,
    rewardScore: 250,
    weight: 4,
  },
  {
    id: "Q_119",
    title: "Shoot 60 fireballs",
    type: "shots",
    target: 60,
    rewardCoins: 30,
    rewardScore: 300,
    weight: 5,
  },
  {
    id: "Q_120",
    title: "Travel 75 meters",
    type: "distance",
    target: 75,
    rewardCoins: 37,
    rewardScore: 375,
    weight: 1,
  },
  ];

  GP.ach.register([
  {
    id: "ACH_COIN_001",
    name: "Coin Hunter 1",
    desc: "Collect 5 coins total.",
    type: "coins",
    threshold: 5
  },
  {
    id: "ACH_COIN_002",
    name: "Coin Hunter 2",
    desc: "Collect 10 coins total.",
    type: "coins",
    threshold: 10
  },
  {
    id: "ACH_COIN_003",
    name: "Coin Hunter 3",
    desc: "Collect 20 coins total.",
    type: "coins",
    threshold: 20
  },
  {
    id: "ACH_COIN_004",
    name: "Coin Hunter 4",
    desc: "Collect 30 coins total.",
    type: "coins",
    threshold: 30
  },
  {
    id: "ACH_COIN_005",
    name: "Coin Hunter 5",
    desc: "Collect 50 coins total.",
    type: "coins",
    threshold: 50
  },
  {
    id: "ACH_COIN_006",
    name: "Coin Hunter 6",
    desc: "Collect 75 coins total.",
    type: "coins",
    threshold: 75
  },
  {
    id: "ACH_COIN_007",
    name: "Coin Hunter 7",
    desc: "Collect 100 coins total.",
    type: "coins",
    threshold: 100
  },
  {
    id: "ACH_COIN_008",
    name: "Coin Hunter 8",
    desc: "Collect 150 coins total.",
    type: "coins",
    threshold: 150
  },
  {
    id: "ACH_COIN_009",
    name: "Coin Hunter 9",
    desc: "Collect 200 coins total.",
    type: "coins",
    threshold: 200
  },
  {
    id: "ACH_COIN_010",
    name: "Coin Hunter 10",
    desc: "Collect 300 coins total.",
    type: "coins",
    threshold: 300
  },
  {
    id: "ACH_COIN_011",
    name: "Coin Hunter 11",
    desc: "Collect 400 coins total.",
    type: "coins",
    threshold: 400
  },
  {
    id: "ACH_COIN_012",
    name: "Coin Hunter 12",
    desc: "Collect 500 coins total.",
    type: "coins",
    threshold: 500
  },
  {
    id: "ACH_COIN_013",
    name: "Coin Hunter 13",
    desc: "Collect 750 coins total.",
    type: "coins",
    threshold: 750
  },
  {
    id: "ACH_COIN_014",
    name: "Coin Hunter 14",
    desc: "Collect 1000 coins total.",
    type: "coins",
    threshold: 1000
  },
  {
    id: "ACH_SCORE_001",
    name: "Score Chaser 1",
    desc: "Reach 100 score in a run.",
    type: "score",
    threshold: 100
  },
  {
    id: "ACH_SCORE_002",
    name: "Score Chaser 2",
    desc: "Reach 250 score in a run.",
    type: "score",
    threshold: 250
  },
  {
    id: "ACH_SCORE_003",
    name: "Score Chaser 3",
    desc: "Reach 500 score in a run.",
    type: "score",
    threshold: 500
  },
  {
    id: "ACH_SCORE_004",
    name: "Score Chaser 4",
    desc: "Reach 1000 score in a run.",
    type: "score",
    threshold: 1000
  },
  {
    id: "ACH_SCORE_005",
    name: "Score Chaser 5",
    desc: "Reach 2000 score in a run.",
    type: "score",
    threshold: 2000
  },
  {
    id: "ACH_SCORE_006",
    name: "Score Chaser 6",
    desc: "Reach 3000 score in a run.",
    type: "score",
    threshold: 3000
  },
  {
    id: "ACH_SCORE_007",
    name: "Score Chaser 7",
    desc: "Reach 5000 score in a run.",
    type: "score",
    threshold: 5000
  },
  {
    id: "ACH_SCORE_008",
    name: "Score Chaser 8",
    desc: "Reach 7500 score in a run.",
    type: "score",
    threshold: 7500
  },
  {
    id: "ACH_SCORE_009",
    name: "Score Chaser 9",
    desc: "Reach 10000 score in a run.",
    type: "score",
    threshold: 10000
  },
  {
    id: "ACH_SCORE_010",
    name: "Score Chaser 10",
    desc: "Reach 15000 score in a run.",
    type: "score",
    threshold: 15000
  },
  {
    id: "ACH_SCORE_011",
    name: "Score Chaser 11",
    desc: "Reach 20000 score in a run.",
    type: "score",
    threshold: 20000
  },
  {
    id: "ACH_SCORE_012",
    name: "Score Chaser 12",
    desc: "Reach 30000 score in a run.",
    type: "score",
    threshold: 30000
  },
  {
    id: "ACH_SCORE_013",
    name: "Score Chaser 13",
    desc: "Reach 50000 score in a run.",
    type: "score",
    threshold: 50000
  },
  {
    id: "ACH_KILL_001",
    name: "Enemy Bopper 1",
    desc: "Defeat 1 enemies total.",
    type: "kills",
    threshold: 1
  },
  {
    id: "ACH_KILL_002",
    name: "Enemy Bopper 2",
    desc: "Defeat 5 enemies total.",
    type: "kills",
    threshold: 5
  },
  {
    id: "ACH_KILL_003",
    name: "Enemy Bopper 3",
    desc: "Defeat 10 enemies total.",
    type: "kills",
    threshold: 10
  },
  {
    id: "ACH_KILL_004",
    name: "Enemy Bopper 4",
    desc: "Defeat 25 enemies total.",
    type: "kills",
    threshold: 25
  },
  {
    id: "ACH_KILL_005",
    name: "Enemy Bopper 5",
    desc: "Defeat 50 enemies total.",
    type: "kills",
    threshold: 50
  },
  {
    id: "ACH_KILL_006",
    name: "Enemy Bopper 6",
    desc: "Defeat 75 enemies total.",
    type: "kills",
    threshold: 75
  },
  {
    id: "ACH_KILL_007",
    name: "Enemy Bopper 7",
    desc: "Defeat 100 enemies total.",
    type: "kills",
    threshold: 100
  },
  {
    id: "ACH_KILL_008",
    name: "Enemy Bopper 8",
    desc: "Defeat 150 enemies total.",
    type: "kills",
    threshold: 150
  },
  {
    id: "ACH_KILL_009",
    name: "Enemy Bopper 9",
    desc: "Defeat 200 enemies total.",
    type: "kills",
    threshold: 200
  },
  {
    id: "ACH_KILL_010",
    name: "Enemy Bopper 10",
    desc: "Defeat 300 enemies total.",
    type: "kills",
    threshold: 300
  },
  {
    id: "ACH_KILL_011",
    name: "Enemy Bopper 11",
    desc: "Defeat 400 enemies total.",
    type: "kills",
    threshold: 400
  },
  {
    id: "ACH_KILL_012",
    name: "Enemy Bopper 12",
    desc: "Defeat 500 enemies total.",
    type: "kills",
    threshold: 500
  },
  {
    id: "ACH_LEVEL_001",
    name: "Level Climber 1",
    desc: "Finish 1 levels.",
    type: "levels",
    threshold: 1
  },
  {
    id: "ACH_LEVEL_002",
    name: "Level Climber 2",
    desc: "Finish 2 levels.",
    type: "levels",
    threshold: 2
  },
  {
    id: "ACH_LEVEL_003",
    name: "Level Climber 3",
    desc: "Finish 3 levels.",
    type: "levels",
    threshold: 3
  },
  {
    id: "ACH_LEVEL_004",
    name: "Level Climber 4",
    desc: "Finish 5 levels.",
    type: "levels",
    threshold: 5
  },
  {
    id: "ACH_LEVEL_005",
    name: "Level Climber 5",
    desc: "Finish 7 levels.",
    type: "levels",
    threshold: 7
  },
  {
    id: "ACH_LEVEL_006",
    name: "Level Climber 6",
    desc: "Finish 10 levels.",
    type: "levels",
    threshold: 10
  },
  {
    id: "ACH_DEATH_001",
    name: "Try Again 1",
    desc: "Fall or get hit 1 times total.",
    type: "deaths",
    threshold: 1
  },
  {
    id: "ACH_DEATH_002",
    name: "Try Again 2",
    desc: "Fall or get hit 5 times total.",
    type: "deaths",
    threshold: 5
  },
  {
    id: "ACH_DEATH_003",
    name: "Try Again 3",
    desc: "Fall or get hit 10 times total.",
    type: "deaths",
    threshold: 10
  },
  {
    id: "ACH_DEATH_004",
    name: "Try Again 4",
    desc: "Fall or get hit 25 times total.",
    type: "deaths",
    threshold: 25
  },
  {
    id: "ACH_DEATH_005",
    name: "Try Again 5",
    desc: "Fall or get hit 50 times total.",
    type: "deaths",
    threshold: 50
  },
  {
    id: "ACH_SHOT_001",
    name: "Fire Starter 1",
    desc: "Shoot 10 fireballs total.",
    type: "shots",
    threshold: 10
  },
  {
    id: "ACH_SHOT_002",
    name: "Fire Starter 2",
    desc: "Shoot 25 fireballs total.",
    type: "shots",
    threshold: 25
  },
  {
    id: "ACH_SHOT_003",
    name: "Fire Starter 3",
    desc: "Shoot 50 fireballs total.",
    type: "shots",
    threshold: 50
  },
  {
    id: "ACH_SHOT_004",
    name: "Fire Starter 4",
    desc: "Shoot 100 fireballs total.",
    type: "shots",
    threshold: 100
  },
  {
    id: "ACH_SHOT_005",
    name: "Fire Starter 5",
    desc: "Shoot 200 fireballs total.",
    type: "shots",
    threshold: 200
  },
  {
    id: "ACH_SHOT_006",
    name: "Fire Starter 6",
    desc: "Shoot 300 fireballs total.",
    type: "shots",
    threshold: 300
  },
  {
    id: "ACH_SHOT_007",
    name: "Fire Starter 7",
    desc: "Shoot 500 fireballs total.",
    type: "shots",
    threshold: 500
  },
  {
    id: "ACH_DIST_001",
    name: "Marathoner 1",
    desc: "Travel 100 meters total.",
    type: "distance",
    threshold: 100
  },
  {
    id: "ACH_DIST_002",
    name: "Marathoner 2",
    desc: "Travel 250 meters total.",
    type: "distance",
    threshold: 250
  },
  {
    id: "ACH_DIST_003",
    name: "Marathoner 3",
    desc: "Travel 500 meters total.",
    type: "distance",
    threshold: 500
  },
  {
    id: "ACH_DIST_004",
    name: "Marathoner 4",
    desc: "Travel 1000 meters total.",
    type: "distance",
    threshold: 1000
  },
  {
    id: "ACH_DIST_005",
    name: "Marathoner 5",
    desc: "Travel 2000 meters total.",
    type: "distance",
    threshold: 2000
  },
  {
    id: "ACH_DIST_006",
    name: "Marathoner 6",
    desc: "Travel 5000 meters total.",
    type: "distance",
    threshold: 5000
  },
  {
    id: "ACH_DIST_007",
    name: "Marathoner 7",
    desc: "Travel 10000 meters total.",
    type: "distance",
    threshold: 10000
  },
  ]);

  if (!GP.storage.get("welcome_shown", false)) {
    GP.storage.set("welcome_shown", true);
    GP.toast("GamePlus loaded: hot corners (mobile) • O/Q/H (desktop)", { y: canvas.height*0.18, life: 320 });
  }

})();

// game.js – 10 levels, lives, easier difficulty, power-ups

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

/* ----------------- Assets ----------------- */
const characterSprite = new Image();
characterSprite.src =
  "https://sdk.bitmoji.com/me/sticker/x9YP40td1zJHcC64oQ4htyATyVeig0bGqzyNqTVZDdcLWVJHRfxSeg/10207747.png?p=dD1zO2w9ZW4.v1&size=thumbnail";

const flagSprite = new Image();
flagSprite.src = "https://pngimg.com/d/flags_PNG14697.png";

const coinSprite = new Image();
coinSprite.src = "https://pngimg.com/d/coin_PNG36871.png";

/* ----------------- Player ----------------- */
const player = {
  x: 60,
  y: 0,
  width: 36,
  height: 48,
  speed: 4.5,
  jumpPower: 15,
  gravity: 0.85,
  vy: 0,
  jumping: false,
  dead: false,
  invincible: false,
  invincibleTimer: 0,
  jumpBoostTimer: 0,
};

const keys = { left: false, right: false, up: false };

/* ----------------- Game State ----------------- */
let cameraX = 0;
let levelIndex = 0; // 0..9
let levels = [];
let gameOver = false;
let gameWon = false;
let coinsCollected = 0;
let score = 0;
let lives = 5;

/* ----------------- Input ----------------- */
document.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft") keys.left = true;
  if (e.code === "ArrowRight") keys.right = true;
  if (e.code === "ArrowUp") {
    if (!player.jumping) {
      player.jumping = true;
      player.vy = -player.jumpPower;
    }
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft") keys.left = false;
  if (e.code === "ArrowRight") keys.right = false;
});

/* ----------------- Utils ----------------- */
function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/* ----------------- Level Generator ----------------- */
function createLevels() {
  levels = [];
  for (let li = 0; li < 10; li++) {
    const difficulty = li + 1;
    const levelWidth = 2200 + li * 500;
    const groundY = 340;

    // Ground
    const platforms = [
      { x: 0, y: groundY, width: levelWidth, height: canvas.height - groundY },
    ];

    // Stairs (safer jumps, more steps)
    const stairs = [];
    const stairClusters = 3 + Math.floor(difficulty * 0.6);
    for (let s = 0; s < stairClusters; s++) {
      const baseX = 300 + (s * (levelWidth - 600)) / stairClusters;
      const steps = 4 + Math.floor(difficulty / 4);
      for (let step = 0; step < steps; step++) {
        stairs.push({
          x: baseX + step * 36,
          y: groundY - (step + 1) * 28,
          width: 36,
          height: 28,
        });
      }
    }

    // Pits (fewer than before)
    const pits = [];
    const pitCount = Math.floor(difficulty / 3);
    for (let p = 0; p < pitCount; p++) {
      const px =
        900 +
        (p * (levelWidth - 1200)) / Math.max(1, pitCount) +
        (Math.random() * 150 - 75);
      const width = 60 + difficulty * 15;
      pits.push({ x: px, y: groundY, width, height: canvas.height - groundY });
    }

    // Goombas (slower)
    const goombas = [];
    const gCount = 2 + difficulty * 2;
    for (let g = 0; g < gCount; g++) {
      const gx = 400 + g * 180;
      const speed = 0.8 + difficulty * 0.2;
      goombas.push({
        x: gx,
        y: groundY - 28,
        width: 28,
        height: 28,
        speed,
        dir: Math.random() > 0.5 ? 1 : -1,
        minX: gx - 40,
        maxX: gx + 40,
        dead: false,
      });
    }

    // Spikes (fewer)
    const spikes = [];
    const spikeCount = Math.min(2 + difficulty, 8);
    for (let sp = 0; sp < spikeCount; sp++) {
      const sx =
        500 +
        (sp * (levelWidth - 800)) / spikeCount +
        (Math.random() * 100 - 50);
      spikes.push({ x: sx, y: groundY - 12, width: 28, height: 12 });
    }

    // Coins (more plentiful)
    const coins = [];
    const coinCount = 20 + difficulty * 5;
    for (let c = 0; c < coinCount; c++) {
      const cx =
        150 +
        (c * (levelWidth - 300)) / coinCount +
        (Math.random() * 50 - 25);
      const cy = groundY - 80 - Math.random() * 120;
      coins.push({ x: cx, y: cy, width: 20, height: 20, collected: false });
    }

    // Power-ups
    const powerUps = [];
    if (difficulty >= 2) {
      powerUps.push({
        type: "life",
        x: 600 + difficulty * 150,
        y: groundY - 40,
        width: 24,
        height: 24,
        taken: false,
      });
    }
    if (difficulty >= 4) {
      powerUps.push({
        type: "star",
        x: 1200 + difficulty * 120,
        y: groundY - 60,
        width: 24,
        height: 24,
        taken: false,
      });
    }
    if (difficulty >= 6) {
      powerUps.push({
        type: "jump",
        x: 1800 + difficulty * 100,
        y: groundY - 60,
        width: 24,
        height: 24,
        taken: false,
      });
    }

    // Flag
    const flag = {
      x: levelWidth - 120,
      y: groundY - 90,
      width: 28,
      height: 56,
    };

    levels.push({
      width: levelWidth,
      groundY,
      stairs,
      pits,
      goombas,
      spikes,
      coins,
      powerUps,
      flag,
    });
  }
}

/* ----------------- Init & Reset ----------------- */
function init() {
  createLevels();
  resetToLevel(0);
}

function resetToLevel(idx) {
  if (idx === 0) {
    lives = 5;
    coinsCollected = 0;
    score = 0;
  }

  levelIndex = idx;
  const L = levels[levelIndex];
  player.x = 80;
  player.y = L.groundY - player.height;
  player.vy = 0;
  player.jumping = false;
  player.dead = false;
  gameOver = false;
  gameWon = false;
  cameraX = 0;

  L.coins.forEach((c) => (c.collected = false));
  L.goombas.forEach((g) => (g.dead = false));
  L.powerUps.forEach((p) => (p.taken = false));
}

/* ----------------- Update ----------------- */
function update() {
  if (gameOver || gameWon) return;
  const L = levels[levelIndex];

  if (keys.left) player.x -= player.speed;
  if (keys.right) player.x += player.speed;
  player.x = Math.max(0, Math.min(L.width - player.width, player.x));

  // Gravity
  player.y += player.vy;
  player.vy += player.gravity;

  // Ground
  const onPit = L.pits.some(
    (pit) =>
      player.x + player.width > pit.x &&
      player.x < pit.x + pit.width &&
      player.y + player.height >= pit.y
  );
  if (!onPit && player.y + player.height >= L.groundY) {
    player.y = L.groundY - player.height;
    player.vy = 0;
    player.jumping = false;
  }

  // Stairs
  L.stairs.forEach((st) => {
    if (
      rectsOverlap(player, st) &&
      player.y + player.height > st.y &&
      player.vy >= 0
    ) {
      player.y = st.y - player.height;
      player.vy = 0;
      player.jumping = false;
    }
  });

  // Goombas
  L.goombas.forEach((g) => {
    if (g.dead) return;
    g.x += g.speed * g.dir;
    if (g.x < g.minX) g.dir = 1;
    if (g.x + g.width > g.maxX) g.dir = -1;

    if (rectsOverlap(player, g)) {
      if (player.invincible) {
        g.dead = true;
        score += 100;
      } else if (
        player.vy > 0 &&
        player.y + player.height - g.y < 18
      ) {
        g.dead = true;
        player.vy = -player.jumpPower * 0.6;
        score += 100;
      } else {
        gameOver = true;
      }
    }
  });

  // Spikes
  L.spikes.forEach((sp) => {
    if (!player.invincible && rectsOverlap(player, sp)) {
      gameOver = true;
    }
  });

  // Coins
  L.coins.forEach((c) => {
    if (!c.collected && rectsOverlap(player, c)) {
      c.collected = true;
      coinsCollected++;
      score += 10;
    }
  });

  // Power-ups
  L.powerUps.forEach((p) => {
    if (!p.taken && rectsOverlap(player, p)) {
      p.taken = true;
      if (p.type === "life") {
        lives++;
      } else if (p.type === "star") {
        player.invincible = true;
        player.invincibleTimer = 600;
      } else if (p.type === "jump") {
        player.jumpPower = 20;
        player.jumpBoostTimer = 600;
      }
    }
  });

  if (player.invincibleTimer > 0) {
    player.invincibleTimer--;
    if (player.invincibleTimer === 0) player.invincible = false;
  }
  if (player.jumpBoostTimer > 0) {
    player.jumpBoostTimer--;
    if (player.jumpBoostTimer === 0) player.jumpPower = 15;
  }

  // Flag
  if (rectsOverlap(player, L.flag)) {
    if (levelIndex < levels.length - 1) {
      resetToLevel(levelIndex + 1);
    } else {
      gameWon = true;
    }
  }

  // Pit fall
  if (player.y > canvas.height + 100) {
    gameOver = true;
  }

  // Camera
  cameraX = Math.max(
    0,
    Math.min(player.x - canvas.width * 0.3, L.width - canvas.width)
  );
}

/* ----------------- Draw ----------------- */
function draw() {
  ctx.fillStyle = "#87ceeb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const L = levels[levelIndex];
  ctx.save();
  ctx.translate(-cameraX, 0);

  // Ground
  ctx.fillStyle = "#b5651d";
  ctx.fillRect(0, L.groundY, L.width, canvas.height - L.groundY);

  // Pits
  ctx.fillStyle = "#4d2b00";
  L.pits.forEach((pit) =>
    ctx.fillRect(pit.x, pit.y, pit.width, pit.height)
  );

  // Stairs
  ctx.fillStyle = "#a0522d";
  L.stairs.forEach((st) =>
    ctx.fillRect(st.x, st.y, st.width, st.height)
  );

  // Spikes
  ctx.fillStyle = "black";
  L.spikes.forEach((sp) => {
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y + sp.height);
    ctx.lineTo(sp.x + sp.width / 2, sp.y);
    ctx.lineTo(sp.x + sp.width, sp.y + sp.height);
    ctx.fill();
  });

  // Coins
  L.coins.forEach((c) => {
    if (!c.collected)
      ctx.drawImage(coinSprite, c.x, c.y, c.width, c.height);
  });

  // Power-ups
  L.powerUps.forEach((p) => {
    if (!p.taken) {
      ctx.fillStyle =
        p.type === "life"
          ? "red"
          : p.type === "star"
          ? "yellow"
          : "blue";
      ctx.fillRect(p.x, p.y, p.width, p.height);
    }
  });

  // Goombas
  ctx.fillStyle = "sienna";
  L.goombas.forEach((g) => {
    if (!g.dead) ctx.fillRect(g.x, g.y, g.width, g.height);
  });

  // Flag
  ctx.drawImage(
    flagSprite,
    L.flag.x,
    L.flag.y,
    L.flag.width,
    L.flag.height
  );

  // Player
  ctx.drawImage(
    characterSprite,
    player.x,
    player.y,
    player.width,
    player.height
  );

  ctx.restore();

  // HUD
  ctx.fillStyle = "black";
  ctx.font = "18px Arial";
  ctx.fillText(`Level: ${levelIndex + 1}/10`, 12, 24);
  ctx.fillText(`Coins: ${coinsCollected}`, 140, 24);
  ctx.fillText(`Score: ${score}`, 260, 24);
  ctx.fillText(`Lives: ${lives}`, 380, 24);
  if (player.invincible) ctx.fillText("Invincible!", 480, 24);
  if (player.jumpBoostTimer > 0) ctx.fillText("Super Jump!", 600, 24);

  if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, canvas.height / 2 - 60, canvas.width, 140);
    ctx.fillStyle = "white";
    ctx.font = "48px Arial";
    ctx.fillText("GAME OVER", canvas.width / 2 - 140, canvas.height / 2);
    ctx.font = "20px Arial";
    ctx.fillText(
      "Click to restart",
      canvas.width / 2 - 70,
      canvas.height / 2 + 40
    );
  } else if (gameWon) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, canvas.height / 2 - 60, canvas.width, 140);
    ctx.fillStyle = "white";
    ctx.font = "42px Arial";
    ctx.fillText("YOU WIN!", canvas.width / 2 - 100, canvas.height / 2);
    ctx.font = "20px Arial";
    ctx.fillText(
      `Final Score: ${score}`,
      canvas.width / 2 - 70,
      canvas.height / 2 + 40
    );
  }
}

/* ----------------- Restart ----------------- */
canvas.addEventListener("click", () => {
  if (!gameOver && !gameWon) return;

  if (gameOver) {
    lives--;
    if (lives > 0) {
      resetToLevel(levelIndex);
    } else {
      resetToLevel(0);
    }
  } else if (gameWon) {
    resetToLevel(0);
  }

  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
});

/* ----------------- Loop ----------------- */
let lastTime = performance.now();
function gameLoop(now = performance.now()) {
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  update(delta);
  draw();

  if (!gameOver && !gameWon) requestAnimationFrame(gameLoop);
}

/* ----------------- Start ----------------- */
let assetsLoaded = 0;
function tryStart() {
  assetsLoaded++;
  if (assetsLoaded === 3) {
    init();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
}
characterSprite.onload = tryStart;
flagSprite.onload = tryStart;
coinSprite.onload = tryStart;

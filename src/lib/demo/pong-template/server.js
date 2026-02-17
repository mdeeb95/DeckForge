const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3000;

// ─── Game Constants ──────────────────────────────────────────────────────────
const TICK_RATE = 60;
const CANVAS_W = 800;
const CANVAS_H = 600;
const PADDLE_W = 12;
const PADDLE_H = 80;
const PADDLE_SPEED = 5;
const BALL_SIZE = 10;
const INITIAL_BALL_SPEED = 4;
const SPEED_INCREMENT = 0.3;
const WIN_SCORE = 11;
const PAUSE_AFTER_SCORE_MS = 2000;

// ─── Power-Up Constants ────────────────────────────────────────────────────
const POWERUP_SPAWN_MIN = 10000;   // Min ms between spawns (10s)
const POWERUP_SPAWN_MAX = 15000;   // Max ms between spawns (15s)
const POWERUP_DESPAWN_MS = 5000;   // Despawn after 5s if uncollected
const POWERUP_SIZE = 20;           // Hitbox size
const POWERUP_TYPES = ['freeze', 'multiball', 'sizeboost'];
// Effect durations
const FREEZE_DURATION = 3000;      // 3 seconds
const FREEZE_SPEED_MULT = 0.3;     // 30% speed
const SIZEBOOST_DURATION = 5000;   // 5 seconds
const SIZEBOOST_MULT = 1.5;        // 50% bigger paddle

// ─── AI Constants ───────────────────────────────────────────────────────────
const AI_DIFFICULTY = {
  easy:   { reactionSpeed: 2.5, accuracy: 0.30, updateInterval: 12, jitter: 60 },
  medium: { reactionSpeed: 4.0, accuracy: 0.70, updateInterval: 6,  jitter: 25 },
  hard:   { reactionSpeed: 4.8, accuracy: 0.95, updateInterval: 2,  jitter: 8  },
};

// ─── Game Mode State ────────────────────────────────────────────────────────
let gameMode = '2p';         // '1p' | '2p'
let aiDifficulty = 'medium'; // 'easy' | 'medium' | 'hard'
let gameStarted = false;     // false = waiting in lobby

// ─── AI State ───────────────────────────────────────────────────────────────
let aiTargetY = CANVAS_H / 2;  // Where the AI wants to move
let aiTickCounter = 0;          // Ticks since last AI decision
let aiIntentionalMiss = false;  // Whether AI is deliberately missing this shot

// ─── Game State ──────────────────────────────────────────────────────────────
let state = {
  ball: { x: CANVAS_W / 2, y: CANVAS_H / 2, vx: INITIAL_BALL_SPEED, vy: 0 },
  p1: { y: CANVAS_H / 2 - PADDLE_H / 2, score: 0 },
  p2: { y: CANVAS_H / 2 - PADDLE_H / 2, score: 0 },
  paused: false,
  winner: null,
  gameMode: '2p',
  aiDifficulty: 'medium',
  gameStarted: false,
  // Power-up state (sent to client for rendering)
  powerup: null,               // { x, y, type, spawnedAt } or null
  extraBalls: [],              // [{ x, y, vx, vy }] for multi-ball
  activeEffects: {
    freeze: null,              // { until } or null
    sizeboost: { p1: null, p2: null }, // { until } per player, or null
  },
  p1PaddleH: PADDLE_H,
  p2PaddleH: PADDLE_H,
};

let pauseUntil = 0;
let ballSpeed = INITIAL_BALL_SPEED;
let extraBallSpeeds = [];        // Track speed per extra ball
let lastHitBy = 1;               // Which player last hit the main ball (1 or 2)

// ─── Power-Up Spawn Timer ──────────────────────────────────────────────────
let nextPowerupSpawn = 0;        // Timestamp when next power-up should spawn
let frozenBallSpeed = 0;         // Saved ball speed during freeze

const inputs = { p1: { up: false, down: false }, p2: { up: false, down: false } };

// ─── Players ─────────────────────────────────────────────────────────────────
const players = new Map(); // ws → 1 | 2 | 'spectator'
let nextSlot = 1;

function resetBall(serveToward) {
  state.ball.x = CANVAS_W / 2;
  state.ball.y = CANVAS_H / 2;
  ballSpeed = INITIAL_BALL_SPEED;
  const angle = (Math.random() * 0.8 - 0.4); // -0.4 to 0.4 radians
  state.ball.vx = (serveToward === 1 ? -1 : 1) * ballSpeed * Math.cos(angle);
  state.ball.vy = ballSpeed * Math.sin(angle);
}

function resetGame() {
  state.p1.score = 0;
  state.p2.score = 0;
  state.p1.y = CANVAS_H / 2 - PADDLE_H / 2;
  state.p2.y = CANVAS_H / 2 - PADDLE_H / 2;
  state.winner = null;
  state.paused = false;
  pauseUntil = 0;
  aiTargetY = CANVAS_H / 2;
  aiTickCounter = 0;
  aiIntentionalMiss = false;
  // Reset power-ups
  state.powerup = null;
  state.extraBalls = [];
  extraBallSpeeds = [];
  state.activeEffects = { freeze: null, sizeboost: { p1: null, p2: null } };
  state.p1PaddleH = PADDLE_H;
  state.p2PaddleH = PADDLE_H;
  frozenBallSpeed = 0;
  lastHitBy = 1;
  nextPowerupSpawn = Date.now() + randomSpawnDelay();
  resetBall(1);
}

// ─── Power-Up Helpers ──────────────────────────────────────────────────────
function randomSpawnDelay() {
  return POWERUP_SPAWN_MIN + Math.random() * (POWERUP_SPAWN_MAX - POWERUP_SPAWN_MIN);
}

function spawnPowerup() {
  // Spawn in the middle 60% of the field, avoiding paddle zones
  const margin = CANVAS_W * 0.2;
  const x = margin + Math.random() * (CANVAS_W - margin * 2);
  const y = 40 + Math.random() * (CANVAS_H - 80);
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  state.powerup = { x, y, type, spawnedAt: Date.now() };
}

function clearPowerup() {
  state.powerup = null;
  nextPowerupSpawn = Date.now() + randomSpawnDelay();
}

function activatePowerup(type, player) {
  const now = Date.now();
  if (type === 'freeze') {
    // Slow ball to 30% speed for 3s
    if (!state.activeEffects.freeze) {
      frozenBallSpeed = ballSpeed;
      const mult = FREEZE_SPEED_MULT;
      state.ball.vx *= mult;
      state.ball.vy *= mult;
      ballSpeed *= mult;
      // Also slow extra balls
      for (let i = 0; i < state.extraBalls.length; i++) {
        state.extraBalls[i].vx *= mult;
        state.extraBalls[i].vy *= mult;
        extraBallSpeeds[i] *= mult;
      }
    }
    state.activeEffects.freeze = { until: now + FREEZE_DURATION };
  } else if (type === 'multiball') {
    // Spawn 2 extra balls from current ball position
    for (let i = 0; i < 2; i++) {
      const angle = (Math.random() * 1.2 - 0.6); // -0.6 to 0.6
      const dir = Math.random() > 0.5 ? 1 : -1;
      const spd = INITIAL_BALL_SPEED + 1;
      state.extraBalls.push({
        x: state.ball.x,
        y: state.ball.y,
        vx: dir * spd * Math.cos(angle),
        vy: spd * Math.sin(angle),
      });
      extraBallSpeeds.push(spd);
    }
  } else if (type === 'sizeboost') {
    // Increase collecting player's paddle by 50% for 5s
    const key = player === 1 ? 'p1' : 'p2';
    state.activeEffects.sizeboost[key] = { until: now + SIZEBOOST_DURATION };
    if (key === 'p1') state.p1PaddleH = Math.round(PADDLE_H * SIZEBOOST_MULT);
    else state.p2PaddleH = Math.round(PADDLE_H * SIZEBOOST_MULT);
  }
}

function tickPowerups() {
  const now = Date.now();

  // Spawn logic: only if no powerup on field and timer elapsed
  if (!state.powerup && now >= nextPowerupSpawn) {
    spawnPowerup();
  }

  // Despawn uncollected powerup after 5s
  if (state.powerup && now - state.powerup.spawnedAt >= POWERUP_DESPAWN_MS) {
    clearPowerup();
  }

  // Check ball collision with powerup (any ball can collect)
  if (state.powerup) {
    const pu = state.powerup;
    // Main ball collision
    if (
      state.ball.x + BALL_SIZE >= pu.x &&
      state.ball.x <= pu.x + POWERUP_SIZE &&
      state.ball.y + BALL_SIZE >= pu.y &&
      state.ball.y <= pu.y + POWERUP_SIZE
    ) {
      activatePowerup(pu.type, lastHitBy);
      clearPowerup();
    }
    // Extra ball collision
    if (state.powerup) {
      for (const eb of state.extraBalls) {
        if (
          eb.x + BALL_SIZE >= pu.x &&
          eb.x <= pu.x + POWERUP_SIZE &&
          eb.y + BALL_SIZE >= pu.y &&
          eb.y <= pu.y + POWERUP_SIZE
        ) {
          activatePowerup(pu.type, lastHitBy);
          clearPowerup();
          break;
        }
      }
    }
  }

  // Expire freeze effect
  if (state.activeEffects.freeze && now >= state.activeEffects.freeze.until) {
    // Restore ball speed
    if (frozenBallSpeed > 0) {
      const restoreMult = frozenBallSpeed / ballSpeed;
      state.ball.vx *= restoreMult;
      state.ball.vy *= restoreMult;
      ballSpeed = frozenBallSpeed;
      // Restore extra balls
      for (let i = 0; i < state.extraBalls.length; i++) {
        const eb = state.extraBalls[i];
        const ebRestore = extraBallSpeeds[i] / (extraBallSpeeds[i] * FREEZE_SPEED_MULT);
        eb.vx *= ebRestore;
        eb.vy *= ebRestore;
      }
      frozenBallSpeed = 0;
    }
    state.activeEffects.freeze = null;
  }

  // Expire sizeboost effects
  if (state.activeEffects.sizeboost.p1 && now >= state.activeEffects.sizeboost.p1.until) {
    state.activeEffects.sizeboost.p1 = null;
    state.p1PaddleH = PADDLE_H;
    // Clamp paddle position
    state.p1.y = Math.min(state.p1.y, CANVAS_H - PADDLE_H);
  }
  if (state.activeEffects.sizeboost.p2 && now >= state.activeEffects.sizeboost.p2.until) {
    state.activeEffects.sizeboost.p2 = null;
    state.p2PaddleH = PADDLE_H;
    state.p2.y = Math.min(state.p2.y, CANVAS_H - PADDLE_H);
  }
}

// ─── AI Opponent ────────────────────────────────────────────────────────────
function predictBallY() {
  // Simulate ball trajectory to find where it will reach P2's paddle x position
  let bx = state.ball.x;
  let by = state.ball.y;
  let bvx = state.ball.vx;
  let bvy = state.ball.vy;

  // Only predict when ball is moving toward P2 (right)
  if (bvx <= 0) return CANVAS_H / 2; // Return to center when ball goes away

  const targetX = CANVAS_W - PADDLE_W - 10 - BALL_SIZE;
  const maxSteps = 600; // Safety limit

  for (let i = 0; i < maxSteps; i++) {
    bx += bvx;
    by += bvy;
    // Wall bounces
    if (by <= 0) { by = 0; bvy *= -1; }
    if (by >= CANVAS_H - BALL_SIZE) { by = CANVAS_H - BALL_SIZE; bvy *= -1; }
    if (bx >= targetX) return by + BALL_SIZE / 2;
  }
  return CANVAS_H / 2;
}

function updateAI() {
  const diff = AI_DIFFICULTY[aiDifficulty];
  aiTickCounter++;

  // Only update AI decision at the configured interval
  if (aiTickCounter >= diff.updateInterval) {
    aiTickCounter = 0;

    // Decide whether to intentionally miss this shot
    if (state.ball.vx > 0 && state.ball.x < CANVAS_W * 0.3) {
      aiIntentionalMiss = Math.random() > diff.accuracy;
    }

    if (aiIntentionalMiss) {
      // Deliberately aim for wrong position (offset from prediction)
      const wrongDir = Math.random() > 0.5 ? 1 : -1;
      aiTargetY = predictBallY() + wrongDir * (PADDLE_H * 1.5 + Math.random() * 80);
    } else {
      // Aim for predicted ball position with jitter
      const jitter = (Math.random() - 0.5) * diff.jitter * 2;
      aiTargetY = predictBallY() + jitter;
    }
  }

  // Move paddle toward target at constrained speed (use dynamic paddle height)
  const aiPH = state.p2PaddleH;
  const paddleCenter = state.p2.y + aiPH / 2;
  const delta = aiTargetY - paddleCenter;
  const deadZone = 4; // Don't jitter when close enough

  inputs.p2.up = false;
  inputs.p2.down = false;

  if (Math.abs(delta) > deadZone) {
    const moveSpeed = Math.min(PADDLE_SPEED, diff.reactionSpeed);
    if (delta < 0) {
      inputs.p2.up = true;
      inputs.p2.down = false;
    } else {
      inputs.p2.up = false;
      inputs.p2.down = true;
    }
    if (delta < 0) {
      state.p2.y = Math.max(0, state.p2.y - moveSpeed);
    } else {
      state.p2.y = Math.min(CANVAS_H - aiPH, state.p2.y + moveSpeed);
    }
    inputs.p2.up = false;
    inputs.p2.down = false;
  }
}

// ─── Physics ─────────────────────────────────────────────────────────────────
function tick() {
  const now = Date.now();

  if (!gameStarted) return;
  if (state.winner) return;
  if (now < pauseUntil) { state.paused = true; return; }
  state.paused = false;

  // Run AI before paddle movement (AI directly moves p2, clears its own inputs)
  if (gameMode === '1p') {
    updateAI();
  }

  // Move paddles (use dynamic paddle height for clamping)
  if (inputs.p1.up) state.p1.y = Math.max(0, state.p1.y - PADDLE_SPEED);
  if (inputs.p1.down) state.p1.y = Math.min(CANVAS_H - state.p1PaddleH, state.p1.y + PADDLE_SPEED);
  if (inputs.p2.up) state.p2.y = Math.max(0, state.p2.y - PADDLE_SPEED);
  if (inputs.p2.down) state.p2.y = Math.min(CANVAS_H - state.p2PaddleH, state.p2.y + PADDLE_SPEED);

  // Move ball
  state.ball.x += state.ball.vx;
  state.ball.y += state.ball.vy;

  // Top/bottom wall bounce
  if (state.ball.y <= 0) { state.ball.y = 0; state.ball.vy *= -1; }
  if (state.ball.y >= CANVAS_H - BALL_SIZE) { state.ball.y = CANVAS_H - BALL_SIZE; state.ball.vy *= -1; }

  // Paddle 1 collision (left) — uses dynamic paddle height
  const p1H = state.p1PaddleH;
  if (
    state.ball.x <= PADDLE_W + 10 &&
    state.ball.x >= 10 &&
    state.ball.y + BALL_SIZE >= state.p1.y &&
    state.ball.y <= state.p1.y + p1H
  ) {
    ballSpeed += SPEED_INCREMENT;
    const hitPos = ((state.ball.y + BALL_SIZE / 2) - state.p1.y) / p1H;
    const angle = (hitPos - 0.5) * 1.2;
    state.ball.vx = ballSpeed * Math.cos(angle);
    state.ball.vy = ballSpeed * Math.sin(angle);
    state.ball.x = PADDLE_W + 11;
    lastHitBy = 1;
  }

  // Paddle 2 collision (right) — uses dynamic paddle height
  const p2H = state.p2PaddleH;
  if (
    state.ball.x + BALL_SIZE >= CANVAS_W - PADDLE_W - 10 &&
    state.ball.x + BALL_SIZE <= CANVAS_W - 10 &&
    state.ball.y + BALL_SIZE >= state.p2.y &&
    state.ball.y <= state.p2.y + p2H
  ) {
    ballSpeed += SPEED_INCREMENT;
    const hitPos = ((state.ball.y + BALL_SIZE / 2) - state.p2.y) / p2H;
    const angle = (hitPos - 0.5) * 1.2;
    state.ball.vx = -ballSpeed * Math.cos(angle);
    state.ball.vy = ballSpeed * Math.sin(angle);
    state.ball.x = CANVAS_W - PADDLE_W - 10 - BALL_SIZE - 1;
    lastHitBy = 2;
  }

  // Score — main ball
  if (state.ball.x < 0) {
    state.p2.score++;
    if (state.p2.score >= WIN_SCORE) { state.winner = 2; return; }
    pauseUntil = now + PAUSE_AFTER_SCORE_MS;
    resetBall(2);
  }
  if (state.ball.x > CANVAS_W) {
    state.p1.score++;
    if (state.p1.score >= WIN_SCORE) { state.winner = 1; return; }
    pauseUntil = now + PAUSE_AFTER_SCORE_MS;
    resetBall(1);
  }

  // ─── Extra Balls Physics (Multi-Ball) ───────────────────────────────
  for (let i = state.extraBalls.length - 1; i >= 0; i--) {
    const eb = state.extraBalls[i];
    let ebSpeed = extraBallSpeeds[i];

    // Move
    eb.x += eb.vx;
    eb.y += eb.vy;

    // Wall bounce
    if (eb.y <= 0) { eb.y = 0; eb.vy *= -1; }
    if (eb.y >= CANVAS_H - BALL_SIZE) { eb.y = CANVAS_H - BALL_SIZE; eb.vy *= -1; }

    // P1 paddle collision
    if (
      eb.x <= PADDLE_W + 10 && eb.x >= 10 &&
      eb.y + BALL_SIZE >= state.p1.y && eb.y <= state.p1.y + p1H
    ) {
      ebSpeed += SPEED_INCREMENT;
      extraBallSpeeds[i] = ebSpeed;
      const hitPos = ((eb.y + BALL_SIZE / 2) - state.p1.y) / p1H;
      const angle = (hitPos - 0.5) * 1.2;
      eb.vx = ebSpeed * Math.cos(angle);
      eb.vy = ebSpeed * Math.sin(angle);
      eb.x = PADDLE_W + 11;
    }

    // P2 paddle collision
    if (
      eb.x + BALL_SIZE >= CANVAS_W - PADDLE_W - 10 &&
      eb.x + BALL_SIZE <= CANVAS_W - 10 &&
      eb.y + BALL_SIZE >= state.p2.y && eb.y <= state.p2.y + p2H
    ) {
      ebSpeed += SPEED_INCREMENT;
      extraBallSpeeds[i] = ebSpeed;
      const hitPos = ((eb.y + BALL_SIZE / 2) - state.p2.y) / p2H;
      const angle = (hitPos - 0.5) * 1.2;
      eb.vx = -ebSpeed * Math.cos(angle);
      eb.vy = ebSpeed * Math.sin(angle);
      eb.x = CANVAS_W - PADDLE_W - 10 - BALL_SIZE - 1;
    }

    // Score — extra balls score and then get removed
    let removeThis = false;
    if (eb.x < 0) {
      state.p2.score++;
      if (state.p2.score >= WIN_SCORE) { state.winner = 2; return; }
      removeThis = true;
    }
    if (eb.x > CANVAS_W) {
      state.p1.score++;
      if (state.p1.score >= WIN_SCORE) { state.winner = 1; return; }
      removeThis = true;
    }
    if (removeThis) {
      state.extraBalls.splice(i, 1);
      extraBallSpeeds.splice(i, 1);
    }
  }

  // ─── Power-Up Tick ──────────────────────────────────────────────────
  tickPowerups();
}

// ─── Broadcast ───────────────────────────────────────────────────────────────
function broadcast() {
  state.gameMode = gameMode;
  state.aiDifficulty = aiDifficulty;
  state.gameStarted = gameStarted;
  const msg = JSON.stringify(state);
  for (const ws of players.keys()) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ─── WebSocket ───────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  let role;
  if (nextSlot <= 2) {
    role = nextSlot++;
  } else {
    role = 'spectator';
  }
  players.set(ws, role);
  ws.send(JSON.stringify({
    type: 'assign', role,
    canvas: { w: CANVAS_W, h: CANVAS_H },
    gameMode, aiDifficulty, gameStarted,
  }));
  console.log(`Player connected as ${role === 'spectator' ? 'spectator' : 'P' + role}`);

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);
      const r = players.get(ws);

      // Mode selection (only P1 can set mode)
      if (data.setMode && r === 1) {
        gameMode = data.setMode === '1p' ? '1p' : '2p';
        aiDifficulty = data.aiDifficulty || 'medium';
        if (!AI_DIFFICULTY[aiDifficulty]) aiDifficulty = 'medium';
        state.gameMode = gameMode;
        state.aiDifficulty = aiDifficulty;
      }

      // Start game
      if (data.startGame && r === 1 && !gameStarted) {
        gameStarted = true;
        state.gameStarted = true;
        resetGame();
      }

      // Normal input
      if (r === 1) { inputs.p1.up = !!data.up; inputs.p1.down = !!data.down; }
      if (r === 2 && gameMode === '2p') { inputs.p2.up = !!data.up; inputs.p2.down = !!data.down; }

      // Restart — go back to mode select
      if (data.restart && state.winner) {
        gameStarted = false;
        state.gameStarted = false;
        resetGame();
      }
    } catch {}
  });

  ws.on('close', () => {
    const r = players.get(ws);
    players.delete(ws);
    if (r === 1 || r === 2) {
      nextSlot = Math.min(nextSlot, r);
      console.log(`P${r} disconnected — slot reopened`);
    }
  });
});

// ─── Game Loop ───────────────────────────────────────────────────────────────
setInterval(() => { tick(); broadcast(); }, 1000 / TICK_RATE);

// ─── HTTP ────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/pomodoro', (_req, res) => res.sendFile(path.join(__dirname, 'pomodoro.html')));

server.listen(PORT, () => {
  console.log(`Pong server running on http://localhost:${PORT}`);
});

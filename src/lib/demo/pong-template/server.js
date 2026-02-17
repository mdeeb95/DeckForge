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
const POWERUP_SPAWN_MIN = 10000;
const POWERUP_SPAWN_MAX = 15000;
const POWERUP_DESPAWN_MS = 5000;
const POWERUP_SIZE = 20;
const POWERUP_TYPES = ['freeze', 'multiball', 'sizeboost'];
const FREEZE_DURATION = 3000;
const FREEZE_SPEED_MULT = 0.3;
const SIZEBOOST_DURATION = 5000;
const SIZEBOOST_MULT = 1.5;

// ─── AI Constants ───────────────────────────────────────────────────────────
const AI_DIFFICULTY = {
  easy:   { reactionSpeed: 2.5, accuracy: 0.30, updateInterval: 12, jitter: 60 },
  medium: { reactionSpeed: 4.0, accuracy: 0.70, updateInterval: 6,  jitter: 25 },
  hard:   { reactionSpeed: 4.8, accuracy: 0.95, updateInterval: 2,  jitter: 8  },
};

// ─── Horizontal Paddle Constants (top/bottom in FFA/2v2) ────────────────────
const HPADDLE_W = 80;   // Width of horizontal paddles (same as vertical paddle height)
const HPADDLE_H = 12;   // Height of horizontal paddles (same as vertical paddle width)

// ─── Game Mode State ────────────────────────────────────────────────────────
let gameMode = '2p';         // '1p' | '2p' | '2v2' | 'ffa'
let aiDifficulty = 'medium';
let gameStarted = false;

// ─── AI State ───────────────────────────────────────────────────────────────
let aiTargetY = CANVAS_H / 2;
let aiTickCounter = 0;
let aiIntentionalMiss = false;

// ─── Game State ──────────────────────────────────────────────────────────────
let state = createInitialState();

function createInitialState() {
  return {
    ball: { x: CANVAS_W / 2, y: CANVAS_H / 2, vx: INITIAL_BALL_SPEED, vy: 0 },
    p1: { y: CANVAS_H / 2 - PADDLE_H / 2, score: 0 },   // Left paddle
    p2: { y: CANVAS_H / 2 - PADDLE_H / 2, score: 0 },   // Right paddle
    p3: { x: CANVAS_W / 2 - HPADDLE_W / 2, score: 0 },  // Top paddle
    p4: { x: CANVAS_W / 2 - HPADDLE_W / 2, score: 0 },  // Bottom paddle
    paused: false,
    winner: null,           // Player number, team name, or null
    winnerLabel: null,      // Display string for winner
    gameMode: '2p',
    aiDifficulty: 'medium',
    gameStarted: false,
    powerup: null,
    extraBalls: [],
    activeEffects: {
      freeze: null,
      sizeboost: { p1: null, p2: null, p3: null, p4: null },
    },
    p1PaddleH: PADDLE_H,    // Left: vertical paddle height
    p2PaddleH: PADDLE_H,    // Right: vertical paddle height
    p3PaddleW: HPADDLE_W,   // Top: horizontal paddle width
    p4PaddleW: HPADDLE_W,   // Bottom: horizontal paddle width
    // Team scores for 2v2 (p1+p3 = Team A, p2+p4 = Team B)
    teamA: 0,
    teamB: 0,
    activePlayers: 2,       // How many player slots are active (2 or 4)
  };
}

let pauseUntil = 0;
let ballSpeed = INITIAL_BALL_SPEED;
let extraBallSpeeds = [];
let lastHitBy = 1;

// ─── Power-Up Spawn Timer ──────────────────────────────────────────────────
let nextPowerupSpawn = 0;
let frozenBallSpeed = 0;

const inputs = {
  p1: { up: false, down: false },
  p2: { up: false, down: false },
  p3: { left: false, right: false },
  p4: { left: false, right: false },
};

// ─── Players ─────────────────────────────────────────────────────────────────
const players = new Map(); // ws → 1 | 2 | 3 | 4 | 'spectator'
let nextSlot = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isMultiplayerMode() {
  return gameMode === '2v2' || gameMode === 'ffa';
}

function maxPlayers() {
  if (gameMode === '2v2' || gameMode === 'ffa') return 4;
  return 2;
}

function resetBall(serveToward) {
  state.ball.x = CANVAS_W / 2;
  state.ball.y = CANVAS_H / 2;
  ballSpeed = INITIAL_BALL_SPEED;

  if (isMultiplayerMode()) {
    // Serve in a random direction for 4-player modes
    const angle = Math.random() * Math.PI * 2;
    state.ball.vx = ballSpeed * Math.cos(angle);
    state.ball.vy = ballSpeed * Math.sin(angle);
    // Make sure it's not too shallow on any axis
    if (Math.abs(state.ball.vx) < 1) state.ball.vx = (state.ball.vx >= 0 ? 1 : -1) * 2;
    if (Math.abs(state.ball.vy) < 1) state.ball.vy = (state.ball.vy >= 0 ? 1 : -1) * 2;
  } else {
    const angle = (Math.random() * 0.8 - 0.4);
    state.ball.vx = (serveToward === 1 ? -1 : 1) * ballSpeed * Math.cos(angle);
    state.ball.vy = ballSpeed * Math.sin(angle);
  }
}

function resetGame() {
  state.p1.score = 0;
  state.p2.score = 0;
  state.p3.score = 0;
  state.p4.score = 0;
  state.teamA = 0;
  state.teamB = 0;
  state.p1.y = CANVAS_H / 2 - PADDLE_H / 2;
  state.p2.y = CANVAS_H / 2 - PADDLE_H / 2;
  state.p3.x = CANVAS_W / 2 - HPADDLE_W / 2;
  state.p4.x = CANVAS_W / 2 - HPADDLE_W / 2;
  state.winner = null;
  state.winnerLabel = null;
  state.paused = false;
  pauseUntil = 0;
  aiTargetY = CANVAS_H / 2;
  aiTickCounter = 0;
  aiIntentionalMiss = false;
  state.powerup = null;
  state.extraBalls = [];
  extraBallSpeeds = [];
  state.activeEffects = { freeze: null, sizeboost: { p1: null, p2: null, p3: null, p4: null } };
  state.p1PaddleH = PADDLE_H;
  state.p2PaddleH = PADDLE_H;
  state.p3PaddleW = HPADDLE_W;
  state.p4PaddleW = HPADDLE_W;
  frozenBallSpeed = 0;
  lastHitBy = 1;
  state.activePlayers = maxPlayers();
  nextPowerupSpawn = Date.now() + randomSpawnDelay();
  resetBall(1);
}

// ─── Power-Up Helpers ──────────────────────────────────────────────────────
function randomSpawnDelay() {
  return POWERUP_SPAWN_MIN + Math.random() * (POWERUP_SPAWN_MAX - POWERUP_SPAWN_MIN);
}

function spawnPowerup() {
  const margin = isMultiplayerMode() ? 80 : CANVAS_W * 0.2;
  let x, y;
  if (isMultiplayerMode()) {
    // Spawn in center area, avoiding paddle zones on all sides
    x = margin + Math.random() * (CANVAS_W - margin * 2);
    y = margin + Math.random() * (CANVAS_H - margin * 2);
  } else {
    x = CANVAS_W * 0.2 + Math.random() * (CANVAS_W * 0.6);
    y = 40 + Math.random() * (CANVAS_H - 80);
  }
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
    if (!state.activeEffects.freeze) {
      frozenBallSpeed = ballSpeed;
      const mult = FREEZE_SPEED_MULT;
      state.ball.vx *= mult;
      state.ball.vy *= mult;
      ballSpeed *= mult;
      for (let i = 0; i < state.extraBalls.length; i++) {
        state.extraBalls[i].vx *= mult;
        state.extraBalls[i].vy *= mult;
        extraBallSpeeds[i] *= mult;
      }
    }
    state.activeEffects.freeze = { until: now + FREEZE_DURATION };
  } else if (type === 'multiball') {
    for (let i = 0; i < 2; i++) {
      const angle = (Math.random() * 1.2 - 0.6);
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
    const key = 'p' + player;
    state.activeEffects.sizeboost[key] = { until: now + SIZEBOOST_DURATION };
    if (player <= 2) {
      // Vertical paddles (left/right)
      state[key + 'PaddleH'] = Math.round(PADDLE_H * SIZEBOOST_MULT);
    } else {
      // Horizontal paddles (top/bottom)
      state[key + 'PaddleW'] = Math.round(HPADDLE_W * SIZEBOOST_MULT);
    }
  }
}

function checkBallPowerupCollision(bx, by) {
  if (!state.powerup) return false;
  const pu = state.powerup;
  if (
    bx + BALL_SIZE >= pu.x &&
    bx <= pu.x + POWERUP_SIZE &&
    by + BALL_SIZE >= pu.y &&
    by <= pu.y + POWERUP_SIZE
  ) {
    activatePowerup(pu.type, lastHitBy);
    clearPowerup();
    return true;
  }
  return false;
}

function tickPowerups() {
  const now = Date.now();

  if (!state.powerup && now >= nextPowerupSpawn) {
    spawnPowerup();
  }

  if (state.powerup && now - state.powerup.spawnedAt >= POWERUP_DESPAWN_MS) {
    clearPowerup();
  }

  // Check main ball collision
  if (state.powerup) {
    checkBallPowerupCollision(state.ball.x, state.ball.y);
  }
  // Check extra ball collisions
  if (state.powerup) {
    for (const eb of state.extraBalls) {
      if (checkBallPowerupCollision(eb.x, eb.y)) break;
    }
  }

  // Expire freeze
  if (state.activeEffects.freeze && now >= state.activeEffects.freeze.until) {
    if (frozenBallSpeed > 0) {
      const restoreMult = frozenBallSpeed / ballSpeed;
      state.ball.vx *= restoreMult;
      state.ball.vy *= restoreMult;
      ballSpeed = frozenBallSpeed;
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

  // Expire sizeboost for all players
  for (let p = 1; p <= 4; p++) {
    const key = 'p' + p;
    if (state.activeEffects.sizeboost[key] && now >= state.activeEffects.sizeboost[key].until) {
      state.activeEffects.sizeboost[key] = null;
      if (p <= 2) {
        state[key + 'PaddleH'] = PADDLE_H;
        state['p' + p].y = Math.min(state['p' + p].y, CANVAS_H - PADDLE_H);
      } else {
        state[key + 'PaddleW'] = HPADDLE_W;
        state['p' + p].x = Math.min(state['p' + p].x, CANVAS_W - HPADDLE_W);
      }
    }
  }
}

// ─── AI Opponent ────────────────────────────────────────────────────────────
function predictBallY() {
  let bx = state.ball.x;
  let by = state.ball.y;
  let bvx = state.ball.vx;
  let bvy = state.ball.vy;

  if (bvx <= 0) return CANVAS_H / 2;

  const targetX = CANVAS_W - PADDLE_W - 10 - BALL_SIZE;
  const maxSteps = 600;

  for (let i = 0; i < maxSteps; i++) {
    bx += bvx;
    by += bvy;
    if (by <= 0) { by = 0; bvy *= -1; }
    if (by >= CANVAS_H - BALL_SIZE) { by = CANVAS_H - BALL_SIZE; bvy *= -1; }
    if (bx >= targetX) return by + BALL_SIZE / 2;
  }
  return CANVAS_H / 2;
}

function updateAI() {
  const diff = AI_DIFFICULTY[aiDifficulty];
  aiTickCounter++;

  if (aiTickCounter >= diff.updateInterval) {
    aiTickCounter = 0;

    if (state.ball.vx > 0 && state.ball.x < CANVAS_W * 0.3) {
      aiIntentionalMiss = Math.random() > diff.accuracy;
    }

    if (aiIntentionalMiss) {
      const wrongDir = Math.random() > 0.5 ? 1 : -1;
      aiTargetY = predictBallY() + wrongDir * (PADDLE_H * 1.5 + Math.random() * 80);
    } else {
      const jitter = (Math.random() - 0.5) * diff.jitter * 2;
      aiTargetY = predictBallY() + jitter;
    }
  }

  const aiPH = state.p2PaddleH;
  const paddleCenter = state.p2.y + aiPH / 2;
  const delta = aiTargetY - paddleCenter;
  const deadZone = 4;

  inputs.p2.up = false;
  inputs.p2.down = false;

  if (Math.abs(delta) > deadZone) {
    const moveSpeed = Math.min(PADDLE_SPEED, diff.reactionSpeed);
    if (delta < 0) {
      state.p2.y = Math.max(0, state.p2.y - moveSpeed);
    } else {
      state.p2.y = Math.min(CANVAS_H - aiPH, state.p2.y + moveSpeed);
    }
  }
}

// ─── Scoring Logic ──────────────────────────────────────────────────────────
function handleScore(scoringTeamOrPlayers, isMainBall) {
  if (gameMode === '2v2') {
    // scoringTeamOrPlayers is 'teamA' or 'teamB'
    const team = scoringTeamOrPlayers;
    if (team === 'teamA') {
      state.teamA++;
    } else {
      state.teamB++;
    }
    if (state.teamA >= WIN_SCORE) {
      state.winner = 'teamA';
      state.winnerLabel = 'Team A Wins!';
      return true;
    }
    if (state.teamB >= WIN_SCORE) {
      state.winner = 'teamB';
      state.winnerLabel = 'Team B Wins!';
      return true;
    }
  } else if (gameMode === 'ffa') {
    // scoringTeamOrPlayers is an array of player numbers
    for (const p of scoringTeamOrPlayers) {
      state['p' + p].score++;
      if (state['p' + p].score >= WIN_SCORE) {
        state.winner = p;
        state.winnerLabel = `Player ${p} Wins!`;
        return true;
      }
    }
  } else {
    // Classic 1p/2p — scoringTeamOrPlayers is array of one player
    for (const p of scoringTeamOrPlayers) {
      state['p' + p].score++;
      if (state['p' + p].score >= WIN_SCORE) {
        state.winner = p;
        if (gameMode === '1p') {
          state.winnerLabel = p === 1 ? 'You win!' : 'AI wins!';
        } else {
          state.winnerLabel = `Player ${p} wins!`;
        }
        return true;
      }
    }
  }
  return false;
}

// ─── 4-Player Paddle Collision Helpers ──────────────────────────────────────
// P1: left wall, P2: right wall, P3: top wall, P4: bottom wall
const WALL_OFFSET = 10; // Gap from edge to paddle

function checkP1Collision(bx, by, bvx, bvy, speed) {
  const p1H = state.p1PaddleH;
  if (
    bx <= PADDLE_W + WALL_OFFSET &&
    bx >= WALL_OFFSET &&
    by + BALL_SIZE >= state.p1.y &&
    by <= state.p1.y + p1H
  ) {
    speed += SPEED_INCREMENT;
    const hitPos = ((by + BALL_SIZE / 2) - state.p1.y) / p1H;
    const angle = (hitPos - 0.5) * 1.2;
    return {
      hit: true, speed,
      vx: speed * Math.cos(angle),
      vy: speed * Math.sin(angle),
      nx: PADDLE_W + WALL_OFFSET + 1,
      lastHit: 1,
    };
  }
  return { hit: false };
}

function checkP2Collision(bx, by, bvx, bvy, speed) {
  const p2H = state.p2PaddleH;
  if (
    bx + BALL_SIZE >= CANVAS_W - PADDLE_W - WALL_OFFSET &&
    bx + BALL_SIZE <= CANVAS_W - WALL_OFFSET &&
    by + BALL_SIZE >= state.p2.y &&
    by <= state.p2.y + p2H
  ) {
    speed += SPEED_INCREMENT;
    const hitPos = ((by + BALL_SIZE / 2) - state.p2.y) / p2H;
    const angle = (hitPos - 0.5) * 1.2;
    return {
      hit: true, speed,
      vx: -speed * Math.cos(angle),
      vy: speed * Math.sin(angle),
      nx: CANVAS_W - PADDLE_W - WALL_OFFSET - BALL_SIZE - 1,
      lastHit: 2,
    };
  }
  return { hit: false };
}

function checkP3Collision(bx, by, bvx, bvy, speed) {
  const p3W = state.p3PaddleW;
  if (
    by <= HPADDLE_H + WALL_OFFSET &&
    by >= WALL_OFFSET &&
    bx + BALL_SIZE >= state.p3.x &&
    bx <= state.p3.x + p3W
  ) {
    speed += SPEED_INCREMENT;
    const hitPos = ((bx + BALL_SIZE / 2) - state.p3.x) / p3W;
    const angle = (hitPos - 0.5) * 1.2;
    return {
      hit: true, speed,
      vx: speed * Math.sin(angle),
      vy: speed * Math.cos(angle),
      ny: HPADDLE_H + WALL_OFFSET + 1,
      lastHit: 3,
    };
  }
  return { hit: false };
}

function checkP4Collision(bx, by, bvx, bvy, speed) {
  const p4W = state.p4PaddleW;
  if (
    by + BALL_SIZE >= CANVAS_H - HPADDLE_H - WALL_OFFSET &&
    by + BALL_SIZE <= CANVAS_H - WALL_OFFSET &&
    bx + BALL_SIZE >= state.p4.x &&
    bx <= state.p4.x + p4W
  ) {
    speed += SPEED_INCREMENT;
    const hitPos = ((bx + BALL_SIZE / 2) - state.p4.x) / p4W;
    const angle = (hitPos - 0.5) * 1.2;
    return {
      hit: true, speed,
      vx: speed * Math.sin(angle),
      vy: -speed * Math.cos(angle),
      ny: CANVAS_H - HPADDLE_H - WALL_OFFSET - BALL_SIZE - 1,
      lastHit: 4,
    };
  }
  return { hit: false };
}

// ─── Ball Processing (shared for main + extra balls) ────────────────────────
function processBallPhysics(ball, speed, isMainBall) {
  // Move ball
  ball.x += ball.vx;
  ball.y += ball.vy;

  let newSpeed = speed;
  let scored = false;
  let gameOver = false;

  if (isMultiplayerMode()) {
    // 4-player mode: paddles on all 4 walls
    // Check paddle collisions
    let res;

    res = checkP1Collision(ball.x, ball.y, ball.vx, ball.vy, newSpeed);
    if (res.hit) {
      newSpeed = res.speed; ball.vx = res.vx; ball.vy = res.vy; ball.x = res.nx; lastHitBy = res.lastHit;
    }

    res = checkP2Collision(ball.x, ball.y, ball.vx, ball.vy, newSpeed);
    if (res.hit) {
      newSpeed = res.speed; ball.vx = res.vx; ball.vy = res.vy; ball.x = res.nx; lastHitBy = res.lastHit;
    }

    res = checkP3Collision(ball.x, ball.y, ball.vx, ball.vy, newSpeed);
    if (res.hit) {
      newSpeed = res.speed; ball.vx = res.vx; ball.vy = res.vy; ball.y = res.ny; lastHitBy = res.lastHit;
    }

    res = checkP4Collision(ball.x, ball.y, ball.vx, ball.vy, newSpeed);
    if (res.hit) {
      newSpeed = res.speed; ball.vx = res.vx; ball.vy = res.vy; ball.y = res.ny; lastHitBy = res.lastHit;
    }

    // Scoring: ball exits any edge = point for opponents
    // Left exit (P1's goal) — Team A loses, Team B scores
    if (ball.x < 0) {
      scored = true;
      if (gameMode === '2v2') {
        gameOver = handleScore('teamB', isMainBall);
      } else {
        // FFA: everyone except P1 scores
        gameOver = handleScore([2, 3, 4], isMainBall);
      }
    }
    // Right exit (P2's goal) — Team B loses, Team A scores
    if (!scored && ball.x > CANVAS_W) {
      scored = true;
      if (gameMode === '2v2') {
        gameOver = handleScore('teamA', isMainBall);
      } else {
        gameOver = handleScore([1, 3, 4], isMainBall);
      }
    }
    // Top exit (P3's goal) — Team A loses, Team B scores
    if (!scored && ball.y < 0) {
      scored = true;
      if (gameMode === '2v2') {
        gameOver = handleScore('teamB', isMainBall);
      } else {
        gameOver = handleScore([1, 2, 4], isMainBall);
      }
    }
    // Bottom exit (P4's goal) — Team B loses, Team A scores
    if (!scored && ball.y > CANVAS_H) {
      scored = true;
      if (gameMode === '2v2') {
        gameOver = handleScore('teamA', isMainBall);
      } else {
        gameOver = handleScore([1, 2, 3], isMainBall);
      }
    }
  } else {
    // Classic 2-player mode: walls top/bottom, paddles left/right
    // Top/bottom wall bounce
    if (ball.y <= 0) { ball.y = 0; ball.vy *= -1; }
    if (ball.y >= CANVAS_H - BALL_SIZE) { ball.y = CANVAS_H - BALL_SIZE; ball.vy *= -1; }

    // P1 collision
    const res1 = checkP1Collision(ball.x, ball.y, ball.vx, ball.vy, newSpeed);
    if (res1.hit) {
      newSpeed = res1.speed; ball.vx = res1.vx; ball.vy = res1.vy; ball.x = res1.nx; lastHitBy = 1;
    }

    // P2 collision
    const res2 = checkP2Collision(ball.x, ball.y, ball.vx, ball.vy, newSpeed);
    if (res2.hit) {
      newSpeed = res2.speed; ball.vx = res2.vx; ball.vy = res2.vy; ball.x = res2.nx; lastHitBy = 2;
    }

    // Score
    if (ball.x < 0) {
      scored = true;
      gameOver = handleScore([2], isMainBall);
    }
    if (!scored && ball.x > CANVAS_W) {
      scored = true;
      gameOver = handleScore([1], isMainBall);
    }
  }

  if (scored && isMainBall && !gameOver) {
    pauseUntil = Date.now() + PAUSE_AFTER_SCORE_MS;
    resetBall(lastHitBy);
    newSpeed = ballSpeed; // resetBall resets ballSpeed
  }

  return { speed: newSpeed, scored, gameOver };
}

// ─── Physics ─────────────────────────────────────────────────────────────────
function tick() {
  const now = Date.now();

  if (!gameStarted) return;
  if (state.winner) return;
  if (now < pauseUntil) { state.paused = true; return; }
  state.paused = false;

  // Run AI (only in 1p mode)
  if (gameMode === '1p') {
    updateAI();
  }

  // Move P1 paddle (left — vertical)
  if (inputs.p1.up) state.p1.y = Math.max(0, state.p1.y - PADDLE_SPEED);
  if (inputs.p1.down) state.p1.y = Math.min(CANVAS_H - state.p1PaddleH, state.p1.y + PADDLE_SPEED);

  // Move P2 paddle (right — vertical)
  if (inputs.p2.up) state.p2.y = Math.max(0, state.p2.y - PADDLE_SPEED);
  if (inputs.p2.down) state.p2.y = Math.min(CANVAS_H - state.p2PaddleH, state.p2.y + PADDLE_SPEED);

  // Move P3 paddle (top — horizontal, only in 4-player modes)
  if (isMultiplayerMode()) {
    if (inputs.p3.left) state.p3.x = Math.max(0, state.p3.x - PADDLE_SPEED);
    if (inputs.p3.right) state.p3.x = Math.min(CANVAS_W - state.p3PaddleW, state.p3.x + PADDLE_SPEED);

    // Move P4 paddle (bottom — horizontal)
    if (inputs.p4.left) state.p4.x = Math.max(0, state.p4.x - PADDLE_SPEED);
    if (inputs.p4.right) state.p4.x = Math.min(CANVAS_W - state.p4PaddleW, state.p4.x + PADDLE_SPEED);
  }

  // Main ball physics
  const mainResult = processBallPhysics(state.ball, ballSpeed, true);
  ballSpeed = mainResult.speed;
  if (mainResult.gameOver) return;

  // Extra balls physics
  for (let i = state.extraBalls.length - 1; i >= 0; i--) {
    const eb = state.extraBalls[i];
    const ebResult = processBallPhysics(eb, extraBallSpeeds[i], false);
    extraBallSpeeds[i] = ebResult.speed;
    if (ebResult.gameOver) return;
    if (ebResult.scored) {
      state.extraBalls.splice(i, 1);
      extraBallSpeeds.splice(i, 1);
    }
  }

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
  const maxSlots = maxPlayers();
  let role;
  if (nextSlot <= maxSlots) {
    role = nextSlot;
    nextSlot++;
    // Skip to next available slot
    while (nextSlot <= maxSlots && Array.from(players.values()).includes(nextSlot)) {
      nextSlot++;
    }
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
        gameMode = data.setMode;
        if (!['1p', '2p', '2v2', 'ffa'].includes(gameMode)) gameMode = '2p';
        aiDifficulty = data.aiDifficulty || 'medium';
        if (!AI_DIFFICULTY[aiDifficulty]) aiDifficulty = 'medium';
        state.gameMode = gameMode;
        state.aiDifficulty = aiDifficulty;

        // Reassign slots based on new mode
        const newMax = maxPlayers();
        // Upgrade spectators to players if slots opened
        for (const [client, clientRole] of players.entries()) {
          if (clientRole === 'spectator' && nextSlot <= newMax) {
            players.set(client, nextSlot);
            client.send(JSON.stringify({
              type: 'assign', role: nextSlot,
              canvas: { w: CANVAS_W, h: CANVAS_H },
              gameMode, aiDifficulty, gameStarted,
            }));
            console.log(`Spectator promoted to P${nextSlot}`);
            nextSlot++;
          }
        }
      }

      // Start game
      if (data.startGame && r === 1 && !gameStarted) {
        gameStarted = true;
        state.gameStarted = true;
        resetGame();
      }

      // Normal input — P1 and P2 use up/down, P3 and P4 use left/right
      // _asPlayer allows P1 client to proxy inputs for local multiplayer
      const inputTarget = (r === 1 && data._asPlayer) ? data._asPlayer : r;

      if (inputTarget === 1) {
        inputs.p1.up = !!data.up;
        inputs.p1.down = !!data.down;
      }
      if (inputTarget === 2 && gameMode !== '1p') {
        inputs.p2.up = !!data.up;
        inputs.p2.down = !!data.down;
      }
      if (inputTarget === 3 && isMultiplayerMode()) {
        inputs.p3.left = !!data.left;
        inputs.p3.right = !!data.right;
      }
      if (inputTarget === 4 && isMultiplayerMode()) {
        inputs.p4.left = !!data.left;
        inputs.p4.right = !!data.right;
      }

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
    if (typeof r === 'number') {
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

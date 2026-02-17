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

// ─── Game State ──────────────────────────────────────────────────────────────
let state = {
  ball: { x: CANVAS_W / 2, y: CANVAS_H / 2, vx: INITIAL_BALL_SPEED, vy: 0 },
  p1: { y: CANVAS_H / 2 - PADDLE_H / 2, score: 0 },
  p2: { y: CANVAS_H / 2 - PADDLE_H / 2, score: 0 },
  paused: false,
  winner: null,
};

let pauseUntil = 0;
let ballSpeed = INITIAL_BALL_SPEED;

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
  resetBall(1);
}

// ─── Physics ─────────────────────────────────────────────────────────────────
function tick() {
  const now = Date.now();

  if (state.winner) return;
  if (now < pauseUntil) { state.paused = true; return; }
  state.paused = false;

  // Move paddles
  if (inputs.p1.up) state.p1.y = Math.max(0, state.p1.y - PADDLE_SPEED);
  if (inputs.p1.down) state.p1.y = Math.min(CANVAS_H - PADDLE_H, state.p1.y + PADDLE_SPEED);
  if (inputs.p2.up) state.p2.y = Math.max(0, state.p2.y - PADDLE_SPEED);
  if (inputs.p2.down) state.p2.y = Math.min(CANVAS_H - PADDLE_H, state.p2.y + PADDLE_SPEED);

  // Move ball
  state.ball.x += state.ball.vx;
  state.ball.y += state.ball.vy;

  // Top/bottom wall bounce
  if (state.ball.y <= 0) { state.ball.y = 0; state.ball.vy *= -1; }
  if (state.ball.y >= CANVAS_H - BALL_SIZE) { state.ball.y = CANVAS_H - BALL_SIZE; state.ball.vy *= -1; }

  // Paddle 1 collision (left)
  if (
    state.ball.x <= PADDLE_W + 10 &&
    state.ball.x >= 10 &&
    state.ball.y + BALL_SIZE >= state.p1.y &&
    state.ball.y <= state.p1.y + PADDLE_H
  ) {
    ballSpeed += SPEED_INCREMENT;
    const hitPos = ((state.ball.y + BALL_SIZE / 2) - state.p1.y) / PADDLE_H; // 0..1
    const angle = (hitPos - 0.5) * 1.2; // -0.6 to 0.6 radians
    state.ball.vx = ballSpeed * Math.cos(angle);
    state.ball.vy = ballSpeed * Math.sin(angle);
    state.ball.x = PADDLE_W + 11;
  }

  // Paddle 2 collision (right)
  if (
    state.ball.x + BALL_SIZE >= CANVAS_W - PADDLE_W - 10 &&
    state.ball.x + BALL_SIZE <= CANVAS_W - 10 &&
    state.ball.y + BALL_SIZE >= state.p2.y &&
    state.ball.y <= state.p2.y + PADDLE_H
  ) {
    ballSpeed += SPEED_INCREMENT;
    const hitPos = ((state.ball.y + BALL_SIZE / 2) - state.p2.y) / PADDLE_H;
    const angle = (hitPos - 0.5) * 1.2;
    state.ball.vx = -ballSpeed * Math.cos(angle);
    state.ball.vy = ballSpeed * Math.sin(angle);
    state.ball.x = CANVAS_W - PADDLE_W - 10 - BALL_SIZE - 1;
  }

  // Score
  if (state.ball.x < 0) {
    state.p2.score++;
    if (state.p2.score >= WIN_SCORE) { state.winner = 2; return; }
    pauseUntil = now + PAUSE_AFTER_SCORE_MS;
    resetBall(2); // serve toward scorer
  }
  if (state.ball.x > CANVAS_W) {
    state.p1.score++;
    if (state.p1.score >= WIN_SCORE) { state.winner = 1; return; }
    pauseUntil = now + PAUSE_AFTER_SCORE_MS;
    resetBall(1);
  }
}

// ─── Broadcast ───────────────────────────────────────────────────────────────
function broadcast() {
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
  ws.send(JSON.stringify({ type: 'assign', role, canvas: { w: CANVAS_W, h: CANVAS_H } }));
  console.log(`Player connected as ${role === 'spectator' ? 'spectator' : 'P' + role}`);

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);
      const r = players.get(ws);
      if (r === 1) { inputs.p1.up = !!data.up; inputs.p1.down = !!data.down; }
      if (r === 2) { inputs.p2.up = !!data.up; inputs.p2.down = !!data.down; }
      if (data.restart && state.winner) resetGame();
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

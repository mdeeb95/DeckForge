import type { Category, PredictionResponse, Suggestion, Modifier, WildCard } from '../prediction/types';

// ─── Pong-Specific Mock Suggestions ──────────────────────────────────────────
// Used when isDemoMode is true. Matches PredictionResponse shape exactly.

function getFeatureSuggestions(): PredictionResponse {
  const suggestions: Suggestion[] = [
    {
      label: 'Add Power-Ups',
      quip: 'because regular pong is too balanced',
      scope: 'decent chunk',
      rationale: 'Spawn random power-ups (speed boost, big paddle, multi-ball) that drop from the center line.',
    },
    {
      label: 'Add Particle Effects on Ball Hit',
      quip: 'sparks fly when things collide',
      scope: 'quick tweak',
      rationale: 'Canvas particle burst on paddle/wall collision. Pure visual juice, zero gameplay impact.',
    },
    {
      label: 'Add AI Opponent',
      quip: 'lonely players need love too',
      scope: 'decent chunk',
      rationale: 'Server-side AI paddle that tracks ball position with configurable difficulty (reaction delay, prediction error).',
    },
    {
      label: 'Add Lobby with Room Codes',
      quip: 'invite your nemesis by code',
      scope: 'strap in',
      rationale: 'Room-based matchmaking with 4-character codes. Multiple simultaneous games on one server.',
    },
    {
      label: 'Add Screen Shake on Score',
      quip: 'feel the impact in your bones',
      scope: 'quick tweak',
      rationale: 'Brief CSS/canvas transform shake when a point is scored. Adds game feel instantly.',
    },
    {
      label: 'Add Ball Trail',
      quip: 'speed lines make everything cooler',
      scope: 'quick tweak',
      rationale: 'Fading trail behind the ball using previous positions. Simple array ring buffer.',
    },
    {
      label: 'Add Match History',
      quip: 'receipts for your victories',
      scope: 'decent chunk',
      rationale: 'Store match results in a JSON file. Show win/loss record on the client.',
    },
    {
      label: 'Add Spectator Chat',
      quip: 'let the peanut gallery weigh in',
      scope: 'decent chunk',
      rationale: 'WebSocket-based text chat for spectators. Messages overlay on the game canvas.',
    },
  ];

  const modifier: Modifier = { lens: 'competitive', quip: 'make it an esport' };
  const wild_card: WildCard = {
    label: 'Add Twitch Integration',
    quip: 'chat controls the right paddle',
    scope: 'strap in',
    rationale: 'Connect to Twitch IRC. Chat votes on paddle direction each frame. Chaos guaranteed.',
  };

  return { header_quip: 'pong is just the beginning', suggestions, modifier, wild_card };
}

function getBugSuggestions(): PredictionResponse {
  const suggestions: Suggestion[] = [
    {
      label: 'Ball Clips Through Paddle Edge',
      quip: 'physics is hard, especially fake physics',
      scope: 'quick tweak',
      rationale: 'At high speeds the ball can skip past the paddle collision zone in a single tick.',
      symptom: 'Ball passes through the paddle corner at steep angles.',
    },
    {
      label: 'WebSocket Desync on Tab Switch',
      quip: 'background tabs live in a different timeline',
      scope: 'decent chunk',
      rationale: 'Browser throttles timers in background tabs, causing state drift.',
      symptom: 'Switching tabs and back shows ball in wrong position for a moment.',
    },
    {
      label: 'Paddle Jitters at Wall Boundary',
      quip: 'the paddle is having a seizure',
      scope: 'quick tweak',
      rationale: 'Holding up at top or down at bottom causes rapid clamping oscillation.',
      symptom: 'Paddle visually vibrates when held against the wall.',
    },
    {
      label: 'Score Increments Twice on Fast Ball',
      quip: 'double the points, double the confusion',
      scope: 'quick tweak',
      rationale: 'Ball x-position can be negative for multiple ticks before reset.',
      symptom: 'Occasionally scores jump by 2 instead of 1.',
    },
    {
      label: 'Spectator Sees Stale State on Join',
      quip: 'late to the party, confused by the scene',
      scope: 'quick tweak',
      rationale: 'New spectator connections get no initial state until next tick.',
      symptom: 'Blank canvas for up to 16ms after connecting.',
    },
    {
      label: 'Reconnect Assigns Wrong Player Slot',
      quip: 'identity crisis after a disconnect',
      scope: 'decent chunk',
      rationale: 'Player slot recycling logic has a race condition on rapid reconnect.',
      symptom: 'P1 disconnects and reconnects as P2, leaving P1 slot empty.',
    },
    {
      label: 'Touch Input Stuck After Swipe',
      quip: 'phantom fingers haunt the paddle',
      scope: 'quick tweak',
      rationale: 'touchend handler doesn\'t clear all inputs when multi-touch is released.',
      symptom: 'Paddle keeps moving up after lifting finger on touch devices.',
    },
    {
      label: 'Ball Angle Gets Stuck Horizontal',
      quip: 'infinite rally simulator 2024',
      scope: 'quick tweak',
      rationale: 'Hit position exactly at paddle center produces vy=0, ball goes perfectly horizontal forever.',
      symptom: 'Ball bounces horizontally between paddles with no vertical movement.',
    },
  ];

  const modifier: Modifier = { lens: 'edge cases', quip: 'what happens at 144fps?' };
  const wild_card: WildCard = {
    label: 'Port Conflict on Restart',
    quip: 'EADDRINUSE: the eternal nemesis',
    scope: 'quick tweak',
    rationale: 'Server doesn\'t gracefully release port 3000 on crash, blocking restart.',
    symptom: 'Error: listen EADDRINUSE :::3000 after killing server with Ctrl+C.',
  };

  return { header_quip: 'bugs in pong — simpler game, sneakier bugs', suggestions, modifier, wild_card };
}

function getTechDebtSuggestions(): PredictionResponse {
  const suggestions: Suggestion[] = [
    {
      label: 'Add Unit Tests for Physics',
      quip: 'your collision math deserves a proof',
      scope: 'decent chunk',
      rationale: 'Zero test coverage on tick(). Collision edge cases are regression-prone.',
      evidence: 'No test files or test runner configured.',
    },
    {
      label: 'Extract Game Constants to Config',
      quip: 'magic numbers are not magical',
      scope: 'quick tweak',
      rationale: 'PADDLE_SPEED, BALL_SIZE, WIN_SCORE etc. are hardcoded. Extract to a shared config.',
      evidence: '15+ numeric constants scattered across server.js.',
    },
    {
      label: 'Add Graceful Shutdown Handler',
      quip: 'teach your server to say goodbye',
      scope: 'quick tweak',
      rationale: 'No SIGTERM/SIGINT handler. Connections drop without close frames.',
      evidence: 'process.on(\'SIGINT\') not present in server.js.',
    },
    {
      label: 'Split Server into Modules',
      quip: 'one file to rule them all is fine until it isn\'t',
      scope: 'decent chunk',
      rationale: 'server.js handles HTTP, WebSocket, physics, and state. Separate concerns.',
      evidence: 'server.js exceeds 120 lines with mixed responsibilities.',
    },
    {
      label: 'Add TypeScript',
      quip: 'any is not a game state',
      scope: 'decent chunk',
      rationale: 'Plain JS with no type safety. State shape is implicit.',
      evidence: 'No tsconfig.json or .ts files in project.',
    },
    {
      label: 'Add ESLint + Prettier',
      quip: 'consistency is a feature',
      scope: 'quick tweak',
      rationale: 'No linter or formatter configured.',
      evidence: 'No .eslintrc or .prettierrc found.',
    },
    {
      label: 'Add Error Handling for WebSocket Messages',
      quip: 'trust nothing from the wire',
      scope: 'quick tweak',
      rationale: 'JSON.parse in message handler uses empty catch. Malformed input is silently ignored.',
      evidence: 'catch {} in ws.on(\'message\') handler.',
    },
    {
      label: 'Add Health Check Endpoint',
      quip: 'is it alive? ask /health',
      scope: 'quick tweak',
      rationale: 'No health/readiness endpoint for monitoring.',
      evidence: 'Only GET / route defined.',
    },
  ];

  const modifier: Modifier = { lens: 'production ready', quip: 'ship it like you mean it' };
  const wild_card: WildCard = {
    label: 'Dockerize the Whole Thing',
    quip: 'it works in my container',
    scope: 'decent chunk',
    rationale: 'Dockerfile + docker-compose for one-command deployment. Overkill? Slightly. Cool? Very.',
  };

  return { header_quip: 'pong is simple — your codebase should be too', suggestions, modifier, wild_card };
}

function getYoloSuggestions(): PredictionResponse {
  const suggestions: Suggestion[] = [
    {
      label: 'Add Gravity Mode',
      quip: 'newton enters the arena',
      scope: 'decent chunk',
      rationale: 'Ball affected by gravity. Paddles become platforms. Pong meets Breakout.',
    },
    {
      label: 'Ball Splits into 3 on Score',
      quip: 'multiball madness',
      scope: 'decent chunk',
      rationale: 'After each point the ball fragments into 3. Only the "real" one scores. Good luck.',
    },
    {
      label: 'Add AI Commentary',
      quip: 'shoutcasting by a language model',
      scope: 'strap in',
      rationale: 'Feed game events to Claude API. Get live play-by-play commentary. Incredibly unnecessary.',
    },
    {
      label: 'Invisible Ball Mode',
      quip: 'the ball is there, trust me',
      scope: 'quick tweak',
      rationale: 'Ball only visible within 50px of each paddle. Pure memory and prediction.',
    },
    {
      label: 'Add Portals on the Walls',
      quip: 'now you\'re thinking with portals',
      scope: 'decent chunk',
      rationale: 'Random portal pairs on top/bottom walls. Ball enters one, exits the other.',
    },
    {
      label: 'Drunk Mode — Controls Reverse Randomly',
      quip: 'up is down, down is maybe also down',
      scope: 'quick tweak',
      rationale: 'Every 5 seconds, 50% chance controls invert for one player. Chaos.',
    },
    {
      label: 'Add a Third Paddle in the Middle',
      quip: 'the plot thickens',
      scope: 'decent chunk',
      rationale: 'Rotating paddle in center that deflects the ball. No one controls it. Everyone suffers.',
    },
    {
      label: 'Ball Gets Bigger Every Hit',
      quip: 'it\'s growing... it\'s always growing',
      scope: 'quick tweak',
      rationale: 'Ball size increases by 2px per hit. Eventually it\'s larger than the paddles.',
    },
  ];

  const modifier: Modifier = { lens: 'maximum chaos', quip: 'break everything, laugh about it' };
  const wild_card: WildCard = {
    label: 'Replace Ball with a Cat GIF',
    quip: 'the internet demands it',
    scope: 'quick tweak',
    rationale: 'Swap the ball sprite for a spinning cat. It adds nothing. It changes everything.',
  };

  return { header_quip: 'pong but make it unhinged', suggestions, modifier, wild_card };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function pongMockPredictSuggestions(category: Category): Promise<PredictionResponse> {
  // Simulate network delay to match mock behavior
  await new Promise(r => setTimeout(r, 300 + Math.random() * 400));

  switch (category) {
    case 'feature': return getFeatureSuggestions();
    case 'bug': return getBugSuggestions();
    case 'tech_debt': return getTechDebtSuggestions();
    case 'yolo': return getYoloSuggestions();
    default: return getFeatureSuggestions();
  }
}

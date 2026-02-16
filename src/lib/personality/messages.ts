// ─── Quirky Messages — brand voice for DeckForge ─────────────────────────────
// ALL pre-written by humans, not generated on the fly. This is brand voice.

export type MessageCategory =
  | 'splash'
  | 'loading'
  | 'empty_state'
  | 'error'
  | 'something_else'
  | 'ai_working'
  | 'success'
  | 'boot';

// ─── Message pools ──────────────────────────────────────────────────────────

const SPLASH: string[] = [
  'Welcome back, creative director.',
  'The couch is your command center.',
  'Gamepad in hand, code in motion.',
  'No keyboard required. Seriously.',
  'Your thumbs are about to build something cool.',
  'Steam Deck: now also a dev tool.',
  'Claude is warmed up and ready to go.',
  'Let\'s ship something ridiculous today.',
  'Buttons pressed. Features shipped.',
  'The only IDE that fits in your hands.',
  'Pro tip: the best code is the code you didn\'t type.',
  'Your project missed you.',
  'Loading opinions... done.',
  'Another day, another feature.',
  'Time to make something that doesn\'t exist yet.',
  'DeckForge: because keyboards are for emails.',
  'Your code is exactly where you left it.',
  'Inspiration loading... just kidding, that\'s your job.',
  'Ready to build. No typing necessary.',
  'The AI works, you decide. That\'s the deal.',
  'Pick a direction. We\'ll handle the rest.',
  'Couch mode: activated.',
  'Let\'s turn button presses into pull requests.',
];

const LOADING: string[] = [
  'Canoodling with your code...',
  'Teaching electrons to dance...',
  'Convincing the AI to be reasonable...',
  'Rearranging ones and zeros...',
  'Asking Claude nicely...',
  'Herding digital cats...',
  'Consulting the algorithm oracle...',
  'Doing the thing you asked for...',
  'Making computers earn their electricity...',
  'Turning caffeine into code...',
  'Negotiating with the compiler...',
  'Juggling abstract syntax trees...',
  'Bribing the build system...',
  'Politely asking the CPU...',
  'Downloading more RAM... just kidding.',
  'Making sense of your project...',
  'Staring at your code so you don\'t have to...',
  'Crunching the numbers (there are many)...',
  'Running calculations at couch speed...',
  'Parsing your intentions...',
  'Building castles in the cloud...',
  'Converting button presses to features...',
  'Generating suggestions that don\'t suck...',
  'Trying very hard not to break anything...',
  'Muttering about indentation...',
  'Refactoring the fabric of space-time...',
  'Overthinking your code in the best way...',
  'Summoning the code gods...',
  'Almost there (we think)...',
  'Your patience is appreciated (and required)...',
  'Deploying tiny robots to type for you...',
  'Calculating optimal button sequences...',
];

const EMPTY_STATE: string[] = [
  'Nothing here yet. That\'s about to change.',
  'A blank canvas. The best kind.',
  'No projects? Let\'s fix that.',
  'This emptiness is full of potential.',
  'Your project list is as clean as your git history.',
  'Zero projects. Infinite possibilities.',
  'The void stares back. Press A to fill it.',
  'Nothing to see here... yet.',
  'Fresh start. No legacy code. No regrets.',
  'Empty state? More like ready state.',
  'A journey of a thousand commits starts with a single button press.',
  'Your future project is out there, waiting.',
];

const ERROR: string[] = [
  'Well, that didn\'t work. But we\'re not quitters.',
  'Something broke. It wasn\'t you. Probably.',
  'Error: success not found. Retrying...',
  'The code gremlins struck again.',
  'That was... unexpected. Let\'s try something else.',
  'Oops. The AI tripped over a semicolon.',
  'Houston, we have a problem. But it\'s fixable.',
  'Things went sideways. We can fix sideways.',
  'Error encountered. Dignity intact.',
  'This is fine. Everything is fine.',
  'The compiler disagrees with your life choices.',
  'Looks like the code had other plans.',
];

const SOMETHING_ELSE: string[] = [
  'None of these? Really?',
  'Fine, what do YOU want?',
  'Going off-script, are we?',
  'Sometimes the best option isn\'t listed.',
  'Feeling creative? Say more.',
  'The road less traveled. Bold choice.',
  'Alright, surprise us.',
  'You know what you want. We respect that.',
  'Breaking free from suggestions. Nice.',
  'Custom request incoming...',
];

const AI_WORKING: string[] = [
  'Claude is in the zone...',
  'The AI is doing its thing...',
  'Code is being written at machine speed...',
  'Your thumbs can rest for a moment...',
  'Sit back. The hard part is automated.',
  'Files are being edited as we speak...',
  'The cursor is moving on its own...',
  'Your project is evolving...',
  'Don\'t worry, Claude knows what it\'s doing. Mostly.',
  'Implementation in progress. No keyboard required.',
  'Claude is writing code so you don\'t have to...',
  'AI-powered development happening right now...',
  'Building the thing you described...',
  'Turning your plan into reality...',
  'The machines work. You supervise.',
];

const SUCCESS: string[] = [
  'Nailed it.',
  'Clean execution.',
  'Another one shipped.',
  'That worked. Obviously.',
  'Done and done.',
  'Feature: deployed. You: impressed.',
  'Task complete. The couch remains undefeated.',
  'Shipped from the comfort of your couch.',
  'Your project just got better.',
  'That\'s a wrap.',
  'Smooth as butter.',
  'Victory achieved. No keyboard was harmed.',
];

const BOOT: string[] = [
  'Systems online. Initializing awesomeness...',
  'Booting DeckForge. Please keep hands on controller...',
  'Starting up. Keyboard not detected. Perfect.',
  'DeckForge is loading. Your code is safe.',
  'Initializing creative destruction engine...',
  'Calibrating gamepad-to-code translator...',
  'Warming up the suggestion engine...',
  'Loading project context from the metaverse... just kidding, from disk.',
  'Ready in 3... 2... 1... actually ready now.',
  'All systems nominal. Let\'s build something.',
];

// ─── Message pools map ──────────────────────────────────────────────────────

const POOLS: Record<MessageCategory, string[]> = {
  splash: SPLASH,
  loading: LOADING,
  empty_state: EMPTY_STATE,
  error: ERROR,
  something_else: SOMETHING_ELSE,
  ai_working: AI_WORKING,
  success: SUCCESS,
  boot: BOOT,
};

// ─── No-repeat logic ────────────────────────────────────────────────────────

const recentlyUsed: Map<MessageCategory, Set<number>> = new Map();

/**
 * Get a random message from a category, avoiding repeats until
 * the pool is exhausted (then resets).
 */
export function getRandomMessage(category: MessageCategory): string {
  const pool = POOLS[category];
  if (!pool || pool.length === 0) return '';

  let used = recentlyUsed.get(category);
  if (!used) {
    used = new Set();
    recentlyUsed.set(category, used);
  }

  // Reset if all used
  if (used.size >= pool.length) {
    used.clear();
  }

  // Pick a random unused index
  let idx: number;
  do {
    idx = Math.floor(Math.random() * pool.length);
  } while (used.has(idx));

  used.add(idx);
  return pool[idx];
}

/**
 * Get multiple unique messages from a category.
 */
export function getRandomMessages(category: MessageCategory, count: number): string[] {
  const results: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count && i < POOLS[category].length; i++) {
    let msg: string;
    do {
      msg = getRandomMessage(category);
    } while (seen.has(msg) && seen.size < POOLS[category].length);
    seen.add(msg);
    results.push(msg);
  }
  return results;
}

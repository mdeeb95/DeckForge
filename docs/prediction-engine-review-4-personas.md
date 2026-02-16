# DeckForge Prediction Engine — Peer Review Panel

Four engineers. Four very different brains. One document to tear apart.

---

## REVIEWER 1: Mika — Senior Backend Engineer, 14 years experience
**Background:** Spent 8 years at AWS building distributed systems. Now tech lead at a mid-stage fintech startup. Writes Go and Rust exclusively. Thinks JavaScript was a mistake. Has strong opinions about API design and will die on the hill of contract-first development. Runs Arch btw. Hasn't played a video game since Quake III Arena.

### Overall Assessment: 6.5/10 — "Solid scaffolding. Alarming gaps."

The architecture overview is clean and the dual-system separation makes sense. But I have serious concerns about the contract layer and operational reliability.

### Critique

**The Context Assembler is underspecified and that should worry you.**

Section 2.2 claims `detected_features` is "parsed from git commit messages (keyword extraction, no LLM)" at ~10ms. I need to know *how*. Keyword extraction from commit messages is a real NLP problem. What happens when someone writes `"fix stuff"` or `"wip"` as their commit message? (Everyone does this.) The entire prediction engine depends on `detected_features` being accurate, but the doc hand-waves the hardest part of building it.

Same problem with `detected_gaps`. "Rule-based heuristics: no test files?" — okay, but what constitutes a test file? `*.test.js`? `test_*.py`? `spec/`? `__tests__/`? What about a Godot project? A Love2D game? The requirements doc explicitly says "app-type agnostic" but the gap detection heuristics are clearly designed for web projects. This will produce garbage suggestions for anything that isn't a React app.

**Your response validation is a joke.** (Section 4.1)

You have `"option_y exists and is meaningfully different from A/B (the 'ridiculous' check)"` — how do you programmatically determine if Y is "meaningfully different"? Semantic similarity scoring? Cosine distance? Keyword overlap check? Or are you just checking that the string is different? Because the LLM will absolutely return Y options that are just slightly reworded versions of A, especially on fast models. This needs a concrete algorithm, not a vibes-based checkbox.

**The response time targets are fiction.**

Section 4.3 claims `<800ms` target for Level 2 suggestions. With a fast model, you're looking at: ~120ms context assembly + ~50ms prompt template construction + ~300-500ms API round-trip (including cold start, tokenization, generation, parsing) + ~20ms validation = 490-690ms on a good day. That's barely within budget on a perfect connection. On Steam Deck WiFi (which is often 5GHz but inconsistent), add 50-200ms latency variance. You'll bust the 800ms target 30-40% of the time.

The prefetching strategy (Section 7.2) is great and *mostly* solves this, but only for the happy path. What about when a user goes Level 1 → Feature → rejects plan → back to Level 1 → Feature again? The cache is invalidated (context hasn't changed, but rejected features need to be excluded). Now you're doing a fresh call with no prefetch buffer.

**The `claude_code_prompt` is being written by the wrong system.**

Section 8.1 has the prediction engine (a fast/cheap model) writing the actual prompt that gets sent to Claude Code (an expensive/powerful model). You're having Haiku write instructions for Opus. The prediction engine doesn't have deep codebase knowledge — it gets a summary. So `claude_code_prompt` will say things like "Add a search bar component above the NoteList in App.js" when maybe the component is actually called `NotesList` with an S, or it's in `src/views/` not `src/components/`. Claude Code will figure it out anyway, but you're adding noise to its context window.

Consider: have the prediction engine generate the *intent* (what to build, not how), and let Claude Code handle the *implementation details* itself. It's better at that — that's literally its job.

**Missing: circuit breaker pattern.**

Section 4.2 has retry → cache → hardcoded fallback. Good. But there's no circuit breaker. If the API is down for 5 minutes, every screen transition triggers a failed call + retry + timeout. That's 4+ seconds of latency *per screen* for the entire outage window. You need a circuit breaker that trips after N consecutive failures and goes straight to cache/fallback for a cooldown period before retrying.

### What I'd Change
1. Spec out `detected_features` and `detected_gaps` as their own module with a real algorithm, not hand-waved heuristics.
2. Replace the Y validation with something concrete (even if it's just "Y label must not share >50% of words with A or B labels").
3. Strip `claude_code_prompt` down to intent-level instructions. Let Claude Code handle file references.
4. Add circuit breaker to the fallback chain.
5. Add latency percentile targets (p50, p95, p99), not just averages.

---

## REVIEWER 2: Jade — Indie Game Dev / Creative Coder, 6 years experience
**Background:** Makes weird art games in Godot and Processing. Has 12K followers on itch.io. Day job is frontend at a design agency. Thinks code is a creative medium first and an engineering discipline second. Strong opinions about user experience and "feel." Will roast any UI that feels corporate. Uses a Steam Deck daily and already runs Emacs on it as a bit.

### Overall Assessment: 8/10 — "This gets it. A few things feel stiff."

Okay I actually love the philosophy here. The dual-system split is smart — keeping the creative suggestion engine separate from the code robot means you can tune personality independently. The prefetching trick (Section 7.2) is *chef's kiss* — instant Level 2 is the difference between this feeling snappy and feeling sluggish.

But some of the rigidity is killing the creative energy this project is supposed to have.

### Critique

**The 4-option constraint is going to feel suffocating sometimes.**

Every Level 2 screen generates exactly 4 options mapped to ABXY. That's clean and consistent. But for Feature mode specifically, 2 real suggestions + 1 reroll modifier + 1 joke = only 2 actual things to pick from. That's... not a lot? What if neither A nor B resonates? You reroll, sure, but you're still getting 2 real options. The D-pad "more options" (mentioned in the flow diagram) isn't reflected anywhere in the prediction engine prompts. Section 3.1 says "Generate exactly 4 feature suggestions" — where are the D-pad overflow options?

I'd want at least 6-8 suggestions generated per call, with A/B being the top 2 and D-pad down scrolling through the rest. The prompt should say "Generate 8 suggestions, ranked. The top 2 will be shown as primary options."

**Bug mode is too analytical, not enough "feel."**

Section 3.2 has the bug detection prompt asking for `severity` and `evidence` — very engineering-brained. But when I'm on my Deck playing with a little game I'm making, and I hit Bug mode, I don't want a severity assessment. I want the AI to *empathize* with my frustration. "The character falls through the floor when you jump near a wall" is way more useful than "collision detection edge case, severity: annoying."

The bug prompt should ask for the user-facing symptom, not the technical analysis. The technical stuff belongs in the plan, not the suggestion label.

**Exploration mode needs WAY more personality.**

Section 3.5 generates project ideas with `label`, `quip`, `description`, `tech_suggestion`, `estimated_sessions`. This is fine but it reads like a product catalog. Exploration mode is supposed to be the "sit on your couch and get inspired" flow. The prompt should ask for a *hook* — a one-sentence pitch that makes you go "oh hell yes I need to build that RIGHT NOW."

Like, compare:
- Current: `"label": "Pixel Art Editor", "description": "Build a browser-based pixel art tool with layers and export."`
- Better: `"hook": "What if you could draw sprites for your games without ever leaving the Deck? Tiny pixels, big energy."`

The hook should sell the *feeling* of building it, not describe the feature list.

**The quip rules (Section 6.3) are too restrictive.**

"Never mean-spirited toward the user's project" — I agree in principle, but "your 400-line App.js" IS a roast and it's funny. The line between "sassy" and "mean" is entirely about delivery. The current rules are going to produce safe, bland quips. What you want is quips that roast the *situation* (not the person), like "400 lines in one file? bold." vs. "your code is bad." The nuance matters and the prompt should capture it better.

Also: "Avoid cliches: no 'let's gooo'" — good. But then the example quips in Section 3.1 include "organizational therapy" and "sentient stationery" which are... fine? They're not cliches but they're not funny either. The examples should be funnier. The LLM will pattern-match off them.

**The estimated_time field is weird for games/creative projects.**

Section 3.4: `"estimated_time": "~3 min"` — this makes sense for "add a search bar." It makes zero sense for "add particle effects to the player death animation." Creative features have unpredictable scope. The time estimate will be wrong constantly and will either stress the user out ("it said 3 minutes, it's been 8") or be so padded it's useless ("~15 min" for everything).

Consider: replace time estimates with a **progress vibe** — "quick tweak", "decent chunk", "strap in" — that sets expectations without a countdown clock.

### What I'd Change
1. Generate 8 options per Level 2 call, show top 2 on ABXY, put the rest behind D-pad scroll.
2. Bug mode prompts should focus on user-visible symptoms, not technical severity.
3. Exploration ideas need a `hook` field that sells the feeling, not the spec.
4. Replace `estimated_time` with qualitative scope indicators.
5. Make the example quips in the doc actually funny. The LLM will copy the energy level.

---

## REVIEWER 3: Diego — Staff Platform Engineer, 11 years experience
**Background:** Ex-Stripe, ex-Datadog. Builds developer tools and internal platforms. Obsessed with observability, cost modeling, and "will this scale" questions. Currently at an AI startup doing inference optimization. Has opinions about token economics the way wine people have opinions about tannins. Runs everything in containers. His Steam Deck is modded to run NixOS.

### Overall Assessment: 7/10 — "Good bones. The cost model is going to bite you."

The architecture is well-separated and the context assembler is a nice abstraction. But this document is weirdly silent about the thing that will actually determine whether people can afford to use this app: money.

### Critique

**There is no cost model and that's a critical omission.**

Section 6.5 recommends model tiers (Fast/Mid) per call type but never calculates what a session actually costs. Let me do it:

A typical session (30-60 min of building):
- Level 1 → Level 2: ~4 round trips (you explore 4 features before picking one)
- Each Level 2 involves prefetching 3 categories = 12 fast-model calls
- Rerolls: ~2 per session = 2 fast-model calls
- Level 3 plan: ~4 plans generated (you reject a few) = 4 mid-model calls
- Plan expansion: ~1 per session = 1 mid-model call
- QA mode: ~1 per session = 1 mid-model call

Totals per session: ~14 fast calls + ~6 mid calls.

Cost per call (rough, with the 2K token context + ~500 token response):
- Fast (Haiku): ~$0.001 per call → 14 calls = $0.014
- Mid (Sonnet): ~$0.01 per call → 6 calls = $0.06
- **Total prediction engine cost per session: ~$0.07**

Plus Claude Code usage (which is the real cost — probably $0.50-$2.00 per session depending on task complexity).

This is actually very reasonable, but **the doc should say so explicitly.** Users need to know. And the prefetching strategy (Section 7.2) fires 3-4 parallel calls every time you enter Level 1 — if a user bounces in and out of Level 1 a lot (which they will during exploration), those prefetch calls add up. You need a prefetch cooldown or deduplication strategy.

**The context hash (Section 7.3) is too coarse.**

```
context_hash = hash(file_tree_summary + latest_commit_sha + error_count + detected_features_count)
```

This invalidates ALL caches when ANY file changes. But if the user just built a feature and is now in Bug mode, the Feature suggestions cache is still valid — the bugs changed, not the feature opportunities. You want per-category cache invalidation:
- Feature suggestions: invalidate on new features detected or file tree structure change
- Bug suggestions: invalidate on error_count change or recent file modifications
- Tech Debt: invalidate on file size changes or test count changes

Fine-grained invalidation = fewer wasted API calls = lower cost.

**The behavior tracking (Section 5.1) stores too much data for what it does.**

You're tracking per-interaction history with timestamps, options shown, selection times, etc. But the only place this data surfaces is in `user_behavior` aggregate stats in the context payload (Section 2.1). You're collecting interaction-level telemetry but only using session-level summaries. Either:
1. Use the detailed data (feed last-5-interactions into the prompt, not just aggregates), or
2. Only collect aggregates and save the storage/complexity

Right now you're paying the complexity cost of detailed tracking without the benefit.

**The feedback loop has a cold-start problem.**

Section 5.2 describes how behavior signals modify prompts. But for a brand new project (session 1), you have: zero category selections, zero rerolls, zero plan rejections. The `user_behavior` section is empty. The prediction engine has no signal and will produce generic suggestions.

For an app that's supposed to feel like mind-reading, the first session is the WORST experience. And first impressions matter. You need a "cold start strategy" — maybe inherit global behavior from other projects, or run a lightweight project analysis that infers likely next steps based on project type alone (new React app → probably needs routing, state management, API layer).

**Missing: token budget enforcement.**

Section 2.3 says context should stay under 2,000 tokens. But the prompt templates (Section 3.x) ADD ~300-500 tokens of instructions ON TOP of the context. So the total input is 2,300-2,500 tokens, plus you want ~500 tokens of output. That's ~3,000 tokens per call. Fine for fast models, but worth stating explicitly so nobody accidentally switches to a model with a small context window.

Also: what happens if `detected_features` has 15 items, `detected_gaps` has 8, and `current_errors` has 3 long stack traces? You could blow past 2,000 tokens easily. The caps in Section 2.3 need to be enforced with actual token counting, not just item count limits.

### What I'd Change
1. Add a "Cost Model" section with per-session estimates for fast, mid, and heavy usage patterns.
2. Implement per-category cache invalidation instead of global hash-based invalidation.
3. Either use the detailed behavior history in prompts or stop collecting it.
4. Add a cold-start strategy section for new projects.
5. Token-count the context payload, don't just count items.

---

## REVIEWER 4: Sam — Junior-ish Full-Stack Dev, 3 years experience
**Background:** Bootcamp grad, now mid-level at a SaaS startup. Writes React and Node daily. Has shipped 4 side projects that nobody uses. Learns by building, not by reading docs. Bought a Steam Deck last month and hasn't put it down. The exact target user for DeckForge. Also, chronically online — knows every meme, every Twitter thread about AI, and has tried every AI coding tool that exists. Self-describes as "chaotic good."

### Overall Assessment: 9/10 — "SHUT UP AND TAKE MY MONEY. But also..."

Okay so I read this entire doc and I'm hyped. The prefetching trick? The Y-is-always-ridiculous rule? The unhinged modifier that appends creative chaos to the plan? This is so clearly designed by someone who actually builds dumb fun side projects. I feel seen.

But I have some real concerns as the person who would actually be pressing these buttons.

### Critique

**The "detected_features" problem is going to hit me hard.**

Section 2.2 says features are detected from git commit messages. My commit messages are literally: `"stuff"`, `"wip"`, `"it works"`, `"aaaaaaa"`, `"ok actually works now"`. The feature detection will get NOTHING from my history. This means the prediction engine will have no idea what I've already built and will suggest things I already have.

But wait — DeckForge auto-commits after every task (requirements doc, Section 0.1). So if DeckForge controls the commit messages, it can write informative ones! The prediction engine should consume the *DeckForge-generated* commit messages, not user-written ones. The plan summary ("I'll add search and filtering to your notes app") IS the commit message. Problem solved, if you design it that way.

**I will ABSOLUTELY spam the reroll button.**

Section 7 mentions rate limiting in Open Questions but doesn't solve it. Here's my actual behavior pattern: I see 2 suggestions, neither is perfect, I mash RB three times in 2 seconds, then pick from the third set. That's 3 API calls in 2 seconds. With prefetching, the first reroll is instant (cached). The second and third are fresh calls.

The 500ms cooldown idea (Section 9.7) is fine mechanically but feels bad as a user. Instead: generate 8 options per call (as Jade suggested), cache all 8. First reroll = show options 3-4. Second reroll = show options 5-6. Third reroll = NOW make a fresh API call. This way I get 3 free rerolls before hitting the network. Way better UX and way cheaper.

**The plan expansion flow (Section 8.3) needs a "change this step" option.**

When I see a 5-step plan, sometimes step 3 is wrong but the rest is fine. Right now my only options are A (ship all), B (reject all), X (more detail), Y (unhinged). I want to be able to D-pad to step 3 and press... something... to say "change this one." Maybe that's a future feature but it feels core to me. Otherwise I'm rejecting perfectly good plans because of one bad step.

**Where does the API key go?**

Section 9.1 asks this as an open question. As a user, I need this answered NOW. I have an Anthropic API key and an OpenAI key. If the first-run experience is "paste your API key" I'm fine with that. If it's "go set an environment variable" I'm closing the app. The onboarding UX for API keys is make-or-break for the first session. Suggestion: show a friendly screen with a text input (the ONE time keyboard/voice is expected), let me paste my key, test it with a health check call, done.

**The "features_user_has_rejected" blocklist (Section 5.2) is too aggressive.**

If I reject "dark mode" once because I'm focused on features, that doesn't mean I NEVER want dark mode. Maybe next session I'm in a cleanup mood and dark mode sounds perfect. The blocklist should be per-session or time-decayed, not permanent. After 3 sessions, a rejected feature should come back as a suggestion.

**Y should sometimes be ACTUALLY good.**

The Y rule says always ridiculous. But the best Y moments will be when the ridiculous suggestion is secretly genius. "Add a mood ring to each note" is funny but also... kind of a cool feature? The best Y options are the ones where the user goes "wait, actually... yes." The prompt should encourage this: "Y should be absurd on the surface but surprisingly compelling if you think about it for 2 seconds."

### What I'd Change
1. Use DeckForge's own auto-commit messages as the feature detection source, not user git history.
2. Generate 8 options, cache all 8, cycle through pairs on reroll before hitting the network.
3. Add per-step plan editing (D-pad select + modify).
4. Solve the API key onboarding UX now, not later.
5. Make rejected features time-decay back into the suggestion pool after 2-3 sessions.
6. Add to the Y rule: "The best Y options are secretly brilliant ideas wearing a funny hat."

---

## CONSENSUS SUMMARY

All four reviewers agree on these points:

1. **Generate more than 4 options per call.** Cache the extras for rerolls. This is both better UX (instant rerolls) and cheaper (fewer API calls).

2. **`detected_features` from git commits is fragile.** DeckForge should write its own commit messages (from plan summaries) and use THOSE as the feature detection source.

3. **The cost model needs to be explicit.** Users are paying for API calls. Even if it's cheap ($0.07/session for predictions), transparency builds trust.

4. **Cold-start experience matters.** The first session on a new project has zero behavioral data. The predictions will be generic. This needs a specific strategy.

5. **The Y rule is the soul of the app.** Every reviewer engaged with it differently (Mika wants it validated, Jade wants it funnier, Diego wants it costed, Sam wants it secretly good). This is a sign that it's the most interesting design decision in the doc. Protect it.

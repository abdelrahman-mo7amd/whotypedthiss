/**
 * WhoTypedThis? AI Engine v3.0
 * ─────────────────────────────────────────────────────────────────────────────
 * A lightweight in-browser writing-style fingerprinting + analysis system.
 *
 * Two modes:
 *   1. LOCAL fingerprinting  — runs entirely client-side, zero latency.
 *      Extracts ~18 stylometric features per text sample.
 *
 *   2. CLAUDE analysis      — calls Anthropic API for deep insight:
 *      - Vocabulary richness, humor type, sarcasm level
 *      - Personalized "tell" detection per player
 *      - AI-generated hint during guessing phase
 *      - Post-game "writing personality" badge
 *
 * No data leaves the game except to the Anthropic API (anonymous text only).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── LOCAL FEATURE EXTRACTION ────────────────────────────────────────────────

function extractFeatures(text) {
  if (!text) return null;
  const t = text.trim();
  const words = t.split(/\s+/);
  const chars = t.length;
  const sentences = t.split(/[.!?]+/).filter(Boolean);

  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / Math.max(words.length, 1);
  const capsRatio = (t.match(/[A-Z]/g) || []).length / Math.max(chars, 1);
  const punctDensity = (t.match(/[.,!?;:]/g) || []).length / Math.max(chars, 1);
  const exclamations = (t.match(/!/g) || []).length;
  const ellipsis = (t.match(/\.\.\./g) || []).length;
  const questionsMarks = (t.match(/\?/g) || []).length;
  const emojis = (t.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  const allCapsWords = words.filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;
  const avgSentenceLen = words.length / Math.max(sentences.length, 1);
  const startsWithThe = /^the /i.test(t) ? 1 : 0;
  const uniqueWordRatio = new Set(words.map(w => w.toLowerCase())).size / Math.max(words.length, 1);
  const endsWithPunct = /[.!?]$/.test(t) ? 1 : 0;
  const commaCount = (t.match(/,/g) || []).length;
  const hasContractions = /\b\w+'\w+\b/.test(t) ? 1 : 0;
  const negationWords = (t.match(/\b(no|not|never|don't|won't|can't|wouldn't|couldn't)\b/gi) || []).length;
  const intensifiers = (t.match(/\b(very|really|so|absolutely|totally|literally|actually)\b/gi) || []).length;
  const starts_lowercase = /^[a-z]/.test(t) ? 1 : 0;

  return {
    avgWordLen: +avgWordLen.toFixed(3),
    capsRatio: +capsRatio.toFixed(3),
    punctDensity: +punctDensity.toFixed(3),
    exclamations,
    ellipsis,
    questionsMarks,
    emojis,
    allCapsWords,
    avgSentenceLen: +avgSentenceLen.toFixed(2),
    startsWithThe,
    uniqueWordRatio: +uniqueWordRatio.toFixed(3),
    endsWithPunct,
    commaCount,
    hasContractions,
    negationWords,
    intensifiers,
    starts_lowercase,
    wordCount: words.length,
  };
}

/**
 * Compare two feature vectors. Returns similarity 0-1.
 * Uses weighted Euclidean distance normalized by feature ranges.
 */
function featureSimilarity(a, b) {
  if (!a || !b) return 0;
  const weights = {
    avgWordLen: 2,
    capsRatio: 1.5,
    punctDensity: 1,
    exclamations: 1.5,
    ellipsis: 2,
    questionsMarks: 1,
    emojis: 2,
    allCapsWords: 1.5,
    avgSentenceLen: 1,
    uniqueWordRatio: 1,
    endsWithPunct: 1,
    commaCount: 1,
    hasContractions: 1,
    negationWords: 1,
    intensifiers: 1,
    starts_lowercase: 1.5,
  };

  const ranges = {
    avgWordLen: 5, capsRatio: 0.3, punctDensity: 0.15,
    exclamations: 3, ellipsis: 2, questionsMarks: 2,
    emojis: 3, allCapsWords: 3, avgSentenceLen: 15,
    uniqueWordRatio: 0.5, endsWithPunct: 1, commaCount: 3,
    hasContractions: 1, negationWords: 2, intensifiers: 2,
    starts_lowercase: 1,
  };

  let totalWeight = 0;
  let weightedDist = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const diff = Math.abs((a[key] || 0) - (b[key] || 0));
    const range = ranges[key] || 1;
    const norm = Math.min(diff / range, 1);
    weightedDist += weight * norm;
    totalWeight += weight;
  }

  const avgDist = weightedDist / totalWeight;
  return 1 - avgDist;
}

// ─── WRITING PERSONALITY BADGES ──────────────────────────────────────────────

const PERSONALITY_PROFILES = [
  {
    id: 'chaos_agent',
    name: 'ALL CAPS PERSON',
    icon: '🔥',
    desc: 'Types in caps, uses a lot of !, very direct.',
    test: f => f.allCapsWords >= 1 || f.exclamations >= 2 || f.capsRatio > 0.15,
  },
  {
    id: 'silent_philosopher',
    name: 'SERIOUS WRITER',
    icon: '🧠',
    desc: 'Long sentences, big words, no emojis. Very careful.',
    test: f => f.avgWordLen > 5 && f.emojis === 0 && f.avgSentenceLen > 8,
  },
  {
    id: 'emoji_enthusiast',
    name: 'EMOJI PERSON',
    icon: '🌈',
    desc: 'Uses a lot of emojis. The text comes second.',
    test: f => f.emojis >= 2,
  },
  {
    id: 'drama_queen',
    name: 'DRAMATIC',
    icon: '💀',
    desc: 'Loves the ... a lot. Very... dramatic.',
    test: f => f.ellipsis >= 1 && f.avgWordLen < 5,
  },
  {
    id: 'lowercase_rebel',
    name: 'NO CAPS',
    icon: '😌',
    desc: 'Never uses capital letters. Ever.',
    test: f => f.starts_lowercase && f.capsRatio < 0.05,
  },
  {
    id: 'punctuation_addict',
    name: 'COMMA PERSON',
    icon: '📝',
    desc: 'Uses a lot of commas and punctuation.',
    test: f => f.punctDensity > 0.08 && f.commaCount >= 2,
  },
  {
    id: 'intensifier',
    name: 'VERY VERY PERSON',
    icon: '⚡',
    desc: 'Uses words like very, really, so, literally a lot.',
    test: f => f.intensifiers >= 2,
  },
  {
    id: 'questioner',
    name: 'QUESTION PERSON',
    icon: '🤔',
    desc: 'Puts a question mark on almost everything?',
    test: f => f.questionsMarks >= 2,
  },
  {
    id: 'minimalist',
    name: 'MINIMALIST',
    icon: '⬜',
    desc: 'Short sentences. Few words. Says enough.',
    test: f => f.wordCount <= 6 && f.punctDensity < 0.04,
  },
  {
    id: 'the_normal',
    name: 'NORMAL ONE',
    icon: '👀',
    desc: 'Writes normally. Nothing unusual.',
    test: () => true, // catch-all
  },
];

function getPersonalityBadge(texts) {
  if (!texts || texts.length === 0) return PERSONALITY_PROFILES[PERSONALITY_PROFILES.length - 1];
  const features = texts.map(extractFeatures).filter(Boolean);
  if (features.length === 0) return PERSONALITY_PROFILES[PERSONALITY_PROFILES.length - 1];

  // Average features
  const avg = {};
  const keys = Object.keys(features[0]);
  for (const key of keys) {
    avg[key] = features.reduce((s, f) => s + (f[key] || 0), 0) / features.length;
  }

  return PERSONALITY_PROFILES.find(p => p.test(avg)) || PERSONALITY_PROFILES[PERSONALITY_PROFILES.length - 1];
}

// ─── CLAUDE API INTEGRATION ───────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-20250514';

/**
 * Get AI-powered hint for who wrote a specific text,
 * given all players' previously submitted texts.
 *
 * @param {string} mysteryText - The text to analyze
 * @param {Array<{name, texts}>} players - Each player's name + their past texts
 * @returns {Promise<{hint: string, suspectName: string|null, confidence: number}>}
 */
async function getAIHint(mysteryText, players) {
  const playerContext = players
    .map(p => `${p.name}: "${p.texts.slice(0, 3).join('" / "')}"`)
    .join('\n');

  const prompt = `You are helping players in a guessing game called WhoTypedThis.

Each player's writing examples:
${playerContext}

The mystery text is: "${mysteryText}"

Look at the writing style of the mystery text (punctuation, capitals, emojis, word choice). Give one short hint (max 12 words) that helps players guess who wrote it. Do not say the name directly.

Reply only in this JSON format:
{"hint":"your short hint here","suspectName":"most likely name or null","confidence":0.7}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || '').join('');
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Graceful fallback — use local analysis
    return getLocalHint(mysteryText, players);
  }
}

/**
 * After game ends, generate personalized writing analysis for each player
 */
async function analyzePlayerStyles(players) {
  const descriptions = players.map(p => ({
    name: p.name,
    texts: p.texts,
    localBadge: getPersonalityBadge(p.texts),
  }));

  const prompt = `You are analyzing writing styles in a game called WhoTypedThis.

Players and what they wrote:
${descriptions.map(p => `${p.name} (${p.localBadge.name}): "${p.texts.join('" / "')}"`)
  .join('\n')}

For each player, write a short 2-sentence comment about their writing style. Keep it funny and friendly, not mean. Use simple English.

Reply ONLY with valid JSON, like this:
{"players":[{"name":"PlayerName","roast":"Two sentences about their style.","badge":"emoji LABEL"}]}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || '').join('');
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback: use local badges
    return {
      players: descriptions.map(p => ({
        name: p.name,
        roast: `${p.localBadge.desc} Denial is the first stage.`,
        badge: `${p.localBadge.icon} ${p.localBadge.name}`,
      })),
    };
  }
}

/**
 * Generate a wild, creative writing prompt for the current player to write about their target.
 * Makes the prompting phase more interesting than just "write something."
 */
async function generatePromptIdea(authorName, targetName) {
  const prompt = `You are helping someone write a short sentence about a friend in a game.
The writer is "${authorName}" and they are writing about "${targetName}".
Give 3 short starter ideas they can finish or use (max 8 words each). Keep it light and fun, not mean.

Reply ONLY with JSON: {"ideas":["idea 1","idea 2","idea 3"]}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || '').join('');
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      ideas: [
        'Is always the last one to know...',
        'Would be the first person to...',
        'The kind of person who...',
      ],
    };
  }
}

// ─── LOCAL FALLBACK HINT ──────────────────────────────────────────────────────

function getLocalHint(text, players) {
  const features = extractFeatures(text);
  const hints = [];

  if (features.emojis > 0) hints.push('This person uses emojis in their writing');
  if (features.allCapsWords > 0) hints.push('This person used capital letters');
  if (features.ellipsis > 0) hints.push('This person uses ... a lot');
  if (features.exclamations >= 2) hints.push('This person uses a lot of exclamation marks');
  if (features.starts_lowercase) hints.push('This person did not start with a capital letter');
  if (features.avgWordLen > 5.5) hints.push('This person uses long words');
  if (features.avgWordLen < 3.5) hints.push('This person uses short, simple words');
  if (features.hasContractions) hints.push('This person writes in a casual way');
  if (features.intensifiers >= 2) hints.push('This person uses words like very, really, literally');

  // Find most likely based on feature similarity
  let best = null;
  let bestScore = 0;
  for (const p of players) {
    if (p.texts.length === 0) continue;
    const avgSim = p.texts.reduce((s, t2) => {
      const f2 = extractFeatures(t2);
      return s + featureSimilarity(features, f2);
    }, 0) / p.texts.length;
    if (avgSim > bestScore) { bestScore = avgSim; best = p.name; }
  }

  return {
    hint: hints[0] || 'Style analysis inconclusive... trust your gut',
    suspectName: bestScore > 0.65 ? best : null,
    confidence: bestScore,
  };
}

// ─── STYLE SIMILARITY SCORES (for guess-phase UI) ────────────────────────────

/**
 * Returns a score 0-100 for each player showing how likely
 * they are to have written the mystery text (local analysis only, instant).
 */
function getLocalSimilarityScores(mysteryText, players) {
  const mysteryFeatures = extractFeatures(mysteryText);
  if (!mysteryFeatures) return {};

  const scores = {};
  for (const p of players) {
    if (!p.texts || p.texts.length === 0) {
      scores[p.id] = 50; // neutral
      continue;
    }
    const sims = p.texts.map(t => featureSimilarity(mysteryFeatures, extractFeatures(t)));
    const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
    scores[p.id] = Math.round(avg * 100);
  }

  // Normalize so scores add a bit of intrigue
  const vals = Object.values(scores);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  for (const id of Object.keys(scores)) {
    scores[id] = Math.round(30 + (scores[id] - min) / range * 70);
  }

  return scores;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export const AIEngine = {
  extractFeatures,
  featureSimilarity,
  getPersonalityBadge,
  getAIHint,
  analyzePlayerStyles,
  generatePromptIdea,
  getLocalHint,
  getLocalSimilarityScores,
  PERSONALITY_PROFILES,
};

window.AIEngine = AIEngine;

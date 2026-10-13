// Brand copy: industry starter copy (offline) and AI-written copy (Claude API).
'use strict';
const { loadConfig } = require('./templates');
const settings = require('./settings');

const MODEL_DEFAULT = 'claude-opus-5-5';

// Fills an industry's starter copy with the brand name. Works with no network or API key.
function industryCopy(brand) {
  const industries = loadConfig().industries;
  const ind = industries.find((i) => i.id === brand.industry) || industries.find((i) => i.id === 'general');
  const fill = (s) => String(s || '').split('{name}').join(brand.name || 'Your brand');
  const c = ind.copy || {};
  return {
    headline: fill(c.headline),
    subheadline: fill(c.subheadline),
    about: fill(c.about),
    mission: fill(c.mission),
    voice: ind.voice || '',
    cta: fill(c.cta),
    values: (c.values || []).map(fill),
    slides: (c.slides || []).map((s) => ({ title: fill(s.title), body: fill(s.body) })),
  };
}

const COPY_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Short brand headline, max 8 words.' },
    subheadline: { type: 'string', description: 'One supporting line, max 14 words.' },
    about: { type: 'string', description: 'About the brand, 2-3 sentences.' },
    mission: { type: 'string', description: 'Mission statement, one sentence.' },
    voice: { type: 'string', description: 'Tone of voice description, one or two sentences.' },
    cta: { type: 'string', description: 'Call to action, 2-4 words.' },
    values: { type: 'array', items: { type: 'string' }, description: '3 to 5 brand values, one or two words each.' },
    slides: {
      type: 'array',
      description: 'Social carousel, exactly the requested number of slides.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Slide title, max 7 words.' },
          body: { type: 'string', description: 'Slide body, max 18 words.' },
        },
        required: ['title', 'body'],
        additionalProperties: false,
      },
    },
  },
  required: ['headline', 'subheadline', 'about', 'mission', 'voice', 'cta', 'values', 'slides'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = [
  'You are a senior brand copywriter. You write copy that will be typeset directly into brand guidelines,',
  'presentations and social media carousels, so every field must be ready to publish: no placeholders,',
  'no quotation marks around lines, no emojis or hashtags unless the brief asks for them.',
  'Respect the length limits in the schema; layouts break when text runs long.',
  'Write in the language of the brief. Use British or American spelling to match the brief.',
].join(' ');

function buildPrompt(brand, { brief = '', slides = 5 } = {}) {
  const industries = loadConfig().industries;
  const ind = industries.find((i) => i.id === brand.industry);
  const lines = [
    `Brand name: ${brand.name}`,
    brand.tagline && `Tagline: ${brand.tagline}`,
    ind && ind.id !== 'general' && `Industry: ${ind.name}`,
    ind && ind.voice && `Typical voice for this industry: ${ind.voice}`,
    brand.website && `Website: ${brand.website}`,
    brand.copy && brand.copy.voice && `Existing tone of voice: ${brand.copy.voice}`,
    `Number of carousel slides: ${slides}`,
    brief ? `\nBrief from the designer:\n${brief}` : '\nNo extra brief; infer a sensible positioning from the name and industry.',
  ];
  return lines.filter(Boolean).join('\n');
}

let AnthropicCtor = null;
function loadSdk() {
  if (!AnthropicCtor) {
    const mod = require('@anthropic-ai/sdk');
    AnthropicCtor = mod.default || mod.Anthropic || mod;
  }
  return AnthropicCtor;
}

// Writes brand copy with Claude. `client` can be injected for tests.
async function generateCopy(brand, { brief = '', slides = 5, client } = {}) {
  const s = settings.load();
  const Anthropic = loadSdk();
  const apiKey = s.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!client && !apiKey) {
    throw new Error('Add your Anthropic API key in Settings to write copy with AI (or use industry copy).');
  }
  const api = client || new Anthropic({
    apiKey,
    // The Adobe panel is a desktop app running the user's own key, not a public web page.
    dangerouslyAllowBrowser: typeof window !== 'undefined',
  });

  let response;
  try {
    response = await api.beta.messages.create({
      model: s.aiModel || MODEL_DEFAULT,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: COPY_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(brand, { brief, slides }) }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Your Anthropic API key was rejected. Check it in Settings.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Claude is rate limiting requests. Try again in a minute.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Could not reach the Claude API. Check your internet connection.');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude API error ${e.status}: ${e.message}`);
    throw e;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to write copy for this brief. Try rewording it.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('The copy was cut off before it finished. Try a shorter brief.');
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let copy;
  try {
    copy = JSON.parse(text);
  } catch {
    throw new Error('Claude returned copy in an unexpected format. Please try again.');
  }
  return {
    headline: copy.headline, subheadline: copy.subheadline, about: copy.about, mission: copy.mission,
    voice: copy.voice, cta: copy.cta, values: copy.values || [], slides: (copy.slides || []).slice(0, slides),
  };
}

module.exports = { industryCopy, generateCopy, buildPrompt, COPY_SCHEMA, MODEL_DEFAULT };

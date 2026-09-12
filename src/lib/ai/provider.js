/**
 * provider.js — LLM 호출 추상화 (서버 전용).
 * 현재 Anthropic Claude(+웹검색 tool). 다른 프로바이더로 교체 시 이 파일만 수정.
 * ⚠️ ANTHROPIC_API_KEY 필요. 서버(Server Action/Route)에서만 호출.
 */
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * 웹 검색을 곁들여 질문하고 최종 텍스트를 반환.
 * @param {string} prompt
 * @param {{model?:string, maxTokens?:number, maxSearches?:number}} opts
 * @returns {Promise<string>}
 */
export async function askWithWebSearch(prompt, opts = {}) {
  const { model = DEFAULT_MODEL, maxTokens = 1024, maxSearches = 3 } = opts;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY 미설정');

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);

  // content 배열에서 text 블록만 이어붙임 (web_search tool_use/result 블록 제외)
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return text;
}

// 공개 사이트(www.5e.ai.kr/bug/)는 Cloudflare Worker(5e-bug-api)의 API를 쓴다.
// 로컬 미리보기는 같은 출처의 /api/bug-board(scripts/bug-board-server.cjs)를 써서 운영 서버로 시험 신고를 보내지 않는다.
const PUBLIC_HOSTS = new Set(['5e.ai.kr', 'www.5e.ai.kr']);
export const BUG_BOARD_API = PUBLIC_HOSTS.has(location.hostname)
  ? 'https://5e-bug-api.5e-desktop.workers.dev/api/bug-board'
  : '/api/bug-board';

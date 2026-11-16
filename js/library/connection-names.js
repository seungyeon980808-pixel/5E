// 설치형 「폴더 연결」의 이름표: 연결 ID → 연결한 폴더 이름(예: 5e_print_1103).
// 라이브러리 나무에서 그 폴더의 PDF와 그림을 같은 폴더 이름 아래에 모은다(11-04: 「연결 폴더」와 「_print」 두 갈래로 나뉘던 것).
const names = new Map();
export function setConnectionNames(connections = []) {
  names.clear();
  for (const connection of connections) if (connection?.connectionId && connection.name) names.set(connection.connectionId, String(connection.name));
}
export const connectionName = (id) => (id && names.get(id)) || null;

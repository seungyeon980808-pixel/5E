// Formula references for text generation, not fitted or invented measurements.
// Numerical coefficients must come from the user's conditions. Expressions in
// these notes use physical symbols; the generator substitutes numbers and x.
export const PHYSICS_REFERENCE_VERSION = 'physics-reference-v1';
const references = [
  {
    id: 'damped', match: /감쇠|감쇄|감진|마찰.*진동|damp/i,
    note: '선형 점성 감쇠, m q″+b q′+k q=0: beta=b/(2m), D=k/m-beta^2. D>0이면 w=sqrt(D), q(t)=exp(-beta*t)*(q0*cos(w*t)+(v0+beta*q0)/w*sin(w*t)). q(0)=q0, q′(0)=v0를 모두 확인한다. v0=0이라고 q0*exp(-beta*t)*cos(w*t)만 쓰면 초기 속도가 틀린다. D=0이면 exp(-beta*t)*(q0+(v0+beta*q0)*t). D<0이면 r1=-beta+sqrt(-D), r2=-beta-sqrt(-D), C1=(v0-r2*q0)/(r1-r2), C2=q0-C1, q=C1*exp(r1*t)+C2*exp(r2*t). 포락선 요청 시 D>0의 진폭은 sqrt(q0^2+((v0+beta*q0)/w)^2)*exp(-beta*t)이다. m,k>0, b>=0. 변위 기준은 평형점.',
  },
  {
    id: 'resonance', match: /공명|강제.?진동|구동|resonan|driven/i,
    note: '조화 구동 m q″+b q′+k q=F0*cos(w*t)의 정상 상태 변위 진폭 A(w)=F0/sqrt((k-m*w^2)^2+(b*w)^2). 이는 변위의 정상 상태 진폭이며 과도 응답이나 속도 진폭과 다르다. 양의 진폭 공명 주파수 wr=sqrt(k/m-b^2/(2*m^2))는 루트 안이 양수일 때만 존재하고 sqrt(k/m)와 일반적으로 다르다. 각진동수 w(rad/s)와 진동수 f(Hz)는 w=2*pi*f로 구분. m,k>0,b>0. b=0의 극점은 유한 높이의 봉우리로 대체하지 않는다.',
  },
  {
    id: 'rc', match: /\bRC\b|축전기|커패시터|충전|방전/i,
    note: '이상적인 직렬 RC의 각 스위치 구간에서 tau=R*C, Vc(t)=Vinf+(Vstart-Vinf)*exp(-(t-ts)/tau). ts는 해당 구간 시작 시각, Vstart는 그 순간의 축전기 전압, Vinf는 그 회로의 최종 전압이다. 전원을 제거한 저항 방전은 Vinf=0. 스위치 직전 전압을 다음 구간 Vstart로 넘겨 전압 연속성을 지키며 계열 domain을 구간별로 분리한다. kΩ=1000Ω, μF=0.000001F, mA=0.001A, ms=0.001s. 전류는 정의한 양의 방향에 맞춰 (Vsource-Vc)/R; 방전 전류 부호를 임의로 뒤집지 않는다. R,C>0.',
  },
  {
    id: 'beats', match: /맥놀이|중첩|간섭|합성파|beat|superposition/i,
    note: '동일 위치에서 두 조화파의 변위 합 y(t)=A1*sin(2*pi*f1*t+phi1)+A2*sin(2*pi*f2*t+phi2). 동일 진폭 A와 초기 위상 0이면 2*A*cos(pi*(f1-f2)*t)*sin(pi*(f1+f2)*t). 진폭 포락선은 ±2*A*abs(cos(pi*(f1-f2)*t)), 맥놀이 진동수 abs(f1-f2). 포락선과 실제 진동을 구분하고 주파수 Hz를 각진동수로 잘못 넣지 않는다. 초기 위상, 경로차, 관측 위치가 없으면 이를 임의 수치로 정하지 않는다.',
  },
  {
    id: 'photoelectric', match: /광전|저지.?전압|문턱.?진동수/i,
    note: '광전효과 Kmax=h*f-W는 f>=W/h의 방출 구간에만 적용. e*Vs=Kmax는 저지전압의 크기 Vs>=0에 대한 식이다. 같은 금속·같은 진동수에서 빛의 세기를 바꿔도 저지전압은 같고 이상적인 포화전류는 세기에 비례한다. 전자 에너지 분포와 장치 조건 없는 I–V 곡선은 유일한 해석식으로 정해지지 않으므로 수치 없는 개략도로만 표현한다. 서로 다른 금속의 Kmax-f 기울기는 같다.',
  },
];

export function physicsFunctionReference(description) {
  const selected = references.filter(item => item.match.test(String(description)));
  if (!selected.length) return '';
  return `물리식 참고 (${PHYSICS_REFERENCE_VERSION}, 해당 조건이 성립할 때만 적용):\n` +
    selected.map(item => `- ${item.id}: ${item.note}`).join('\n') +
    '\n공통 검수: 정량 조건이 충분하면 실제 해석식을 expression으로 만든다. x는 가로축에 인쇄한 물리량의 수치이다. 모든 상수와 초기 조건을 대입하고 축 단위에 맞춰 변환한다. 초기값·초기 기울기·구간 연결·극값·장시간 극한·특이점과 정의역을 검산한다. 부족한 물리 조건에 임의 계수를 채워 exact라고 하지 말고, 숫자 없는 정성 도식 또는 구체적인 review를 반환한다. 정상 상태/과도 상태, 변위/속도/에너지, 전압/전류를 혼동하지 않는다.';
}

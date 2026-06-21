// 세션 관리 및 페이지 가드
export const SESSION_KEY = 'llmvp_session';

/** 현재 세션 반환. 없으면 null */
export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

/** 세션 저장 */
export function setSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

/** 세션 삭제 (로그아웃) */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * 로그인 필요 페이지에서 호출.
 * 세션 없으면 login.html로 리다이렉트하고 실행 중단(throw).
 */
export function requireAuth() {
  const session = getSession();
  if (!session || !session.user_id) {
    location.replace('/login.html');
    throw new Error('unauthenticated');
  }
  return session;
}

/** 이미 로그인된 상태에서 login.html 접근 시 홈으로 */
export function redirectIfLoggedIn() {
  const session = getSession();
  if (session && session.user_id) {
    location.replace('/home.html');
  }
}

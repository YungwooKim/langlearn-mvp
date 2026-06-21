// API 래퍼 — Edge Function 및 Supabase RPC 호출
import { supabase, EDGE_BASE } from './supabase-client.js';

/** 닉네임+핀으로 로그인 또는 신규 생성 */
export async function authLogin(nickname, pin) {
  const res = await fetch(`${EDGE_BASE}/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, pin })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '로그인 실패');
  return data; // { user_id, nickname, is_new }
}

/** 강의 목록 전체 조회 */
export async function fetchLectures() {
  const { data, error } = await supabase.from('lectures').select('*').order('created_at');
  if (error) throw error;
  return data;
}

/** 강의 상세 (섹션 + 세션 포함) */
export async function fetchLectureDetail(lectureId) {
  const [{ data: lecture }, { data: sections }] = await Promise.all([
    supabase.from('lectures').select('*').eq('id', lectureId).single(),
    supabase.from('sections').select('*, sessions(*)').eq('lecture_id', lectureId).order('order_no')
  ]);
  // 각 섹션 내 세션 정렬
  sections?.forEach(s => s.sessions?.sort((a, b) => a.order_no - b.order_no));
  return { lecture, sections };
}

/** 강의의 역량(goals) 목록 */
export async function fetchGoalsByLecture(lectureId) {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('lecture_id', lectureId)
    .order('order_no');
  if (error) throw error;
  return data;
}

/** 목적 카테고리별 역량 목록 */
export async function fetchGoalsByCategory(category) {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('purpose_category', category)
    .order('order_no');
  if (error) throw error;
  return data;
}

/** 유저 역량 목표 진척률 조회 (RPC) */
export async function fetchUserGoalProgress(userId) {
  const { data, error } = await supabase.rpc('get_user_goal_progress', { p_user_id: userId });
  if (error) throw error;
  return data;
}

/** 유저 역량 목표 등록 */
export async function registerUserGoal(userId, goalId) {
  const { data, error } = await supabase
    .from('user_goals')
    .upsert({ user_id: userId, goal_id: goalId, status: 'in_progress' }, { onConflict: 'user_id,goal_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 유저가 등록한 강의 ID 목록 */
export async function fetchUserLectureIds(userId) {
  const { data, error } = await supabase
    .from('user_goals')
    .select('goals(lecture_id)')
    .eq('user_id', userId);
  if (error) throw error;
  return [...new Set(data.map(d => d.goals?.lecture_id).filter(Boolean))];
}

/** 세션 완료 기록 */
export async function completeSession(userId, sessionId) {
  const { error } = await supabase
    .from('user_lesson_progress')
    .upsert({ user_id: userId, session_id: sessionId }, { onConflict: 'user_id,session_id' });
  if (error) throw error;
}

/** 유저가 완료한 세션 ID 목록 */
export async function fetchCompletedSessionIds(userId) {
  const { data, error } = await supabase
    .from('user_lesson_progress')
    .select('session_id')
    .eq('user_id', userId);
  if (error) throw error;
  return data.map(d => d.session_id);
}

/** 역량에 매핑된 세션 목록 */
export async function fetchGoalSessions(goalId) {
  const { data, error } = await supabase
    .from('goal_session_map')
    .select('session_id, sessions(*)')
    .eq('goal_id', goalId);
  if (error) throw error;
  return data.map(d => d.sessions);
}

/** 알림 설정 조회 */
export async function fetchNotificationSettings(userId) {
  const { data } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

/** 알림 설정 저장 */
export async function saveNotificationSettings(userId, settings, onesignalExternalId) {
  const { error } = await supabase
    .from('notification_settings')
    .upsert({
      user_id: userId,
      enabled: settings.enabled,
      days: settings.days,
      send_time: settings.send_time,
      night_consent: settings.night_consent,
      onesignal_external_id: onesignalExternalId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** 역량 선택 일괄 저장 (기존 삭제 후 재삽입) */
export async function setUserGoalsSelection(userId, lectureId, selectedItems) {
  // selectedItems: [{goalId, sortOrder}]
  const { data: lectureGoals } = await supabase
    .from('goals').select('id').eq('lecture_id', lectureId);
  const lectureGoalIds = (lectureGoals || []).map(g => g.id);
  if (!lectureGoalIds.length) return;

  // 기존 user_goals 삭제
  await supabase.from('user_goals').delete()
    .eq('user_id', userId).in('goal_id', lectureGoalIds);

  // 선택된 역량 삽입
  if (selectedItems.length) {
    const { error } = await supabase.from('user_goals').insert(
      selectedItems.map(item => ({
        user_id: userId,
        goal_id: item.goalId,
        status: 'in_progress',
        sort_order: item.sortOrder
      }))
    );
    if (error) throw error;
  }
}

/** 강의의 역량 목록 + 매핑 세션 상세 조회 */
export async function fetchGoalsWithSessions(lectureId) {
  const { data: goals, error: gErr } = await supabase
    .from('goals').select('*').eq('lecture_id', lectureId).order('order_no');
  if (gErr) throw gErr;
  if (!goals?.length) return [];

  const goalIds = goals.map(g => g.id);
  const { data: maps, error: mErr } = await supabase
    .from('goal_session_map')
    .select('goal_id, sessions(id, title, duration_sec, order_no)')
    .in('goal_id', goalIds);
  if (mErr) throw mErr;

  const sessionMap = {};
  for (const m of maps || []) {
    if (!sessionMap[m.goal_id]) sessionMap[m.goal_id] = [];
    if (m.sessions) sessionMap[m.goal_id].push(m.sessions);
  }
  for (const id of Object.keys(sessionMap)) {
    sessionMap[id].sort((a, b) => (a.order_no || 0) - (b.order_no || 0));
  }

  return goals.map(g => ({ ...g, sessions: sessionMap[g.id] || [] }));
}

/** 전체 진행률 집계 (중복 세션 제거) */
export async function fetchOverallProgress(userId) {
  const { data, error } = await supabase.rpc('get_user_overall_progress', { p_user_id: userId });
  if (error) throw error;
  return data?.[0] || { total_sessions: 0, completed_sessions: 0, progress_pct: 0 };
}

/** 유저 나의 목표 목록 조회 */
export async function fetchUserPlans(userId) {
  const { data, error } = await supabase
    .from('user_plans').select('*').eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

/** 나의 목표 저장/수정 */
export async function saveUserPlan(userId, lectureId, label) {
  const { error } = await supabase.from('user_plans').upsert(
    { user_id: userId, lecture_id: lectureId, label, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,lecture_id' }
  );
  if (error) throw error;
}

/** 학습 루틴(집중 강의 + 요일별 시간) 조회 */
export async function fetchUserRoutine(userId) {
  const { data } = await supabase
    .from('user_routine').select('*').eq('user_id', userId).maybeSingle();
  return data; // 없으면 null
}

/** 학습 루틴 저장/수정 (부분 업데이트 지원) */
export async function saveUserRoutine(userId, fields) {
  // fields: { activeLectureId?, studyMinutes?, coachKey? }
  const payload = { user_id: userId, updated_at: new Date().toISOString() };
  if (fields.activeLectureId !== undefined) payload.active_lecture_id = fields.activeLectureId;
  if (fields.studyMinutes  !== undefined) payload.study_minutes  = fields.studyMinutes;
  if (fields.coachKey      !== undefined) payload.coach_key      = fields.coachKey;

  const { error } = await supabase
    .from('user_routine')
    .upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
}

/** 집중 강의 변경 */
export async function setActiveLecture(userId, lectureId) {
  return saveUserRoutine(userId, { activeLectureId: lectureId });
}

/** 코치 유형 전체 목록 조회 */
export async function fetchCoachTypes() {
  const { data, error } = await supabase
    .from('coach_types').select('*').order('sort_order');
  if (error) throw error;
  return data || [];
}

/** 코치 메시지 템플릿 조회 (bubble 또는 both 채널) */
export async function fetchCoachTemplates(coachKey) {
  const { data, error } = await supabase
    .from('coach_message_templates')
    .select('*')
    .eq('coach_key', coachKey)
    .in('channel', ['bubble', 'both'])
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

/** 코치 설정 저장 */
export async function saveUserCoach(userId, coachKey) {
  return saveUserRoutine(userId, { coachKey });
}

/** 역량 실사례 조회 */
export async function fetchGoalOutcomes(goalIds) {
  if (!goalIds || !goalIds.length) return [];
  const { data, error } = await supabase
    .from('goal_outcomes')
    .select('*')
    .in('goal_id', goalIds)
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

/** 오늘의 학습량 조회 (KST 기준) */
export async function fetchTodayStudy(userId) {
  const { data, error } = await supabase
    .rpc('get_today_study', { p_user_id: userId });
  if (error) throw error;
  return data?.[0] || { completed_sessions_today: 0, completed_minutes_today: 0 };
}

/**
 * 코치 메시지 템플릿 플레이스홀더 치환
 * @param {string} tpl - 템플릿 문자열 ({goal}, {remaining}, {plan}, {purpose})
 * @param {{ goal: string, remaining: number, plan?: string, purpose?: string }} vars
 */
export function fillTemplate(tpl, { goal = '', remaining = 0, plan = '', purpose = '' } = {}) {
  return tpl
    .replace(/\{goal\}/g, goal)
    .replace(/\{remaining\}/g, String(remaining))
    .replace(/\{plan\}/g, plan || goal)
    .replace(/\{purpose\}/g, purpose || '');
}

/**
 * 개인화 수강 순서 빌드 — 유저 sort_order 기반
 * 반환: [{id, title, sectionId, sectionTitle, sectionOrderNo, order_no, duration_sec, goalId, goalTitle}]
 */
export async function buildPersonalizedSequence(userId, lectureId) {
  const [detail, goals, userProgress] = await Promise.all([
    fetchLectureDetail(lectureId),
    fetchGoalsWithSessions(lectureId),
    fetchUserGoalProgress(userId)
  ]);

  // 세션 → 섹션 정보 조회 맵
  const sessionInfo = {};
  for (const sec of (detail.sections || [])) {
    for (const s of (sec.sessions || [])) {
      sessionInfo[s.id] = {
        id: s.id, title: s.title,
        duration_sec: s.duration_sec, order_no: s.order_no,
        sectionId: sec.id, sectionTitle: sec.title, sectionOrderNo: sec.order_no
      };
    }
  }

  // 유저 선택 역량 (이 강의, sort_order 오름차순)
  const myGoals = (userProgress || [])
    .filter(g => g.lecture_id === lectureId && g.status === 'in_progress')
    .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));

  // goalId → sessions 맵
  const goalSessionsMap = {};
  for (const g of (goals || [])) goalSessionsMap[g.id] = g.sessions || [];

  // 중복 없이 순서 생성
  const seen = new Set();
  const sequence = [];

  for (const ug of myGoals) {
    const goalSessions = (goalSessionsMap[ug.goal_id] || [])
      .filter(s => sessionInfo[s.id])
      .sort((a, b) => {
        const ia = sessionInfo[a.id], ib = sessionInfo[b.id];
        if (ia.sectionOrderNo !== ib.sectionOrderNo) return ia.sectionOrderNo - ib.sectionOrderNo;
        return ia.order_no - ib.order_no;
      });
    for (const s of goalSessions) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      sequence.push({ ...sessionInfo[s.id], goalId: ug.goal_id, goalTitle: ug.goal_title });
    }
  }

  return { sequence, myGoals, allGoals: goals };
}

/** 강의 스코프 진행률 요약 (DISTINCT 세션 기준) */
export async function fetchLectureSummary(userId, lectureId) {
  const { data, error } = await supabase.rpc('get_user_lecture_summary', {
    p_user_id: userId, p_lecture_id: lectureId
  });
  if (error) throw error;
  return data?.[0] || { total_sessions: 0, completed_sessions: 0, progress_pct: 0, total_minutes: 0, completed_minutes: 0 };
}

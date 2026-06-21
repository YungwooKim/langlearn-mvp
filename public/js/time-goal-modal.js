// 하루 학습시간 목표 모달 — 공통 컴포넌트
// 사용법: openTimeGoalModal({ userId, onSaved? })
import { fetchUserRoutine, saveUserRoutine } from './api.js';

const DAY_KEYS  = ['월', '화', '수', '목', '금', '토', '일'];
const MIN_OPTIONS = [0, 10, 20, 30, 45, 60, 90, 120];
const DEFAULT_MINUTES = { 월: 30, 화: 30, 수: 30, 목: 30, 금: 30, 토: 30, 일: 30 };

/** 분 숫자 → 표시 문자열 */
function fmtMin(m) {
  if (m === 0) return '안 함';
  return m < 60 ? `${m}분` : `${m / 60}시간`;
}

/** 모달 HTML 주입 (없으면) */
function ensureModal() {
  if (document.getElementById('_tgModal')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="modal-backdrop hidden" id="_tgModal">
      <div class="modal-sheet">
        <div class="modal-header">
          <span class="modal-title">하루 학습 목표</span>
          <button class="modal-close" id="_tgClose">×</button>
        </div>
        <p style="font-size:13px;color:var(--text-sub);margin:0 0 16px;">요일마다 들을 수 있는 시간을 설정해 두면<br>루틴을 잡는 데 도움이 돼요.</p>
        <div id="_tgRows">
          ${DAY_KEYS.map(d => `
            <div class="tg-row">
              <span class="tg-day">${d}</span>
              <select class="tg-select" data-day="${d}">
                ${MIN_OPTIONS.map(m => `<option value="${m}">${fmtMin(m)}</option>`).join('')}
              </select>
            </div>`).join('')}
        </div>
        <button type="button" class="btn btn-primary" style="margin-top:20px;" id="_tgSave">저장하기</button>
      </div>
    </div>`;
  document.body.appendChild(wrapper.firstElementChild);
  document.getElementById('_tgClose').onclick = closeTimeGoalModal;
}

/** 모달 닫기 */
export function closeTimeGoalModal() {
  document.getElementById('_tgModal')?.classList.add('hidden');
}

/**
 * 하루 학습시간 모달 열기
 * @param {{ userId: string, onSaved?: Function }} opts
 */
export async function openTimeGoalModal({ userId, onSaved } = {}) {
  ensureModal();
  const modal = document.getElementById('_tgModal');
  modal.classList.remove('hidden');

  // 기존 루틴 값 로드 → 프리필
  try {
    const routine = await fetchUserRoutine(userId);
    const minutes = routine?.study_minutes || DEFAULT_MINUTES;
    document.querySelectorAll('#_tgRows .tg-select').forEach(sel => {
      const val = minutes[sel.dataset.day] ?? 30;
      sel.value = String(val);
    });
  } catch {}

  // 저장 핸들러 — 중복 방지
  const oldBtn = document.getElementById('_tgSave');
  const saveBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(saveBtn, oldBtn);

  saveBtn.addEventListener('click', async () => {
    const studyMinutes = {};
    document.querySelectorAll('#_tgRows .tg-select').forEach(sel => {
      studyMinutes[sel.dataset.day] = Number(sel.value);
    });

    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';
    try {
      await saveUserRoutine(userId, { studyMinutes });
      closeTimeGoalModal();
      if (typeof onSaved === 'function') onSaved();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '저장하기';
    }
  });
}

/**
 * study_minutes 요약 문자열 반환
 * 예: "평일 30분 · 주말 1시간"
 */
export function summarizeStudyMinutes(studyMinutes) {
  if (!studyMinutes) return '설정 안 됨';
  const weekday = ['월', '화', '수', '목', '금'].map(d => studyMinutes[d] ?? 30);
  const weekend = ['토', '일'].map(d => studyMinutes[d] ?? 30);
  const wdAll = weekday.every(m => m === weekday[0]);
  const weAll = weekend.every(m => m === weekend[0]);
  if (wdAll && weAll && weekday[0] === weekend[0]) {
    return `매일 ${fmtMin(weekday[0])}`;
  }
  const parts = [];
  if (wdAll) parts.push(`평일 ${fmtMin(weekday[0])}`);
  else parts.push(`평일 다름`);
  if (weAll) parts.push(`주말 ${fmtMin(weekend[0])}`);
  else parts.push(`주말 다름`);
  return parts.join(' · ');
}

/**
 * 잔여 분 + 주간 학습 분 → ETA 일수 계산
 * @returns {number|null} 예상 일수 (weekly=0 이면 null)
 */
export function calcEtaDays(remainingMinutes, studyMinutes) {
  if (!studyMinutes) return null;
  const weeklyTotal = Object.values(studyMinutes).reduce((s, m) => s + (Number(m) || 0), 0);
  if (!weeklyTotal) return null;
  const dailyAvg = weeklyTotal / 7;
  return Math.ceil(remainingMinutes / dailyAvg);
}

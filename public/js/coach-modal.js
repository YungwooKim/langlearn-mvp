// 코치 선택 모달 — 공통 컴포넌트
// 사용법: openCoachModal({ userId, onSaved? })
import { fetchCoachTypes, fetchUserRoutine, saveUserCoach } from './api.js';

let _coachTypes = [];

/** 모달 HTML이 없으면 body에 주입 */
async function ensureModal() {
  if (document.getElementById('_coachModal')) return;

  // 코치 유형 데이터 로드
  _coachTypes = await fetchCoachTypes();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="modal-backdrop hidden" id="_coachModal">
      <div class="modal-sheet">
        <div class="modal-header">
          <span class="modal-title">코치 선택</span>
          <button class="modal-close" id="_coachClose">×</button>
        </div>
        <p style="font-size:13px;color:var(--text-sub);margin:0 0 16px;">
          코치 스타일에 따라 응원 메시지 톤이 달라져요
        </p>
        <div class="coach-card-list" id="_coachCardList">
          ${_coachTypes.map(c => `
            <div class="coach-card" data-key="${c.key}" tabindex="0">
              <div class="coach-card-emoji">${c.emoji}</div>
              <div class="coach-card-info">
                <div class="coach-card-name">${c.name}</div>
                <div class="coach-card-desc">${c.tone_desc}</div>
              </div>
              <div class="coach-card-check">✓</div>
            </div>`).join('')}
        </div>
        <button type="button" class="btn btn-primary" style="margin-top:20px;" id="_coachSave">
          이 코치로 시작하기
        </button>
      </div>
    </div>`;
  document.body.appendChild(wrapper.firstElementChild);

  // 닫기 버튼
  document.getElementById('_coachClose').onclick = closeCoachModal;

  // 카드 선택
  document.getElementById('_coachCardList').addEventListener('click', e => {
    const card = e.target.closest('.coach-card');
    if (!card) return;
    document.querySelectorAll('#_coachCardList .coach-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
  });
}

/** 모달 닫기 */
export function closeCoachModal() {
  document.getElementById('_coachModal')?.classList.add('hidden');
}

/**
 * 코치 선택 모달 열기
 * @param {{ userId: string, onSaved?: Function }} opts
 */
export async function openCoachModal({ userId, onSaved } = {}) {
  await ensureModal();
  const modal = document.getElementById('_coachModal');
  modal.classList.remove('hidden');

  // 기존 코치 설정 프리필
  try {
    const routine = await fetchUserRoutine(userId);
    const currentKey = routine?.coach_key || 'system';
    document.querySelectorAll('#_coachCardList .coach-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.key === currentKey);
    });
  } catch {
    // 기본값: system
    document.querySelectorAll('#_coachCardList .coach-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.key === 'system');
    });
  }

  // 저장 버튼 — 이전 핸들러 교체(중복 방지)
  const oldBtn = document.getElementById('_coachSave');
  const saveBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(saveBtn, oldBtn);

  saveBtn.addEventListener('click', async () => {
    const selected = document.querySelector('#_coachCardList .coach-card.selected');
    if (!selected) { alert('코치를 선택해주세요'); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';
    try {
      await saveUserCoach(userId, selected.dataset.key);
      closeCoachModal();
      if (typeof onSaved === 'function') onSaved();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '이 코치로 시작하기';
    }
  });
}

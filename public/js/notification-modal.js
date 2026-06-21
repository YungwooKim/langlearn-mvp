// 알림 설정 모달 — 공통 컴포넌트
// 사용법: openNotificationModal({ userId, onSaved? })
import { ONESIGNAL_APP_ID } from './supabase-client.js';
import { fetchNotificationSettings, saveNotificationSettings } from './api.js';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

/** 모달 HTML이 없으면 body에 주입 */
function ensureModal() {
  if (document.getElementById('_notiModal')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="modal-backdrop hidden" id="_notiModal">
      <div class="modal-sheet">
        <div class="modal-header">
          <span class="modal-title">알림 설정</span>
          <button class="modal-close" id="_notiClose">×</button>
        </div>
        <div class="toggle-row">
          <div>
            <div class="toggle-label">학습 알림 ON/OFF</div>
            <div class="toggle-desc">꾸준히 할 수 있도록 알림으로 알려드릴게요</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="_notiEnabled" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div id="_notiBody">
          <div style="margin-top:16px;">
            <div style="font-size:14px;font-weight:700;margin-bottom:10px;">요일 <span style="color:var(--danger)">*</span></div>
            <div class="day-chips" id="_dayChips">
              ${DAY_LABELS.map(d => `<button type="button" class="day-chip${['월','화','수','목','금'].includes(d) ? ' selected' : ''}" data-day="${d}">${d}</button>`).join('')}
            </div>
          </div>
          <div style="margin-top:16px;">
            <div style="font-size:14px;font-weight:700;margin-bottom:10px;">시간 <span style="color:var(--danger)">*</span></div>
            <div style="display:flex;gap:8px;align-items:center;">
              <select id="_sendHour" style="flex:1;padding:12px;border:1.5px solid var(--border);border-radius:8px;font-size:16px;background:var(--surface);">
                ${Array.from({length:24},(_,i)=>`<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}시</option>`).join('')}
              </select>
              <select id="_sendMin" style="flex:1;padding:12px;border:1.5px solid var(--border);border-radius:8px;font-size:16px;background:var(--surface);">
                <option value="00">00분</option>
                <option value="30">30분</option>
              </select>
            </div>
            <div id="_nightNotice" style="display:none;font-size:12px;color:var(--danger);margin-top:4px;">[필수] 야간 수신 동의 필요 (오후 9시~오전 8시)</div>
          </div>
          <div id="_nightConsentRow" style="display:none;align-items:flex-start;gap:10px;padding:12px 0;">
            <input type="checkbox" id="_nightConsent" style="width:20px;height:20px;flex-shrink:0;accent-color:var(--primary);margin-top:2px;">
            <label style="font-size:13px;color:var(--text-sub);line-height:1.5;" for="_nightConsent">야간(오후 9시~오전 8시) 알림 수신에 동의합니다</label>
          </div>
        </div>
        <button type="button" class="btn btn-primary" style="margin-top:20px;" id="_notiSave">동의하고 저장하기</button>
      </div>
    </div>`;
  document.body.appendChild(wrapper.firstElementChild);

  // 닫기 버튼
  document.getElementById('_notiClose').onclick = closeNotificationModal;

  // 요일 칩 토글
  document.getElementById('_dayChips').addEventListener('click', e => {
    const chip = e.target.closest('.day-chip');
    if (chip) chip.classList.toggle('selected');
  });

  // 시간 변경 → 야간 동의 체크
  document.getElementById('_sendHour').addEventListener('change', _checkNight);

  // ON/OFF 토글 → body 비활성화
  document.getElementById('_notiEnabled').addEventListener('change', e => {
    _setBodyEnabled(e.target.checked);
  });
}

function _checkNight() {
  const h = Number(document.getElementById('_sendHour')?.value || '21');
  const isNight = h >= 21 || h < 8;
  document.getElementById('_nightNotice').style.display = isNight ? 'block' : 'none';
  document.getElementById('_nightConsentRow').style.display = isNight ? 'flex' : 'none';
}

function _setBodyEnabled(enabled) {
  const body = document.getElementById('_notiBody');
  body.style.opacity = enabled ? '1' : '.4';
  body.style.pointerEvents = enabled ? 'auto' : 'none';
}

/** 모달 닫기 */
export function closeNotificationModal() {
  document.getElementById('_notiModal')?.classList.add('hidden');
}

/**
 * 알림 설정 모달 열기
 * @param {{ userId: string, onSaved?: Function }} opts
 */
export async function openNotificationModal({ userId, onSaved } = {}) {
  ensureModal();
  const modal = document.getElementById('_notiModal');
  modal.classList.remove('hidden');

  // 기존 설정 로드해서 채우기
  try {
    const existing = await fetchNotificationSettings(userId);
    if (existing) {
      document.getElementById('_notiEnabled').checked = !!existing.enabled;
      // 시/분 분해하여 각 콤보박스에 설정
      const timeParts = (existing.send_time || '21:00').slice(0, 5).split(':');
      const hh = timeParts[0] || '21';
      const mm = timeParts[1] || '00';
      document.getElementById('_sendHour').value = hh;
      // 분은 00/30만 허용, 그 외는 가장 가까운 값으로 스냅
      document.getElementById('_sendMin').value = Number(mm) >= 15 ? '30' : '00';
      document.querySelectorAll('#_dayChips .day-chip').forEach(c => {
        c.classList.toggle('selected', (existing.days || []).includes(c.dataset.day));
      });
      if (existing.night_consent) document.getElementById('_nightConsent').checked = true;
      _setBodyEnabled(!!existing.enabled);
    }
  } catch {}
  _checkNight();

  // 저장 핸들러 — 이전 핸들러 교체(중복 방지)
  const oldBtn = document.getElementById('_notiSave');
  const saveBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(saveBtn, oldBtn);

  saveBtn.addEventListener('click', async () => {
    const enabled = document.getElementById('_notiEnabled').checked;
    const days = [...document.querySelectorAll('#_dayChips .day-chip.selected')].map(c => c.dataset.day);
    const hh = document.getElementById('_sendHour').value || '21';
    const mm = document.getElementById('_sendMin').value || '00';
    const send_time = `${hh}:${mm}`;
    const h = Number(hh);
    const isNight = h >= 21 || h < 8;
    const night_consent = document.getElementById('_nightConsent').checked;

    if (enabled && isNight && !night_consent) {
      alert('야간 시간대에는 수신 동의가 필요합니다'); return;
    }
    if (enabled && !days.length) {
      alert('요일을 하나 이상 선택해주세요'); return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';
    try {
      // OneSignal 구독 연동
      try {
        await new Promise(resolve => {
          window.OneSignalDeferred = window.OneSignalDeferred || [];
          window.OneSignalDeferred.push(async (OS) => {
            try { await OS.init({ appId: ONESIGNAL_APP_ID }); await OS.login(userId); } catch {}
            resolve();
          });
        });
      } catch {}

      await saveNotificationSettings(userId, { enabled, days, send_time, night_consent }, userId);
      closeNotificationModal();
      if (typeof onSaved === 'function') onSaved();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '동의하고 저장하기';
    }
  });
}

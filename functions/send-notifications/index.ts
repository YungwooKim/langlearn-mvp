// send-notifications Edge Function
// 매 시각 cron 호출 → 알림 대상 조회 → 코치 톤별 문구로 OneSignal 푸시 발송
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);
const onesignalKey = Deno.env.get('ONESIGNAL_REST_API_KEY')!;
const ONESIGNAL_APP_ID = '1a1a5412-8959-4c86-8245-eb505749125f';

/** 플레이스홀더 치환 */
function fillTemplate(tpl: string, vars: { goal: string; remaining: number; plan: string; purpose: string }): string {
  return tpl
    .replace(/\{goal\}/g, vars.goal)
    .replace(/\{remaining\}/g, String(vars.remaining))
    .replace(/\{plan\}/g, vars.plan || vars.goal)
    .replace(/\{purpose\}/g, vars.purpose || '');
}

Deno.serve(async () => {
  try {
    // KST 기준 현재 요일·시간 계산
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const p_day = dayNames[now.getDay()];
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = now.getMinutes() < 30 ? '00' : '30';
    const p_time = `${hh}:${mm}`;

    // 발송 대상 조회 (확장된 RPC: coach_key, purpose_category, plan_label 포함)
    const { data: targets, error: tErr } = await supabase
      .rpc('get_notification_targets', { p_day, p_time });
    if (tErr) throw tErr;
    if (!targets || targets.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: '대상 없음' }), { status: 200 });
    }

    // 코치 템플릿 전체 로드 (push 또는 both 채널)
    const { data: allTemplates } = await supabase
      .from('coach_message_templates')
      .select('*')
      .in('channel', ['push', 'both'])
      .order('sort_order');

    // 코치별 템플릿 맵 구성
    const templateMap: Record<string, string[]> = {};
    for (const t of allTemplates || []) {
      if (!templateMap[t.coach_key]) templateMap[t.coach_key] = [];
      templateMap[t.coach_key].push(t.template);
    }

    // user별 잔여 최대 역량 선택 후 코치 톤 문구 적용
    const userBest: Record<string, typeof targets[0]> = {};
    for (const item of targets) {
      const remaining = Number(item.total_sessions) - Number(item.completed_sessions);
      const prev = userBest[item.user_id];
      const prevRemaining = prev
        ? Number(prev.total_sessions) - Number(prev.completed_sessions)
        : -1;
      if (remaining > prevRemaining) userBest[item.user_id] = item;
    }

    let sent = 0;
    const errors: string[] = [];

    for (const item of Object.values(userBest)) {
      const remaining = Number(item.total_sessions) - Number(item.completed_sessions);
      const coachKey = item.coach_key || 'system';
      const templates = templateMap[coachKey] || templateMap['system'] || [];

      // 템플릿이 없으면 기본 문구
      let message: string;
      if (templates.length > 0) {
        const tpl = templates[sent % templates.length]; // 라운드 로빈 선택
        message = fillTemplate(tpl, {
          goal: item.goal_title,
          remaining,
          plan: item.plan_label || item.goal_title,
          purpose: item.purpose_category || ''
        });
      } else {
        message = `${item.goal_title}까지 ${remaining}강 남았어요 💪`;
      }

      // OneSignal 발송
      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${onesignalKey}`
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          include_aliases: { external_id: [item.onesignal_external_id] },
          target_channel: 'push',
          url: 'https://mvp-app-plum.vercel.app/home.html',
          headings: { ko: 'LangLearn 🌐', en: 'LangLearn' },
          contents: { ko: message, en: message }
        })
      });

      if (res.ok) {
        sent++;
      } else {
        const body = await res.text();
        errors.push(`${item.user_id}: ${body}`);
      }
    }

    return new Response(
      JSON.stringify({ sent, errors: errors.length ? errors : undefined }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

// Supabase 클라이언트 초기화
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://acybtrpvwshcnvzjuthp.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjeWJ0cnB2d3NoY252emp1dGhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMTc1OTQsImV4cCI6MjA5NzU5MzU5NH0.UR0eG_AoCWiF9-N_fm_gF712L29w4VKcxuPjwOHYVbE';
export const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;
export const ONESIGNAL_APP_ID = '1a1a5412-8959-4c86-8245-eb505749125f';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

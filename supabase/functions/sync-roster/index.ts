import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// 구글 시트("웹에 게시" CSV)의 날짜별 담당 명단을 읽어 roster_dates를 통째로 갱신합니다.
// 시트 주소는 서버 전용 테이블 app_config(key='roster_sheet_csv_url')에 저장합니다 (사이트 코드에 넣지 않음).
// 시트 형식: 날짜 | 요일(선택) | 교무실 | 학번1 | 이름1 | 학번2 | 이름2 …

const PLACES = ["1학년 1교무실", "1학년 2교무실", "2학년 1교무실", "2학년 2교무실", "3학년 교무실"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((s) => s.trim()));
}

const normPlace = (s: string) => {
  const k = s.replace(/\s/g, "").replace(/^(\d)-(\d)$/, "$1학년$2교무실").replace(/^3학년$/, "3학년교무실");
  return PLACES.find((p) => p.replace(/\s/g, "") === k) ?? null;
};

function todayKST() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};
// "2026-10-27", "2026. 10. 27", "2026/10/27", "10/27(화)", "10월 27일" 등
function parseDate(s: string): string | null {
  let m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (!m) return null;
  const t = todayKST(), y = +t.slice(0, 4);
  let out = iso(y, +m[1], +m[2]);
  if (!out) return null;
  const diff = (Date.parse(out) - Date.parse(t)) / 864e5;
  if (diff < -180) out = iso(y + 1, +m[1], +m[2]);
  else if (diff > 180) out = iso(y - 1, +m[1], +m[2]);
  return out;
}

// 학번·이름을 "20512 김하늘" 형태로 묶음
function normEntries(tokens: string[]): string[] {
  const parts = tokens.flatMap((t) => t.replace(/[()]/g, " ").split(/\s+/)).filter(Boolean);
  const isNo = (t: string) => /^\d{3,6}$/.test(t);
  const firstNo = parts.findIndex(isNo), firstName = parts.findIndex((t) => !isNo(t));
  const noFirst = firstNo !== -1 && firstNo < firstName;
  const out: string[] = [];
  for (let k = 0; k < parts.length; k++) {
    const t = parts[k], next = parts[k + 1];
    if (noFirst && isNo(t) && next && !isNo(next)) { out.push(`${t} ${next}`); k++; }
    else if (!noFirst && !isNo(t) && next && isNo(next)) { out.push(`${next} ${t}`); k++; }
    else out.push(t);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const record = async (ok: boolean, message: string, rows_loaded: number | null = null) => {
    await admin.from("sync_status").update({ last_run_at: new Date().toISOString(), ok, message, rows_loaded }).eq("id", 1);
    return json({ ok, message, rows_loaded }, ok ? 200 : 400);
  };

  const { data: cfg } = await admin.from("app_config").select("value").eq("key", "roster_sheet_csv_url").maybeSingle();
  const url = cfg?.value ?? Deno.env.get("ROSTER_SHEET_CSV_URL");
  if (!url) return record(false, "구글 시트 주소가 아직 등록되지 않았어요.");
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) return record(false, "구글 시트 게시 주소가 아니에요.");

  let text: string;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return record(false, `구글 시트를 열지 못했어요 (응답 ${res.status}). '웹에 게시'가 켜져 있는지 확인해 주세요.`);
    text = await res.text();
  } catch {
    return record(false, "구글 시트에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  if (/^\s*<(!doctype|html)/i.test(text)) return record(false, "CSV가 아니라 웹페이지가 왔어요. 게시 형식을 'CSV'로 골라 주세요.");

  const rows = parseCSV(text.replace(/^﻿/, ""));
  const hi = rows.findIndex((r) => r.some((c) => c.replace(/\s/g, "") === "날짜"));
  const header = hi >= 0 ? rows[hi].map((c) => c.replace(/\s/g, "")) : [];
  const dateCol = header.indexOf("날짜"), placeCol = header.indexOf("교무실");
  const skipCols = new Set(header.map((h, i) => (/^(요일|비고|메모)$/.test(h) ? i : -1)).filter((i) => i >= 0));

  const map = new Map<string, { duty_date: string; place: string; names: string[] }>();
  const bad: number[] = [];
  rows.slice(hi + 1).forEach((r, idx) => {
    if (!r.some(Boolean)) return;
    let date: string | null = null, place: string | null = null;
    const rest: string[] = [];
    r.forEach((c, i) => {
      if (!c) return;
      if (i === dateCol || (dateCol < 0 && !date && parseDate(c))) { date ??= parseDate(c); return; }
      if (i === placeCol || (placeCol < 0 && !place && normPlace(c))) { place ??= normPlace(c); return; }
      if (skipCols.has(i) || /^[월화수목금토일](요일)?$/.test(c)) return;
      rest.push(c);
    });
    if (!date || !place) { bad.push(hi + idx + 2); return; }
    const names = normEntries(rest);
    if (!names.length) return; // 비어 있으면 요일 명단을 씀
    const key = `${date}|${place}`;
    const prev = map.get(key);
    if (prev) prev.names.push(...names); else map.set(key, { duty_date: date, place, names });
  });

  const list = [...map.values()];
  if (!list.length && bad.length) return record(false, `명단을 읽지 못했어요. 날짜·교무실 칸을 확인해 주세요 (${bad.slice(0, 3).join(", ")}번째 줄 등).`);

  const { error: e1 } = await admin.from("roster_dates").delete().gte("duty_date", "1900-01-01");
  if (e1) return record(false, "기존 명단을 정리하지 못했어요.");
  if (list.length) {
    const { error: e2 } = await admin.from("roster_dates").insert(list);
    if (e2) return record(false, "명단을 저장하지 못했어요.");
  }
  const note = bad.length ? ` 날짜나 교무실을 알 수 없는 ${bad.length}줄은 건너뛰었어요 (${bad.slice(0, 3).join(", ")}번째 줄).` : "";
  return record(true, `날짜별 명단 ${list.length}건을 불러왔어요.${note}`, list.length);
});

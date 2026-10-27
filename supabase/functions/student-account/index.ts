import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// 담당 학생(반장·부반장) 개인 계정 관리. 선생님 계정만 호출할 수 있습니다.
// 로그인 아이디는 학번이고, 실제 계정 이메일은 sekyo.<학번>@example.com 입니다(메일은 보내지 않음).
// body:
//   { action: "list" }
//   { action: "sync_from_roster" }                 명단에 있는 학번 중 계정이 없는 학생 계정 만들기
//   { action: "reset_password", student_no }        새 처음 비밀번호 발급
//   { action: "set_active", student_no, active }    사용 중지 / 다시 사용

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const emailOf = (no: string) => `sekyo.${no}@example.com`;

const WORDS = ["sun", "tree", "book", "star", "rain", "leaf", "wind", "moon", "snow", "lake"];
function initialPassword() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `${WORDS[a[0] % WORDS.length]}${1000 + (a[1] % 9000)}`; // 예: tree4821
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: role } = await caller.rpc("my_role");
  if (role !== "teacher") return json({ ok: false, message: "선생님 계정으로 로그인해야 해요." }, 403);

  let body: { action?: string; student_no?: string; active?: boolean } = {};
  try { body = await req.json(); } catch { /* 빈 요청 */ }

  const allUsers = async () => {
    const out = [];
    for (let page = 1; page < 20; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      out.push(...(data?.users ?? []));
      if (!data || data.users.length < 1000) break;
    }
    return out;
  };

  if (body.action === "list") {
    const [{ data: rows }, users] = await Promise.all([
      admin.from("staff").select("student_no, student_name, active, must_change_pw, email").eq("role", "student").order("student_no"),
      allUsers(),
    ]);
    const last = new Map(users.map((u) => [u.email?.toLowerCase(), u.last_sign_in_at]));
    return json({ ok: true, students: (rows ?? []).map((r) => ({ ...r, last_sign_in_at: last.get(r.email.toLowerCase()) ?? null, email: undefined })) });
  }

  if (body.action === "sync_from_roster") {
    const [{ data: d1 }, { data: d2 }, { data: existing }] = await Promise.all([
      admin.from("roster_dates").select("names"),
      admin.from("roster").select("names"),
      admin.from("staff").select("student_no, student_name").eq("role", "student"),
    ]);
    const people = new Map<string, string>(); // 학번 → 이름
    const noId = new Set<string>();
    [...(d1 ?? []), ...(d2 ?? [])].forEach((r) => (r.names ?? []).forEach((s: string) => {
      const m = s.match(/^(\d{3,6})\s+(.+)$/);
      if (m) people.set(m[1], m[2].trim()); else noId.add(s);
    }));
    const have = new Map((existing ?? []).map((r) => [r.student_no, r.student_name]));
    const created: { student_no: string; student_name: string; password: string }[] = [];
    const renamed: string[] = [];
    const failed: string[] = [];
    for (const [no, name] of people) {
      if (have.has(no)) {
        if (have.get(no) !== name) {
          await admin.from("staff").update({ student_name: name }).eq("student_no", no);
          renamed.push(`${no} ${name}`);
        }
        continue;
      }
      const password = initialPassword();
      const { error } = await admin.auth.admin.createUser({ email: emailOf(no), password, email_confirm: true });
      if (error && !/already/i.test(error.message)) { failed.push(`${no} ${name}`); continue; }
      if (error) { // 계정은 있는데 담당자 목록에만 없는 경우 → 비밀번호 새로 지정
        const u = (await allUsers()).find((x) => x.email?.toLowerCase() === emailOf(no));
        if (!u) { failed.push(`${no} ${name}`); continue; }
        await admin.auth.admin.updateUserById(u.id, { password });
      }
      const { error: e2 } = await admin.from("staff").insert({
        email: emailOf(no), role: "student", student_no: no, student_name: name, note: "담당 학생", must_change_pw: true,
      });
      if (e2) { failed.push(`${no} ${name}`); continue; }
      created.push({ student_no: no, student_name: name, password });
    }
    created.sort((a, b) => a.student_no.localeCompare(b.student_no));
    return json({ ok: true, created, renamed, failed, without_id: [...noId] });
  }

  const no = String(body.student_no ?? "").trim();
  if (!/^\d{3,6}$/.test(no)) return json({ ok: false, message: "학번을 확인해 주세요." }, 400);
  const { data: st } = await admin.from("staff").select("student_no, student_name").eq("role", "student").eq("student_no", no).maybeSingle();
  if (!st) return json({ ok: false, message: "그 학번의 계정이 없어요." }, 404);
  const user = (await allUsers()).find((x) => x.email?.toLowerCase() === emailOf(no));

  if (body.action === "reset_password") {
    if (!user) return json({ ok: false, message: "계정을 찾지 못했어요." }, 404);
    const password = initialPassword();
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) return json({ ok: false, message: "비밀번호를 바꾸지 못했어요." }, 500);
    await admin.from("staff").update({ must_change_pw: true }).eq("student_no", no);
    await admin.rpc("revoke_user_sessions", { uid: user.id });
    return json({ ok: true, student_no: no, student_name: st.student_name, password });
  }

  if (body.action === "set_active") {
    const active = !!body.active;
    await admin.from("staff").update({ active }).eq("student_no", no);
    if (!active && user) await admin.rpc("revoke_user_sessions", { uid: user.id });
    return json({ ok: true, message: active ? `${no} ${st.student_name} 계정을 다시 쓸 수 있게 했어요.` : `${no} ${st.student_name} 계정을 사용 중지했어요.` });
  }

  return json({ ok: false, message: "알 수 없는 요청이에요." }, 400);
});

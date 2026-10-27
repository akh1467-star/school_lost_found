import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// 학생 담당 공용 계정(아이디 student)을 만들거나 비밀번호를 바꿉니다. 선생님 계정만 호출할 수 있습니다.
// body: { action: "status" } | { action: "set_password", password: string }

const STUDENT_EMAIL = "sekyo.student@example.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 호출한 사람이 선생님인지 확인
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: role } = await caller.rpc("my_role");
  if (role !== "teacher") return json({ ok: false, message: "선생님 계정으로 로그인해야 해요." }, 403);

  let body: { action?: string; password?: string } = {};
  try { body = await req.json(); } catch { /* 빈 요청 */ }

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === STUDENT_EMAIL);

  if (body.action === "status") {
    return json({ ok: true, exists: !!existing, updated_at: existing?.updated_at ?? null });
  }
  if (body.action !== "set_password") return json({ ok: false, message: "알 수 없는 요청이에요." }, 400);

  const pw = String(body.password ?? "");
  if (pw.length < 8) return json({ ok: false, message: "비밀번호는 8자 이상이어야 해요." }, 400);

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password: pw });
    if (error) return json({ ok: false, message: "비밀번호를 바꾸지 못했어요." }, 500);
    // 예전 비밀번호로 로그인돼 있던 기기들은 모두 로그아웃시킴
    await admin.rpc("revoke_user_sessions", { uid: existing.id });
  } else {
    const { error } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: pw, email_confirm: true });
    if (error) return json({ ok: false, message: "학생 계정을 만들지 못했어요." }, 500);
  }
  const { error: e2 } = await admin.from("staff").upsert({ email: STUDENT_EMAIL, note: "학생 담당 공용 계정", role: "student" });
  if (e2) return json({ ok: false, message: "담당자 목록에 등록하지 못했어요." }, 500);
  return json({ ok: true, message: existing ? "학생 계정 비밀번호를 바꿨어요." : "학생 계정을 만들었어요." });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// 입고일 + 7일이 된 분실물(폐기일 당일 저녁 실행)과 그 사진을 삭제합니다.
// 만료된 항목만 지우므로 여러 번 호출되어도 안전합니다.
Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 7);
  const cutoff = kst.toISOString().slice(0, 10);

  const { data: rows, error } = await admin.from("items").select("id, photo_path").lte("received_on", cutoff);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const paths = (rows ?? []).map((r) => r.photo_path).filter(Boolean) as string[];
  if (paths.length) {
    const { error: e2 } = await admin.storage.from("photos").remove(paths);
    if (e2) return new Response(JSON.stringify({ error: e2.message }), { status: 500 });
  }
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length) {
    const { error: e3 } = await admin.from("items").delete().in("id", ids);
    if (e3) return new Response(JSON.stringify({ error: e3.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ cutoff, deleted: ids.length, photos: paths.length }), {
    headers: { "Content-Type": "application/json" },
  });
});

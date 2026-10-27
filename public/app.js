const sb = window.supabase.createClient(window.LF_CONFIG.url, window.LF_CONFIG.key);

const PLACES = ["1학년 1교무실", "1학년 2교무실", "2학년 1교무실", "2학년 2교무실", "3학년 교무실"];
const CATS = { clothes: "옷·체육복", bottle: "물병·텀블러", stationery: "필기구·필통", book: "책·공책", bag: "가방·주머니", idcard: "학생증", card: "카드", accessory: "액세서리", cosmetic: "화장품", device: "이어폰·전자기기", umbrella: "우산", etc: "기타" };
const NO_PHOTO = ["idcard", "card"];
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const S = 'viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"';
const ICON = {
  clothes: `<svg ${S}><path d="M17 8l-9 6 4 8 4-2v20h16V20l4 2 4-8-9-6c-1 3-4 5-7 5s-6-2-7-5z"/></svg>`,
  bottle: `<svg ${S}><rect x="19" y="5" width="10" height="6" rx="1"/><path d="M18 11h12l2 6v24a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V17z"/><path d="M16 24h16"/></svg>`,
  stationery: `<svg ${S}><rect x="6" y="16" width="36" height="16" rx="6"/><path d="M14 16v-2M34 16v-2M6 24h36"/></svg>`,
  book: `<svg ${S}><path d="M24 12c-4-3-10-4-16-3v28c6-1 12 0 16 3 4-3 10-4 16-3V9c-6-1-12 0-16 3zM24 12v28"/></svg>`,
  bag: `<svg ${S}><path d="M17 14v-2a7 7 0 0 1 14 0v2"/><rect x="9" y="14" width="30" height="27" rx="5"/><path d="M9 24h30M22 24v4h4v-4"/></svg>`,
  idcard: `<svg ${S}><rect x="6" y="11" width="36" height="26" rx="4"/><circle cx="17" cy="22" r="4"/><path d="M11 32c1-3 3-5 6-5s5 2 6 5M27 20h9M27 26h7"/></svg>`,
  card: `<svg ${S}><rect x="6" y="12" width="36" height="24" rx="4"/><path d="M6 19h36M12 30h8"/></svg>`,
  accessory: `<svg ${S}><circle cx="24" cy="29" r="12"/><path d="M18 12l6-6 6 6-6 5z"/></svg>`,
  cosmetic: `<svg ${S}><rect x="16" y="24" width="16" height="18" rx="2"/><path d="M19 24V14l10-6v16"/></svg>`,
  device: `<svg ${S}><rect x="8" y="16" width="32" height="22" rx="10"/><circle cx="18" cy="27" r="3"/><circle cx="30" cy="27" r="3"/></svg>`,
  umbrella: `<svg ${S}><path d="M6 24a18 18 0 0 1 36 0zM24 6v2M24 24v13a4 4 0 0 1-8 0"/></svg>`,
  etc: `<svg ${S}><path d="M24 6l16 9v18l-16 9-16-9V15z"/><path d="M8 15l16 9 16-9M24 24v18"/></svg>`,
};
const DROP_TXT = '사진 찍기 / 고르기<br><small>학생증·카드류는 사진 대신 글로만</small>';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- 날짜 (한국 시간 기준, 'YYYY-MM-DD' 문자열로 다룸) ----------
function todayKST() {
  const d = new Date(Date.now() + 9 * 3600e3);
  return d.toISOString().slice(0, 10);
}
const toDate = (s) => new Date(s + "T00:00:00Z");
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (s) => { const d = toDate(s); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const weekday = (s) => toDate(s).getUTCDay();
const leftDays = (it) => Math.round((toDate(addDays(it.received_on, 7)) - toDate(todayKST())) / 864e5);

function chip(it) {
  if (it.claimed) return '<span class="chip done">주인 찾음</span>';
  const n = leftDays(it);
  if (n <= 0) return '<span class="chip soon">오늘 폐기 예정</span>';
  if (n <= 2) return `<span class="chip soon">폐기까지 ${n}일</span>`;
  return `<span class="chip">폐기까지 ${n}일</span>`;
}
const photoUrl = (p) => sb.storage.from("photos").getPublicUrl(p).data.publicUrl;
const pic = (it) => it.photo_path ? `<img src="${esc(photoUrl(it.photo_path))}" alt="${esc(it.name)} 사진" loading="lazy">` : (ICON[it.category] || ICON.etc);

function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2400); }
function showErr(el, msg) { el.textContent = msg; el.hidden = !msg; }

// ---------- 학생용 ----------
let items = [], place = "전체", cat = "all";

async function loadPublic() {
  const { data, error } = await sb.from("items").select("*").eq("claimed", false).gte("received_on", addDays(todayKST(), -7)).order("received_on", { ascending: false }).order("id", { ascending: false });
  if (error) { $("#grid").innerHTML = '<p class="empty">목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>'; return; }
  items = data; renderPlaces(); renderGrid();
}
function renderPlaces() {
  $("#places").innerHTML = ["전체", ...PLACES].map((p) => {
    const n = p === "전체" ? items.length : items.filter((i) => i.place === p).length;
    return `<button type="button" aria-pressed="${p === place}" data-p="${p}">${p}<span class="n">${n}</span></button>`;
  }).join("");
}
function renderGrid() {
  const q = $("#q").value.trim();
  const list = items.filter((i) => (place === "전체" || i.place === place) && (cat === "all" || i.category === cat) && (!q || (i.name + (i.description || "")).includes(q)));
  $("#grid").innerHTML = list.length ? list.map((it) => `
    <article class="card">
      <div class="photo-box">${pic(it)}<span class="tag">${fmt(it.received_on)} 입고</span></div>
      <div class="body">
        <h3 class="title">${esc(it.name)}</h3>
        ${it.description ? `<p class="desc">${esc(it.description)}</p>` : ""}
        <dl class="meta"><dt>보관 장소</dt><dd>${esc(it.place)}</dd><dt>폐기 예정</dt><dd>${fmt(addDays(it.received_on, 7))}</dd></dl>
        ${chip(it)}
      </div>
    </article>`).join("")
    : `<p class="empty">${items.length ? "조건에 맞는 물건이 없어요. 다른 장소나 종류를 골라 보세요." : "지금 보관 중인 분실물이 없어요."}</p>`;
}

// ---------- 담당자용 ----------
// roster[place][weekday] = [이름…]
let adminItems = [], roster = {}, rPlace = PLACES[0], photoBlob = null;
const normPlace = (s) => {
  const k = String(s).replace(/\s/g, "").replace(/^(\d)-(\d)$/, "$1학년$2교무실").replace(/^3학년$/, "3학년교무실");
  return PLACES.find((p) => p.replace(/\s/g, "") === k) || null;
};

// dated[place][YYYY-MM-DD] = [이름…] (구글 시트에서 동기화된 날짜별 명단)
let dated = {}, syncStatus = null;
const SCHEDULE_DAYS = 10; // 오늘부터 수업일 10일(약 2주) 표시

async function loadAdmin() {
  const t = todayKST();
  const [{ data: its, error: e1 }, { data: ros }, { data: dts }, { data: st }] = await Promise.all([
    sb.from("items").select("*").gte("received_on", addDays(t, -7)).order("received_on").order("id"),
    sb.from("roster").select("*"),
    sb.from("roster_dates").select("*").gte("duty_date", t).lte("duty_date", addDays(t, 31)),
    sb.from("sync_status").select("*").maybeSingle(),
  ]);
  if (e1) { toast("목록을 불러오지 못했어요."); return; }
  adminItems = its;
  roster = {}; (ros || []).forEach((r) => ((roster[r.place] ||= {})[r.weekday] = r.names || []));
  dated = {}; (dts || []).forEach((r) => ((dated[r.place] ||= {})[r.duty_date] = r.names || []));
  syncStatus = st;
  renderList(); renderDuty(); renderSync();
  $("#roster-text").value = rosterToText();
}
// 그날 담당: 날짜별 명단이 있으면 그것, 없으면 요일 기본 명단
function dutyFor(place, date) {
  const d = dated[place]?.[date];
  if (d?.length) return { names: d, src: "sheet" };
  const w = weekday(date);
  return { names: w >= 1 && w <= 5 ? namesFor(place, w) : [], src: "weekly" };
}
function schoolDays(from, n) {
  const out = []; let d = from;
  while (out.length < n) { const w = weekday(d); if (w >= 1 && w <= 5) out.push(d); d = addDays(d, 1); }
  return out;
}
function renderSchedule() {
  const t = todayKST();
  $("#schedule").innerHTML = schoolDays(t, SCHEDULE_DAYS).map((d) => {
    const { names, src } = dutyFor(rPlace, d);
    return `<div class="sday${d === t ? " today" : ""}">
      <div class="dt"><b>${fmt(d)}${d === t ? " 오늘" : ""}</b><span class="src${src === "sheet" ? " sheet" : ""}">${src === "sheet" ? "구글 시트" : "요일 명단"}</span></div>
      <span class="nm${names.length ? "" : " empty-n"}">${names.length ? names.map(personHTML).join(", ") : "담당자 없음"}</span>
    </div>`;
  }).join("");
}
function renderSync() {
  const el = $("#sync-msg"), s = syncStatus;
  if (!s?.last_run_at) { el.textContent = "아직 구글 시트를 불러온 적이 없어요. 매일 아침 6시 30분에 자동으로 불러옵니다."; el.className = "sync-msg"; return; }
  const when = new Date(s.last_run_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
  el.textContent = `마지막 불러오기 ${when} · ${s.message}`;
  el.className = "sync-msg" + (s.ok ? "" : " bad");
}
function renderList() {
  $("#cnt").textContent = adminItems.filter((i) => !i.claimed).length + "개";
  $("#list").innerHTML = adminItems.length ? adminItems.map((it) => `
    <div class="row">
      <div class="th">${pic(it)}</div>
      <div style="min-width:0"><div class="t">${esc(it.name)}</div><div class="s">${esc(it.place)} · ${fmt(it.received_on)} 입고 → ${fmt(addDays(it.received_on, 7))} 폐기</div></div>
      <div class="b" data-id="${it.id}">${it.claimed ? '<span class="chip done">주인 찾음</span>' : '<button class="btn" type="button" data-a="done">주인 찾음</button><button class="btn danger" type="button" data-a="del">삭제</button>'}</div>
    </div>`).join("") : '<p class="note">보관 중인 물건이 없어요.</p>';
}
const namesFor = (place, wd) => roster[place]?.[wd] || [];
function renderDuty() {
  const t = todayKST(), wd = weekday(t), place = $("#f-place").value, { names } = dutyFor(place, t);
  $("#duty").innerHTML = `<span>${fmt(t)} ${esc(place)} 담당</span>` +
    (wd < 1 || wd > 5 ? '<span class="none">주말에는 담당자가 없어요</span>'
      : names.length ? `<span class="who">${names.map(personHTML).join(", ")}</span>` : '<span class="none">이 교무실의 오늘 담당자가 비어 있어요. 구글 시트나 요일 명단을 확인해 주세요.</span>');
  renderSchedule();
  $("#r-places").innerHTML = PLACES.map((p) => `<button type="button" aria-pressed="${p === rPlace}" data-p="${p}">${p}</button>`).join("");
  $("#roster-grid").innerHTML = [1, 2, 3, 4, 5].map((i) => {
    const nm = namesFor(rPlace, i);
    return `<div class="day${i === wd ? " today" : ""}"><span class="dn">${WD[i]}${i === wd ? " · 오늘" : ""}</span><span class="nm${nm.length ? "" : " empty-n"}">${nm.length ? nm.map(personHTML).join(", ") : "미등록"}</span></div>`;
  }).join("");
  $("#r-label").textContent = `${rPlace} 명단 (엑셀에서 복사해 붙여넣어도 됩니다)`;
}
function rosterToText() { return [1, 2, 3, 4, 5].map((i) => `${WD[i]}, ${namesFor(rPlace, i).join(", ")}`).join("\n"); }
// 줄 형식: "월, 이름…" (선택한 교무실) 또는 "1학년 1교무실, 월, 이름…"
function parseRoster(text) {
  const out = {}, bad = [];
  text.split(/\r?\n/).forEach((line) => {
    let cells = line.split(/[,\t;]+/).map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    if (!cells.length) return;
    let place = normPlace(cells[0]);
    if (place) cells = cells.slice(1); else place = rPlace;
    if (!cells.length) return;
    let first = cells[0], rest = cells.slice(1);
    if (!rest.length && /\s/.test(first)) { const p = first.split(/\s+/); first = p[0]; rest = p.slice(1); }
    const i = WD.indexOf(first.replace(/요일$/, "").charAt(0));
    if (i < 1 || i > 5) { if (!/^(요일|교무실|장소)/.test(first)) bad.push(line.trim()); return; }
    ((out[place] ||= {})[i] ||= []).push(...normEntries(rest));
  });
  return { out, bad };
}
// "20512 김하늘", "김하늘(20512)", "김하늘 20512", 학번·이름이 다른 칸인 경우 모두 "20512 김하늘"로 맞춤
function normEntries(tokens) {
  const parts = tokens.flatMap((t) => t.replace(/[()]/g, " ").split(/\s+/)).filter(Boolean);
  const isNo = (t) => /^\d{3,6}$/.test(t);
  const firstNo = parts.findIndex(isNo), firstName = parts.findIndex((t) => !isNo(t));
  const noFirst = firstNo !== -1 && firstNo < firstName; // 이 줄이 "학번 이름" 순서인지
  const out = [];
  for (let k = 0; k < parts.length; k++) {
    const t = parts[k], next = parts[k + 1];
    if (noFirst && isNo(t) && next && !isNo(next)) { out.push(`${t} ${next}`); k++; }
    else if (!noFirst && !isNo(t) && next && isNo(next)) { out.push(`${next} ${t}`); k++; }
    else out.push(t);
  }
  return out;
}
const personHTML = (s) => {
  const m = String(s).match(/^(\d{3,6})\s+(.+)$/);
  return m ? `<span class="sid">${esc(m[1])}</span> ${esc(m[2])}` : esc(s);
};
async function saveRoster(text) {
  const { out, bad } = parseRoster(text), err = $("#roster-err"), places = Object.keys(out);
  if (!places.length) { showErr(err, '요일을 찾지 못했어요. 각 줄을 "월, 이름" 또는 "1학년 1교무실, 월, 이름"처럼 적어 주세요.'); return; }
  const now = new Date().toISOString();
  const rows = places.flatMap((p) => [1, 2, 3, 4, 5].map((w) => ({ place: p, weekday: w, names: out[p][w] || [], updated_at: now })));
  const { error } = await sb.from("roster").upsert(rows);
  if (error) { showErr(err, "명단을 저장하지 못했어요. 다시 로그인한 뒤 시도해 주세요."); return; }
  places.forEach((p) => (roster[p] = out[p]));
  if (!places.includes(rPlace)) rPlace = places[0];
  const noId = places.flatMap((p) => Object.values(out[p]).flat()).filter((s) => !/^\d{3,6}\s/.test(s));
  const msgs = [];
  if (bad.length) msgs.push(`알아볼 수 없는 줄 ${bad.length}개는 건너뛰었어요: ${bad.slice(0, 2).join(" / ")}`);
  if (noId.length) msgs.push(`학번이 없는 이름 ${noId.length}명: ${noId.slice(0, 3).join(", ")}${noId.length > 3 ? " 등" : ""}. 동명이인이 없는지 확인해 주세요.`);
  showErr(err, msgs.join(" "));
  $("#roster-text").value = rosterToText(); renderDuty();
  toast(places.length > 1 ? `교무실 ${places.length}곳 명단을 저장했어요.` : `${places[0]} 명단을 저장했어요.`);
}

// 사진은 가로 1000px 이하 JPEG로 줄여서 올림 (저장 공간 절약)
function shrink(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const s = Math.min(1, 1000 / im.width), c = document.createElement("canvas");
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? res(b) : rej(new Error("이미지 변환 실패"))), "image/jpeg", 0.78);
    };
    im.onerror = () => rej(new Error("이미지를 열 수 없음"));
    im.src = url;
  });
}
function resetPhoto() { photoBlob = null; $("#drop-txt").innerHTML = DROP_TXT; }

// ---------- 화면 전환 ----------
// 비밀번호 재설정 메일의 링크로 들어온 경우 (주소 끝에 type=recovery)
let resetMode = /type=recovery/.test(location.hash);
function showReset(email) {
  $("#v-stu").hidden = true; $("#v-stu").style.display = ""; $("#v-adm").hidden = true;
  $("#v-login").hidden = false; $("#login-form").hidden = true; $("#reset-form").hidden = false;
  $("#reset-who").textContent = email ? `${email} 계정의 새 비밀번호를 정해 주세요.` : "";
  $("#sub").textContent = "담당자 비밀번호를 새로 정하는 화면입니다.";
  $("#r-pw").focus();
}

async function route() {
  if (resetMode) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) return showReset(session.user.email);
    if (!/access_token|type=recovery/.test(location.hash)) resetMode = false; // 링크가 만료된 경우
    else return; // 세션 처리 중 → onAuthStateChange에서 다시 부름
  }
  $("#login-form").hidden = false; $("#reset-form").hidden = true;
  const admin = location.hash === "#admin";
  $("#v-stu").hidden = admin; $("#v-stu").style.display = admin ? "" : "flex";
  $("#nav").textContent = admin ? "분실물 찾아보기" : "담당자 페이지";
  $("#nav").href = admin ? "#" : "#admin";
  $("#sub").textContent = admin ? "분실물을 올리고 관리하는 담당자 화면입니다." : "잃어버린 물건, 교무실 분실물함에 있는지 먼저 확인하세요.";
  if (!admin) { $("#v-login").hidden = true; $("#v-adm").hidden = true; loadPublic(); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { $("#v-login").hidden = false; $("#v-adm").hidden = true; return; }
  const { data: ok } = await sb.rpc("is_staff");
  if (!ok) {
    $("#v-login").hidden = false; $("#v-adm").hidden = true;
    showErr($("#l-err"), `${session.user.email} 계정은 담당자로 등록되어 있지 않아요. 담당 선생님께 문의해 주세요.`);
    await sb.auth.signOut(); return;
  }
  $("#v-login").hidden = true; $("#v-adm").hidden = false; $("#v-adm").style.display = "flex";
  $("#who").textContent = `${session.user.email}로 로그인됨`;
  loadAdmin();
}

// ---------- 이벤트 ----------
$("#cat").innerHTML = '<option value="all">모든 종류</option>' + Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$("#f-cat").innerHTML = Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$("#f-place").innerHTML = PLACES.map((p) => `<option>${p}</option>`).join("");
resetPhoto();

$("#places").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; place = b.dataset.p; renderPlaces(); renderGrid(); });
$("#q").addEventListener("input", renderGrid);
$("#cat").addEventListener("change", (e) => { cat = e.target.value; renderGrid(); });
window.addEventListener("hashchange", route);

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#l-btn"); btn.disabled = true; showErr($("#l-err"), "");
  const { error } = await sb.auth.signInWithPassword({ email: $("#l-email").value.trim(), password: $("#l-pw").value });
  btn.disabled = false;
  if (error) { showErr($("#l-err"), "이메일이나 비밀번호가 맞지 않아요."); return; }
  $("#l-pw").value = ""; route();
});
$("#logout").addEventListener("click", async () => { await sb.auth.signOut(); route(); });
$("#chpw").addEventListener("click", () => { resetMode = true; route(); });

sb.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") { resetMode = true; setTimeout(route, 0); }
});
$("#forgot").addEventListener("click", async () => {
  const email = $("#l-email").value.trim(), err = $("#l-err");
  if (!email) { showErr(err, "위에 담당자 이메일을 먼저 적고 다시 눌러 주세요."); $("#l-email").focus(); return; }
  const btn = $("#forgot"); btn.disabled = true;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  btn.disabled = false;
  if (error) {
    showErr(err, /rate|limit|seconds/i.test(error.message) ? "메일을 너무 자주 요청했어요. 잠시 후 다시 시도해 주세요." : "메일을 보내지 못했어요. 이메일 주소를 확인해 주세요.");
    return;
  }
  err.hidden = true; toast(`${email}로 재설정 메일을 보냈어요. 메일의 링크를 눌러 주세요.`);
});
$("#reset-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const a = $("#r-pw").value, b = $("#r-pw2").value, err = $("#r-err");
  if (a !== b) { showErr(err, "두 비밀번호가 서로 달라요. 다시 입력해 주세요."); return; }
  const btn = $("#r-btn"); btn.disabled = true;
  const { error } = await sb.auth.updateUser({ password: a });
  btn.disabled = false;
  if (error) { showErr(err, /different|same/i.test(error.message) ? "지금 쓰는 비밀번호와 다른 비밀번호를 정해 주세요." : "비밀번호를 바꾸지 못했어요. 8자 이상인지 확인해 주세요."); return; }
  e.target.reset(); showErr(err, ""); resetMode = false;
  history.replaceState(null, "", location.pathname + "#admin");
  toast("비밀번호를 바꿨어요."); route();
});

$("#f-cat").addEventListener("change", (e) => {
  const no = NO_PHOTO.includes(e.target.value);
  $("#nophoto").hidden = !no; $("#drop").hidden = no; if (no) resetPhoto();
});
$("#file").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    photoBlob = await shrink(f);
    $("#drop-txt").innerHTML = `<img src="${URL.createObjectURL(photoBlob)}" alt="올릴 사진 미리보기">`;
  } catch { resetPhoto(); toast("사진을 열 수 없어요. 다른 사진을 골라 주세요."); }
  e.target.value = "";
});
$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#f-btn"); btn.disabled = true; btn.textContent = "올리는 중…";
  try {
    const today = todayKST(), category = $("#f-cat").value;
    let photo_path = null;
    if (photoBlob && !NO_PHOTO.includes(category)) {
      photo_path = `${today}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("photos").upload(photo_path, photoBlob, { contentType: "image/jpeg" });
      if (error) throw new Error("사진을 올리지 못했어요.");
    }
    const { error } = await sb.from("items").insert({ name: $("#f-name").value.trim(), description: $("#f-desc").value.trim() || null, category, place: $("#f-place").value, photo_path });
    if (error) { if (photo_path) await sb.storage.from("photos").remove([photo_path]); throw new Error("물건을 저장하지 못했어요."); }
    const keepPlace = $("#f-place").value;
    e.target.reset(); $("#f-place").value = keepPlace; resetPhoto(); $("#nophoto").hidden = true; $("#drop").hidden = false;
    toast("올렸어요. 찾아보기 화면에 바로 보입니다."); loadAdmin();
  } catch (err) { toast(err.message + " 다시 시도해 주세요."); }
  finally { btn.disabled = false; btn.textContent = "올리기"; }
});
$("#list").addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const box = b.parentElement, id = +box.dataset.id, it = adminItems.find((i) => i.id === id);
  if (b.dataset.a === "done") {
    const { error } = await sb.from("items").update({ claimed: true }).eq("id", id);
    if (error) return toast("처리하지 못했어요. 다시 시도해 주세요.");
    toast("주인 찾음으로 표시했어요."); loadAdmin();
  } else if (b.dataset.a === "del") {
    box.innerHTML = '<span class="confirm">정말 삭제할까요?</span><button class="btn danger" type="button" data-a="yes">삭제</button><button class="btn" type="button" data-a="no">취소</button>';
  } else if (b.dataset.a === "yes") {
    if (it?.photo_path) await sb.storage.from("photos").remove([it.photo_path]);
    const { error } = await sb.from("items").delete().eq("id", id);
    if (error) return toast("삭제하지 못했어요. 다시 시도해 주세요.");
    toast("삭제했어요."); loadAdmin();
  } else if (b.dataset.a === "no") renderList();
});
$("#f-place").addEventListener("change", renderDuty);
$("#r-places").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  rPlace = b.dataset.p; showErr($("#roster-err"), ""); $("#roster-text").value = rosterToText(); renderDuty();
});
$("#sync-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget; btn.disabled = true; btn.textContent = "불러오는 중…";
  try {
    const { data, error } = await sb.functions.invoke("sync-roster", { body: {} });
    let msg = data?.message;
    if (error && !msg) { try { msg = (await error.context.json()).message; } catch { msg = "불러오지 못했어요. 잠시 후 다시 시도해 주세요."; } }
    toast(msg || "불러왔어요.");
  } finally { btn.disabled = false; btn.textContent = "구글 시트에서 지금 불러오기"; loadAdmin(); }
});
$("#roster-apply").addEventListener("click", () => saveRoster($("#roster-text").value));
$("#roster-file").addEventListener("change", (e) => {
  const f = e.target.files[0]; if (!f) return; const r = new FileReader();
  if (/\.xlsx?$/i.test(f.name)) {
    r.onload = () => {
      try { const wb = XLSX.read(r.result, { type: "array" }); const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]); $("#roster-text").value = csv; saveRoster(csv); }
      catch { showErr($("#roster-err"), "엑셀 파일을 읽지 못했어요. 첫 번째 시트에 명단이 있는지 확인해 주세요."); }
    };
    r.readAsArrayBuffer(f);
  } else { r.onload = () => { $("#roster-text").value = r.result; saveRoster(r.result); }; r.readAsText(f); }
  e.target.value = "";
});

route();

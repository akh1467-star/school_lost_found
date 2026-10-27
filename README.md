# 세교중학교 분실물

학생자치회가 운영하는 교무실 분실물함 안내 사이트입니다.

- 학생: 사이트 첫 화면에서 보관 장소(5곳)·종류·검색으로 분실물 확인
- 담당자: 사이트 아래 **담당자 페이지**(`/#admin`)에서 로그인 후 사진과 함께 분실물 등록, 주인 찾음·삭제 처리, 교무실별 요일 담당 명단 저장

## 운영 규칙

- 요일별 담당자가 하교 전에 분실물함 물건을 올립니다.
- 물건은 들어온 날부터 7일 동안 보입니다. 월요일에 들어온 물건은 다음 주 월요일 저녁 7시에 사진과 함께 자동 삭제됩니다.
- 학생증·카드는 사진을 올리지 않고 글로만 등록합니다.

## 구조

| 부분 | 서비스 |
| --- | --- |
| 화면 (`public/`) | Render Static Site — 이 저장소에 push하면 자동 배포 |
| 분실물 목록·담당 명단 | Supabase 데이터베이스 (`school-lost-and-found` 프로젝트) |
| 사진 | Supabase Storage `photos` 버킷 |
| 담당자 로그인 | Supabase Auth (이메일 + 비밀번호) |
| 7일 자동 폐기 | Supabase Edge Function `cleanup-expired` + 매일 19:00 예약 실행 |

데이터베이스 설정은 `supabase/schema.sql`에 정리되어 있습니다.

## 담당자 계정 추가하기

1. Supabase 대시보드 → `school-lost-and-found` → **Authentication → Users → Add user**에서 이메일·비밀번호로 계정 만들기 (Auto Confirm 체크)
2. **SQL Editor**에서 그 이메일을 담당자 목록에 추가

```sql
insert into public.staff (email, note) values ('담당자이메일@example.com', '학생자치회 공용');
```

담당자에서 빼려면 `delete from public.staff where email = '...';`

## 담당 명단 양식

`templates/` 폴더의 엑셀(.xlsx) 또는 CSV 양식에 학번·이름을 적어 담당자 페이지 → 파일 올리기로 올립니다. 양식에는 다섯 교무실이 모두 들어 있어서, 올리면 전체 명단이 한 번에 바뀝니다.

## 구글 시트 날짜별 담당 연동

- `templates/세교중_분실물_날짜별담당_구글시트양식.xlsx`를 구글 시트로 바꿔 날짜별 담당 학생을 적습니다.
- 시트를 "웹에 게시(CSV)"한 주소는 Supabase Edge Function 비밀값 `ROSTER_SHEET_CSV_URL`에 저장합니다 (사이트 코드에는 넣지 않음).
- 함수 `sync-roster`가 매일 06:30(한국 시간)에 시트를 읽어 `roster_dates`를 갱신하고, 담당자 페이지의 "구글 시트에서 지금 불러오기"로도 실행됩니다.
- 그날 담당자는 날짜별 명단이 있으면 그것을, 없으면 요일 기본 명단을 씁니다.

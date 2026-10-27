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

## 계정 종류

| 계정 | 로그인 | 할 수 있는 일 |
| --- | --- | --- |
| 선생님 | 이메일 + 비밀번호 | 모든 기능, 요일 명단 수정, 구글 시트 불러오기, 학생 계정 비밀번호 관리 |
| 학생 담당 (공용) | 아이디 `student` + 비밀번호 | 분실물 올리기, 주인 찾음 표시, 오늘 올린 물건 삭제, 담당 일정 보기 |

- 학생 계정 비밀번호는 선생님이 담당자 페이지 아래 **학생 담당 계정**에서 정하고 바꿉니다 (Edge Function `student-account`). 바꾸면 예전 비밀번호로 로그인된 기기는 모두 로그아웃됩니다.
- 선생님 계정을 추가하려면 Supabase 대시보드 → Authentication → Users → Add user(Auto Confirm 체크)로 만든 뒤 SQL Editor에서:

```sql
insert into public.staff (email, note, role) values ('선생님이메일@example.com', '선생님', 'teacher');
```

## 담당 명단 양식

`templates/` 폴더의 엑셀(.xlsx) 또는 CSV 양식에 학번·이름을 적어 담당자 페이지 → 파일 올리기로 올립니다. 양식에는 다섯 교무실이 모두 들어 있어서, 올리면 전체 명단이 한 번에 바뀝니다.

## 구글 시트 날짜별 담당 연동

- `templates/세교중_분실물_날짜별담당_구글시트양식.xlsx`를 구글 시트로 바꿔 날짜별 담당 학생을 적습니다.
- 시트를 "웹에 게시(CSV)"한 주소는 Supabase의 서버 전용 테이블 `app_config`(key `roster_sheet_csv_url`)에 저장합니다 (사이트 코드에는 넣지 않음).
- 함수 `sync-roster`가 매일 06:30(한국 시간)에 시트를 읽어 `roster_dates`를 갱신하고, 담당자 페이지의 "구글 시트에서 지금 불러오기"로도 실행됩니다.
- 그날 담당자는 날짜별 명단이 있으면 그것을, 없으면 요일 기본 명단을 씁니다.

시트 주소를 바꾸려면 Supabase SQL Editor에서:

```sql
update public.app_config set value = '<새 CSV 게시 주소>', updated_at = now() where key = 'roster_sheet_csv_url';
```

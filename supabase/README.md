# Supabase — 토토 Z

> ⚠️ **신규 프로젝트를 만들지 않는다.** 기존 z-labs(로또 서비스) Supabase 인스턴스를 공유하고,
> 모든 테이블은 `wooz_toto_` 프리픽스로 격리한다. 프리픽스는 [`src/lib/tables.js`](../src/lib/tables.js)에서 관리.

## 마이그레이션

| 파일 | 내용 |
|------|------|
| `migrations/0001_wooz_toto_init.sql` | 스키마 12테이블 + 인덱스 + RLS(공개 read / admin write) |
| `migrations/0002_wooz_toto_seed_calibration.sql` | 캘리브레이션 곡선 시드 (methodology CAL_VX/VY) |

## 적용법

### 방법 A — Supabase 대시보드 (권장, service_role 불필요)

1. [Supabase 대시보드](https://supabase.com/dashboard) → 해당 프로젝트(`rncjgtyqzjewnmxycexp`) → **SQL Editor**
2. `0001_wooz_toto_init.sql` 내용 전체 붙여넣기 → **Run**
3. `0002_wooz_toto_seed_calibration.sql` 붙여넣기 → **Run**
4. **Table Editor**에서 `wooz_toto_*` 테이블 12개 생성 확인

### 방법 B — Supabase CLI (로컬 연결 시)

```bash
# 프로젝트 연결 (최초 1회)
npx supabase link --project-ref rncjgtyqzjewnmxycexp

# 마이그레이션 적용
npx supabase db push
```

## RLS 정책 (Phase 1)

- **공개 read**: 12개 테이블 전부 `anon`/`authenticated` SELECT 허용 (`using (true)`).
- **write**: 정책 없음 → anon/authenticated 차단. **`service_role`만 write**(RLS 우회) — 수집 파이프라인(크론/시드/스크래퍼) 전용.
- **Phase 2 예정**: `tickets`/`overrides`/`ticket_results`에 `owner_id = auth.uid()` 소유자 정책 추가.

## 시드 데이터 (사용자 제공 필요)

- 캘리브레이션 곡선은 코드 상수로 시드됨(0002).
- **엑셀 852회차 실데이터**(회차·대진·투표율·결과)는 별도 파일이 필요합니다. 엑셀/CSV를 제공하면 `rounds`/`matches`/`votes`/`results` 적재 스크립트를 작성합니다.

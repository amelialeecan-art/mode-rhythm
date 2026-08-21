/* =====================================================================
   MODE · 로컬 데이터 초기화 (개발/관리용)
   ⚠️ 위험: 모든 로컬 기록을 지운다. 되돌릴 수 없다.
   ===================================================================== */
import { db, ALL_TABLES } from './db'

/**
 * 모든 테이블 clear. (DB/스키마는 유지, 데이터만 비움)
 * ALL_TABLES(V1 + V2)를 순회하므로 신규 테이블이 추가돼도 자동으로 포함된다.
 */
export async function resetDatabase(): Promise<void> {
  const tables = ALL_TABLES.map((name) => db.table(name))
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
  })
}

/* =====================================================================
   MODE · 에피소드 시각 입력 헬퍼 (datetime-local ↔ ISO)
   datetime-local은 로컬 시각(타임존 없음)이라 자정/날짜 경계를
   사용자가 고른 그대로 절대 시각(ISO, UTC)으로 변환/역변환한다.
   ===================================================================== */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** ISO datetime → datetime-local input 값 'YYYY-MM-DDTHH:MM'(로컬). 없으면 ''. */
export function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local 값 → ISO(UTC). 빈 값이면 undefined. */
export function fromDatetimeLocalValue(v: string): string | undefined {
  if (!v) return undefined
  const d = new Date(v) // 로컬 시각으로 파싱
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/** 현재 시각의 datetime-local 값. */
export function nowDatetimeLocalValue(): string {
  return toDatetimeLocalValue(new Date().toISOString())
}

/** ISO → 'HH:MM'(로컬 표시용). */
export function formatClock(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

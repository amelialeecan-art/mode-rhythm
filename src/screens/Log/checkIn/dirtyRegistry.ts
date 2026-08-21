/* =====================================================================
   MODE · 기록 탭 dirty 집계 + 전역 저장 버스 (순수 · 모듈 상태)
   기록 탭의 모든 편집 영역이 하나의 dirty 집계에 참여한다. "하나라도 미저장이면
   전역 dirty"가 되어 (1) PWA 업데이트 안전(setFormDirty)과 (2) 하단 전역 저장바가
   모두 같은 진실을 본다.

   각 영역은 자신의 canonical save 핸들러를 등록한다. 전역 "저장하기"는 dirty인
   영역들의 저장을 정해진 순서(order)로 한 번에 호출한다(새 저장 로직 없이 재사용).
   저장 핸들러는 성공 시 true, 실패 시 false를 반환한다(void는 성공으로 간주).
   ===================================================================== */
import { setFormDirty } from '../../../lib/pwaUpdate'

/** 저장 결과: true/void=성공, false=실패(라벨로 안내), {ok:false,message}=실패(구체 안내). */
export type SaveOutcome = boolean | void | { ok: boolean; message?: string }
type Saver = () => Promise<SaveOutcome> | SaveOutcome
interface Entry {
  dirty: boolean
  save?: Saver
  label: string
  order: number
}

/** 저장 순서(작을수록 먼저). 등록 순서라는 우연에 의존하지 않는다(§7). */
export const SAVE_ORDER = {
  checkin: 1,
  sleep: 2,
  meal: 3,
  event: 4, // 스트레스 · 운동
  health: 5, // 약 · 건강예외 · 체중
  legacy: 6,
} as const

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let saving = false

function entryOf(key: string): Entry {
  let e = entries.get(key)
  if (!e) {
    e = { dirty: false, label: key, order: 99 }
    entries.set(key, e)
  }
  return e
}

function anyDirty(): boolean {
  for (const e of entries.values()) if (e.dirty) return true
  return false
}

function syncGlobalDirty(): void {
  setFormDirty(anyDirty())
}

function notify(): void {
  for (const l of listeners) l()
}

/** key의 dirty 상태를 갱신하고 전역 dirty를 재계산한다. */
export function reportDirty(key: string, dirty: boolean): void {
  entryOf(key).dirty = dirty
  syncGlobalDirty()
  notify()
}

/** key 등록 해제(언마운트 시). dirty·saver 모두 제거. */
export function clearDirty(key: string): void {
  entries.delete(key)
  syncGlobalDirty()
  notify()
}

/** 영역의 canonical save 핸들러 등록(중복 저장 로직 없이 재사용). */
export function registerSaver(key: string, save: Saver, label?: string, order?: number): void {
  const e = entryOf(key)
  e.save = save
  if (label) e.label = label
  if (order !== undefined) e.order = order
  notify()
}

/** save 핸들러만 해제(dirty는 clearDirty가 처리). */
export function unregisterSaver(key: string): void {
  const e = entries.get(key)
  if (e) e.save = undefined
  notify()
}

/** 전역 저장바 구독(dirty/saving 변화 시 재렌더). */
export function subscribeSaveBus(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** saver가 등록된 영역 중 하나라도 dirty인가(전역 저장바 노출 조건). */
export function hasSavableDirty(): boolean {
  for (const e of entries.values()) if (e.dirty && e.save) return true
  return false
}

export function isSaving(): boolean {
  return saving
}

/**
 * dirty이고 saver가 있는 영역을 정해진 순서로 저장한다(각 영역의 기존 핸들러 호출).
 * 저장 실패(핸들러가 false 반환 또는 throw)한 영역의 label 목록을 반환한다.
 * 성공한 영역이 다른 영역의 dirty를 지우지 않는다(각자 자기 dirty만 해제).
 */
export async function saveAllDirty(): Promise<string[]> {
  if (saving) return []
  saving = true
  notify()
  const failed: string[] = []
  try {
    const ordered = [...entries.entries()]
      .filter(([, e]) => e.dirty && e.save)
      .sort((a, b) => a[1].order - b[1].order || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    for (const [, e] of ordered) {
      try {
        const r = await e.save!()
        const ok = r === true || r === undefined || (typeof r === 'object' && r?.ok === true)
        if (!ok) {
          const msg = typeof r === 'object' && r?.message ? r.message : `${e.label}은(는) 저장하지 못했어. 한 번만 다시 해줘.`
          failed.push(msg)
        }
      } catch (err) {
        console.error('[MODE] 전역 저장 실패', e.label, err)
        failed.push(`${e.label}은(는) 저장하지 못했어. 한 번만 다시 해줘.`)
      }
    }
  } finally {
    saving = false
    notify()
  }
  return failed
}

/** 테스트/리셋용. */
export function resetDirtyRegistry(): void {
  entries.clear()
  saving = false
  setFormDirty(false)
  notify()
}

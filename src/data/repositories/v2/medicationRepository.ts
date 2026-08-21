import { db } from '../../db'
import type { ISODate } from '../../models'
import type {
  MedicationDose,
  MedicationDoseInput,
  MedicationProfile,
  MedicationProfileInput,
} from '../../modelsV2'
import { isValidTimestamp, V2ValidationError } from '../../v2Validation'

/**
 * 약 저장 계층 — 프로필(정의)과 용량 기록(타임라인)을 분리한다.
 * 이름 text는 프로필 최초 등록 때만. 분석/연결은 name이 아니라 stable id(medicationId)로 한다.
 */
export const medicationRepository = {
  /* ----- MedicationProfile ----- */
  async createProfile(input: MedicationProfileInput): Promise<number> {
    const now = new Date().toISOString()
    return db.medicationProfiles.add({ ...input, createdAt: now, updatedAt: now })
  },

  async getProfile(id: number): Promise<MedicationProfile | undefined> {
    return db.medicationProfiles.get(id)
  },

  async listProfiles(activeOnly = false): Promise<MedicationProfile[]> {
    const all = await db.medicationProfiles.toArray()
    return activeOnly ? all.filter((p) => p.active) : all
  },

  /** 프로필 갱신(이름 포함 편집 가능하지만 id는 불변 — 연결은 id로 유지). */
  async updateProfile(id: number, patch: Partial<MedicationProfileInput>): Promise<void> {
    const existing = await db.medicationProfiles.get(id)
    if (!existing) return
    await db.medicationProfiles.put({ ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
  },

  /** 중단 처리 — 삭제하지 않고 active=false로 두어 과거 dose 타임라인을 보존한다. */
  async deactivateProfile(id: number): Promise<void> {
    await this.updateProfile(id, { active: false })
  },

  /* ----- MedicationDose ----- */
  /** 용량 1회 기록. medicationId가 실제 프로필을 가리켜야 한다(무결성 검사). */
  async addDose(input: MedicationDoseInput): Promise<number> {
    if (!isValidTimestamp(input.takenAt)) throw new V2ValidationError('timestamp-invalid')
    const profile = await db.medicationProfiles.get(input.medicationId)
    if (!profile) throw new V2ValidationError('missing-reference', 'medicationId does not reference a profile')
    const now = new Date().toISOString()
    return db.medicationDoses.add({ ...input, createdAt: now, updatedAt: now })
  },

  async listDosesByMedication(medicationId: number): Promise<MedicationDose[]> {
    return db.medicationDoses.where('medicationId').equals(medicationId).sortBy('takenAt')
  },

  async listDosesByDate(localDate: ISODate): Promise<MedicationDose[]> {
    return db.medicationDoses.where('localDate').equals(localDate).sortBy('takenAt')
  },

  async listDosesByDateRange(start: ISODate, end: ISODate): Promise<MedicationDose[]> {
    return db.medicationDoses.where('localDate').between(start, end, true, true).sortBy('takenAt')
  },

  async getDose(id: number): Promise<MedicationDose | undefined> {
    return db.medicationDoses.get(id)
  },

  /**
   * 용량 기록 부분 수정(merge). createdAt 보존.
   * 용량 변경은 이 dose 레코드를 고치는 게 아니라 보통 새 dose로 남기지만,
   * 오타 정정 등 단일 dose 편집도 지원한다.
   */
  async updateDose(id: number, patch: Partial<MedicationDoseInput>): Promise<void> {
    const existing = await db.medicationDoses.get(id)
    if (!existing) return
    if (patch.takenAt !== undefined && !isValidTimestamp(patch.takenAt)) {
      throw new V2ValidationError('timestamp-invalid')
    }
    await db.medicationDoses.put({ ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
  },

  async deleteDose(id: number): Promise<void> {
    await db.medicationDoses.delete(id)
  },
}

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassCard, SectionHeader, Chip, ChipGroup } from '../../design'
import { userSettingsRepository } from '../../data/repositories/userSettingsRepository'
import { resetDatabase } from '../../data/reset'
import { seedDemoData } from '../../data/seed'
import { db } from '../../data/db'
import {
  downloadExportJson,
  buildExportPayload,
  downloadExportPayload,
  type ModeExportPayload,
} from '../../data/services/dataExportService'
import {
  parseAndValidate,
  importAllData,
  MAX_IMPORT_BYTES,
  type ImportErrorCode,
  type ImportSummary,
} from '../../data/services/dataImportService'
import { checkForUpdateNow } from '../../lib/pwaUpdate'
import { setOnboardingCompleted } from '../../lib/onboarding'
import { getTodayISODate } from '../../lib/date'
import type { ToneModeValue, UserSettings } from '../../data/models'
import './settings.css'

/** 가져오기 실패 코드 → 사용자 메시지(원문 미노출). */
const IMPORT_ERROR_MESSAGE: Record<ImportErrorCode, string> = {
  'file-read': '파일을 읽을 수 없어요.',
  'too-large': '파일이 너무 커요. (최대 20MB)',
  'not-mode': 'MODE 백업 파일이 아니에요.',
  'unsupported-version': '이 버전의 백업은 아직 지원하지 않아요.',
  'invalid-structure': '백업 파일이 손상됐거나 형식이 달라요.',
  'backup-failed': '현재 데이터 백업을 만들지 못해 가져오기를 중단했어요.',
  'import-failed': '데이터를 가져오지 못했어요. 기존 기록은 그대로예요.',
}

interface ImportPreview {
  fileName: string
  payload: ModeExportPayload
  summary: ImportSummary
  currentDailyLogs: number
}

type ImportStage = 'idle' | 'preview' | 'importing' | 'success'

const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

const IS_DEV = import.meta.env.DEV

const TONE_OPTIONS: { code: ToneModeValue; label: string }[] = [
  { code: 'calm', label: '차분하게' },
  { code: 'witty', label: '살짝 위트 있게' },
  { code: 'direct', label: '직설적으로' },
]

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle${on ? ' toggle--on' : ''}`} onClick={() => onChange(!on)}>
      <span className="toggle__knob" />
    </button>
  )
}

export function SettingsScreen() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [devBusy, setDevBusy] = useState(false)
  const [devMsg, setDevMsg] = useState('')
  const [dataMsg, setDataMsg] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const [checking, setChecking] = useState(false)

  // 가져오기(복원) 흐름
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importStage, setImportStage] = useState<ImportStage>('idle')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    let cancelled = false
    void userSettingsRepository.ensureDefault().then((s) => {
      if (!cancelled) setSettings(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const update = async (changes: Partial<Omit<UserSettings, 'id' | 'createdAt' | 'updatedAt'>>) => {
    const s = await userSettingsRepository.update(changes)
    setSettings(s)
  }

  const onExport = async () => {
    setDataMsg('')
    try {
      await downloadExportJson()
      setDataMsg('내보내기 파일을 저장했어요. 민감한 기록이니 안전하게 보관해 주세요.')
    } catch (e) {
      setDataMsg(`내보내기 실패: ${String(e)}`)
    }
  }

  const onResetConfirmed = async () => {
    setConfirmReset(false)
    await resetDatabase()
    const s = await userSettingsRepository.ensureDefault()
    setSettings(s)
    setDataMsg('로컬 데이터를 모두 비웠어요.')
  }

  /* ---- 가져오기(복원) ---- */
  // 1) 파일 선택 직후: 읽기·검증만. DB는 절대 건드리지 않는다.
  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 같은 파일 재선택도 동작하도록 input을 항상 초기화
    e.target.value = ''
    if (!file) return // 취소 → 아무 동작 안 함

    setImportError('')
    if (file.size > MAX_IMPORT_BYTES) {
      setImportError(IMPORT_ERROR_MESSAGE['too-large'])
      return
    }

    let text: string
    try {
      text = await file.text()
    } catch {
      setImportError(IMPORT_ERROR_MESSAGE['file-read'])
      return
    }

    const result = parseAndValidate(text)
    if (!result.ok) {
      setImportError(IMPORT_ERROR_MESSAGE[result.code])
      return
    }

    const currentDailyLogs = await db.dailyLogs.count()
    setImportPreview({ fileName: file.name, payload: result.payload, summary: result.summary, currentDailyLogs })
    setImportStage('preview')
  }

  const cancelImport = () => {
    setImportPreview(null)
    setImportStage('idle')
  }

  // 2) 확인 후: 현재 데이터 자동 백업 → 성공 시에만 전체 교체 → 온보딩 완료 → 성공 화면.
  const onConfirmImport = async () => {
    if (!importPreview) return
    setImportStage('importing')
    setImportError('')

    // (a) 현재 데이터 자동 백업 (기존 export 형식 그대로). 실패하면 DB 무접촉으로 중단.
    try {
      const backup = await buildExportPayload()
      downloadExportPayload(backup, `mode-autobackup-before-import-${getTodayISODate()}.json`)
    } catch {
      setImportError(IMPORT_ERROR_MESSAGE['backup-failed'])
      setImportPreview(null)
      setImportStage('idle')
      return
    }

    // (b) 원자적 전체 교체. 실패하면 롤백되어 기존 기록 유지.
    try {
      await importAllData(importPreview.payload)
    } catch {
      setImportError(IMPORT_ERROR_MESSAGE['import-failed'])
      setImportPreview(null)
      setImportStage('idle')
      return
    }

    // (c) 성공 처리. reload는 사용자가 성공 화면 버튼을 누를 때만.
    setOnboardingCompleted()
    setImportStage('success')
  }

  const onCheckUpdate = async () => {
    setChecking(true)
    setUpdateMsg('')
    const result = await checkForUpdateNow()
    if (result === 'update-available') setUpdateMsg('새 버전이 있어요. 위의 업데이트 배너에서 진행해 주세요.')
    else if (result === 'up-to-date') setUpdateMsg('최신 버전이에요.')
    else setUpdateMsg('이 환경에서는 업데이트 확인을 지원하지 않아요. (개발 모드/미지원 브라우저)')
    setChecking(false)
  }

  const runSeed = async () => {
    setDevBusy(true)
    setDevMsg('')
    try {
      const summary = await seedDemoData()
      const total = Object.values(summary).reduce((a, b) => a + b, 0)
      const s = await userSettingsRepository.ensureDefault()
      setSettings(s)
      setDevMsg(`개발용 demo data ${total}건을 넣었어요.`)
    } catch (e) {
      setDevMsg(`실패: ${String(e)}`)
    } finally {
      setDevBusy(false)
    }
  }

  return (
    <>
      <header className="screen-head settings-head">
        <button className="settings-back" aria-label="뒤로" onClick={() => navigate('/')}>
          ‹
        </button>
        <h1 className="screen-head__title">설정</h1>
      </header>

      {/* 말투 */}
      <GlassCard>
        <SectionHeader title="말투" subtitle="앱이 말 거는 톤을 골라요" />
        <ChipGroup label="말투">
          {TONE_OPTIONS.map((t) => (
            <Chip key={t.code} label={t.label} tone="lav" selected={settings?.toneMode === t.code} onToggle={() => update({ toneMode: t.code })} />
          ))}
        </ChipGroup>
      </GlassCard>

      {/* 개인정보 — 현재 상태 표시 (선택지 아님) */}
      <GlassCard tint="mint">
        <SectionHeader title="개인정보" subtitle="로컬 우선" />
        <p className="setting-hint">
          기록은 이 기기에 저장돼요. 계정·클라우드 동기화는 아직 사용하지 않아요. 진단이 아니라 기록 기반 해석이에요.
        </p>
      </GlassCard>

      {/* 생리 주기 */}
      <GlassCard>
        <SectionHeader title="생리 주기" subtitle="주기 구간 계산에 사용돼요" />
        <div className="setting-row">
          <span className="setting-row__label">생리·주기 기능 사용</span>
          <Toggle on={settings?.cycleEnabled ?? true} onChange={(v) => update({ cycleEnabled: v })} label="생리·주기 기능 사용" />
        </div>
        <div className="setting-row">
          <label className="setting-row__label" htmlFor="avgCycle">평균 주기 길이 (일)</label>
          <input
            id="avgCycle"
            className="setting-num"
            type="number"
            min={20}
            max={45}
            value={settings?.averageCycleLength ?? 28}
            disabled={!(settings?.cycleEnabled ?? true)}
            onChange={(e) => {
              const n = Math.max(20, Math.min(45, Number(e.target.value) || 28))
              void update({ averageCycleLength: n })
            }}
          />
        </div>
        <p className="setting-hint">생리는 사실만 기록하고, 주기 구간은 앱이 날짜로 계산해요. 원인으로 고르는 항목이 아니에요.</p>
      </GlassCard>

      {/* 알림 placeholder */}
      <GlassCard>
        <SectionHeader title="알림" subtitle="기록 리마인더" />
        <div className="setting-row">
          <span className="setting-row__label">하루 기록 알림</span>
          <Toggle on={settings?.reminderEnabled ?? false} onChange={(v) => update({ reminderEnabled: v })} label="하루 기록 알림" />
        </div>
        <p className="setting-hint">기록 알림은 아직 준비 중이에요. 지금은 설정값만 저장돼요.</p>
      </GlassCard>

      {/* 데이터 관리 */}
      <GlassCard>
        <SectionHeader title="데이터" subtitle="내 기록 관리" />
        <button className="data-btn" onClick={onExport}>
          데이터 내보내기 (JSON)
        </button>
        <p className="setting-hint">민감한 개인 기록이에요. 서버로 보내지 않고, 파일은 이 기기에 저장돼요.</p>

        {/* 가져오기(복원) — 숨김 file input을 버튼으로 트리거 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="import-file-input"
          onChange={(e) => void onImportFile(e)}
        />
        <button className="data-btn" onClick={() => fileInputRef.current?.click()}>
          데이터 가져오기 (JSON)
        </button>
        <p className="setting-hint">
          다른 기기·구버전에서 내보낸 백업 JSON을 복원해요. 가져오기 전에 현재 데이터를 자동으로 백업해요.
        </p>
        {importError && <p className="import-error">{importError}</p>}

        <button className="data-btn data-btn--danger" onClick={() => setConfirmReset(true)}>
          로컬 데이터 초기화
        </button>
        {dataMsg && <p className="dev-msg">{dataMsg}</p>}
      </GlassCard>

      {/* 앱 버전 / 업데이트 */}
      <GlassCard>
        <SectionHeader title="앱 버전" subtitle="업데이트해도 기록은 그대로 유지돼요" />
        <div className="setting-row">
          <span className="setting-row__label">빌드</span>
          <span className="setting-build">{BUILD_ID}</span>
        </div>
        <button className="data-btn" disabled={checking} onClick={() => void onCheckUpdate()}>
          {checking ? '확인 중…' : '업데이트 확인'}
        </button>
        {updateMsg && <p className="setting-hint">{updateMsg}</p>}
      </GlassCard>

      {/* 온보딩 다시 보기 */}
      <GlassCard>
        <SectionHeader title="앱 소개" />
        <button className="data-btn" onClick={() => navigate('/onboarding')}>
          온보딩 다시 보기
        </button>
      </GlassCard>

      {/* 개발용 전용 */}
      {IS_DEV && (
        <GlassCard tint="yellow">
          <SectionHeader title="개발용 (DEV)" subtitle="저장 계층 확인용 · 위험 동작" />
          <button className="dev-btn" disabled={devBusy} onClick={runSeed}>
            데모 데이터 넣기
          </button>
          {devMsg && <p className="dev-msg">{devMsg}</p>}
        </GlassCard>
      )}

      <p className="settings-foot">MODE · v0.9 (Phase 9 · 앱 마감 1차)</p>

      {/* 초기화 확인 모달 */}
      {confirmReset && (
        <>
          <div className="sheet-scrim" onClick={() => setConfirmReset(false)} />
          <div className="confirm" role="dialog" aria-label="로컬 데이터 초기화 확인">
            <p className="confirm__title">로컬 데이터 초기화</p>
            <p className="confirm__body">모든 로컬 기록이 삭제됩니다. 되돌릴 수 없어요.</p>
            <div className="confirm__actions">
              <button className="confirm__cancel" onClick={() => setConfirmReset(false)}>
                취소
              </button>
              <button className="confirm__danger" onClick={onResetConfirmed}>
                전부 삭제
              </button>
            </div>
          </div>
        </>
      )}

      {/* 가져오기 확인 화면 — 백업 요약 + 완전 교체 경고 */}
      {(importStage === 'preview' || importStage === 'importing') && importPreview && (
        <>
          <div className="sheet-scrim" onClick={importStage === 'preview' ? cancelImport : undefined} />
          <div className="confirm" role="dialog" aria-label="데이터 가져오기 확인">
            <p className="confirm__title">이 백업을 가져올까요?</p>
            <ul className="import-summary">
              <li><span>파일</span><b>{importPreview.fileName}</b></li>
              <li><span>백업 생성</span><b>{formatDateTime(importPreview.summary.exportedAt)}</b></li>
              <li><span>기록 일수(하루 기록)</span><b>{importPreview.summary.dailyLogs}개</b></li>
              <li><span>사건 기록</span><b>{importPreview.summary.eventLogs}개</b></li>
              <li><span>생리 기록</span><b>{importPreview.summary.cycleLogs}개</b></li>
              <li><span>회복 기록</span><b>{importPreview.summary.recoveryLogs}개</b></li>
              <li><span>분석 데이터</span><b>{importPreview.summary.hasAnalysis ? '포함' : '없음'}</b></li>
              <li><span>현재 기기 하루 기록</span><b>{importPreview.currentDailyLogs}개</b></li>
            </ul>
            <p className="confirm__body import-warn">
              현재 기기의 모든 기록이 <b>가져온 백업으로 완전히 교체</b>됩니다. 가져오기 직전 현재 데이터를 자동으로
              백업(다운로드)하니, 그 파일도 안전하게 보관해 주세요.
            </p>
            <div className="confirm__actions">
              <button className="confirm__cancel" disabled={importStage === 'importing'} onClick={cancelImport}>
                취소
              </button>
              <button
                className="confirm__danger"
                disabled={importStage === 'importing'}
                onClick={() => void onConfirmImport()}
              >
                {importStage === 'importing' ? '가져오는 중…' : '현재 데이터 백업 후 가져오기'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 가져오기 성공 화면 — 사용자가 눌러야 reload */}
      {importStage === 'success' && (
        <>
          <div className="sheet-scrim" />
          <div className="confirm" role="dialog" aria-label="가져오기 완료">
            <p className="confirm__title">데이터를 안전하게 가져왔어요</p>
            <p className="confirm__body">앱을 다시 열면 복원된 기록이 표시됩니다.</p>
            <div className="confirm__actions">
              <button className="confirm__danger" onClick={() => window.location.reload()}>
                복원된 데이터 열기
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

/** exportedAt 문자열을 사람이 읽기 쉬운 형태로. 파싱 실패 시 원문 그대로. */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR')
}

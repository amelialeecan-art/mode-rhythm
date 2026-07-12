import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassCard, SectionHeader, Chip, ChipGroup } from '../../design'
import { userSettingsRepository } from '../../data/repositories/userSettingsRepository'
import { resetDatabase } from '../../data/reset'
import { seedDemoData } from '../../data/seed'
import { downloadExportJson } from '../../data/services/dataExportService'
import { checkForUpdateNow } from '../../lib/pwaUpdate'
import type { ToneModeValue, UserSettings } from '../../data/models'
import './settings.css'

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
        <button className="data-btn data-btn--danger" onClick={() => setConfirmReset(true)}>
          로컬 데이터 초기화
        </button>
        {dataMsg && <p className="dev-msg">{dataMsg}</p>}
        <p className="setting-hint setting-hint--soft">데이터 가져오기(JSON)는 아직 준비 중이에요.</p>
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
    </>
  )
}

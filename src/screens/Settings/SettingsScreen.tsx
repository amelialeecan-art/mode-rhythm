import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassCard, SectionHeader, Chip, ChipGroup } from '../../design'
import { seedDemoData } from '../../data/seed'
import { resetDatabase } from '../../data/reset'
import './settings.css'

const IS_DEV = import.meta.env.DEV

const TONE_OPTIONS = [
  { code: 'soft', label: '차분하게' },
  { code: 'witty', label: '살짝 위트 있게' },
  { code: 'plain', label: '직설적으로' },
]

export function SettingsScreen() {
  const navigate = useNavigate()
  const [tone, setTone] = useState('soft')
  const [devBusy, setDevBusy] = useState(false)
  const [devMsg, setDevMsg] = useState('')

  const runSeed = async () => {
    setDevBusy(true)
    setDevMsg('')
    try {
      const summary = await seedDemoData()
      const total = Object.values(summary).reduce((a, b) => a + b, 0)
      setDevMsg(`개발용 demo data ${total}건을 넣었어요.`)
    } catch (e) {
      setDevMsg(`실패: ${String(e)}`)
    } finally {
      setDevBusy(false)
    }
  }

  const runReset = async () => {
    setDevBusy(true)
    setDevMsg('')
    try {
      await resetDatabase()
      setDevMsg('로컬 데이터를 모두 비웠어요.')
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

      {/* 톤 설정 */}
      <GlassCard>
        <SectionHeader title="말투" subtitle="앱이 말 거는 톤을 골라요" />
        <ChipGroup label="말투">
          {TONE_OPTIONS.map((t) => (
            <Chip key={t.code} label={t.label} tone="lav" selected={tone === t.code} onToggle={() => setTone(t.code)} />
          ))}
        </ChipGroup>
      </GlassCard>

      {/* 개인정보 모드 */}
      <GlassCard tint="mint">
        <SectionHeader title="개인정보" subtitle="기록은 기기에만 저장돼요" />
        <div className="setting-row">
          <span className="setting-row__label">로컬 우선</span>
          <span className="setting-row__value">켜짐</span>
        </div>
        <p className="setting-hint">서버로 보내지 않아요. 동기화/백업은 나중 단계에서 선택 옵션으로 추가될 예정이에요.</p>
      </GlassCard>

      {/* placeholder들 */}
      <GlassCard>
        <SectionHeader title="알림" subtitle="기록 리마인더" />
        <div className="setting-row setting-row--disabled">
          <span className="setting-row__label">하루 기록 알림</span>
          <span className="setting-row__value">준비 중</span>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="생리 주기" subtitle="주기 추정에 사용돼요" />
        <div className="setting-row setting-row--disabled">
          <span className="setting-row__label">평균 주기 길이</span>
          <span className="setting-row__value">준비 중</span>
        </div>
        <p className="setting-hint">생리는 사실만 기록하고, 주기 구간은 앱이 자동으로 계산해요 (다음 단계).</p>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="데이터" subtitle="내 기록 관리" />
        <div className="setting-row setting-row--disabled">
          <span className="setting-row__label">데이터 내보내기</span>
          <span className="setting-row__value">준비 중</span>
        </div>
      </GlassCard>

      {/* 개발용 전용 — 저장 계층(Phase 2) 확인. 빌드 DEV 모드에서만 노출. */}
      {IS_DEV && (
        <GlassCard tint="yellow">
          <SectionHeader title="개발용 (DEV)" subtitle="저장 계층 확인용 · 위험 동작" />
          <div className="dev-actions">
            <button className="dev-btn" disabled={devBusy} onClick={runSeed}>
              데모 데이터 넣기
            </button>
            <button className="dev-btn dev-btn--danger" disabled={devBusy} onClick={runReset}>
              로컬 데이터 초기화
            </button>
          </div>
          <p className="setting-hint">
            ⚠️ 초기화는 모든 로컬 기록을 지워요(되돌릴 수 없음). 데모 데이터는 개발용 가짜 기록이에요.
          </p>
          {devMsg && <p className="dev-msg">{devMsg}</p>}
        </GlassCard>
      )}

      <p className="settings-foot">MODE · v0.2 (Phase 2 · 로컬 저장 계층)</p>
    </>
  )
}

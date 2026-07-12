import { useEffect, useState } from 'react'
import { subscribeUpdateAvailable, applyUpdate } from '../../lib/pwaUpdate'
import './updateBanner.css'

/**
 * 새 버전 감지 시 전역 배너. "지금 업데이트" → 새 SW 활성화 + reload.
 * 기록(IndexedDB)은 건드리지 않는다 — 문구로도 명시.
 */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')

  useEffect(() => subscribeUpdateAvailable(setAvailable), [])

  if (!available || dismissed) return null

  const onUpdate = async () => {
    setBusyMsg('')
    const result = await applyUpdate()
    if (result === 'saving') setBusyMsg('기록 저장 중이에요. 저장이 끝나면 다시 눌러 주세요.')
    else if (result === 'unsaved') setBusyMsg('아직 저장하지 않은 기록이 있어요. 기록을 저장한 뒤 업데이트해 주세요.')
    // 'applied'면 reload되므로 이후 상태 갱신 불필요
  }

  return (
    <div className="update-banner" role="status">
      <div className="update-banner__text">
        <b>새 버전이 있어요</b>
        <span>기록은 그대로 두고 앱만 업데이트합니다.</span>
        {busyMsg && <span className="update-banner__busy">{busyMsg}</span>}
      </div>
      <div className="update-banner__actions">
        <button className="update-banner__later" onClick={() => setDismissed(true)}>
          나중에
        </button>
        <button className="update-banner__now" onClick={() => void onUpdate()}>
          지금 업데이트
        </button>
      </div>
    </div>
  )
}

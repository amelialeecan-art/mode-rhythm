import { useEffect, useState } from 'react'
import { userSettingsRepository } from '../data/repositories/userSettingsRepository'
import type { ToneModeValue } from '../data/models'

/** 저장된 말투(tone) 설정을 한 번 불러온다. 일부 보조 문구에만 가볍게 쓴다. */
export function useToneMode(): ToneModeValue | undefined {
  const [tone, setTone] = useState<ToneModeValue>()
  useEffect(() => {
    let cancelled = false
    void userSettingsRepository.get().then((s) => {
      if (!cancelled) setTone(s?.toneMode)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return tone
}

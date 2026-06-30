import { useNavigate } from 'react-router-dom'
import { AppShell, Mascot } from '../../design'
import { setOnboardingCompleted } from '../../lib/onboarding'
import './onboarding.css'

const FRIENDS: { mood: 'teary' | 'hungry' | 'sleepy' | 'focus' | 'confused'; label: string; delay: string }[] = [
  { mood: 'teary', label: '감정', delay: '.1s' },
  { mood: 'hungry', label: '식욕', delay: '.5s' },
  { mood: 'sleepy', label: '회복', delay: '.9s' },
  { mood: 'focus', label: '집중', delay: '.3s' },
  { mood: 'confused', label: '미제', delay: '.7s' },
]

const POINTS = [
  '원인을 직접 맞히지 않아도 돼요. 오늘 있었던 일만 기록해요.',
  '생리주기는 날짜만 기록하면 앱이 구간을 계산해요.',
  '뭐 했더니 좀 나아졌는지(회복 행동)도 함께 기록해요.',
  '모든 기록은 기본적으로 이 기기에 저장돼요.',
]

/** 온보딩: 첫인상 + 모드 친구들 + MODE 철학. "시작하기"로 완료 저장. */
export function OnboardingScreen() {
  const navigate = useNavigate()
  const start = () => {
    setOnboardingCompleted()
    navigate('/', { replace: true })
  }

  return (
    <AppShell showTabBar={false}>
      <div className="onb">
        <div className="onb__wm">
          <i />
          MODE
        </div>

        <div className="onb__hero">
          <Mascot
            mood="happy"
            size={132}
            gradient="linear-gradient(150deg,#CDA8F2 0%, #F0A6CE 52%, #FFBC9E 100%)"
          />
        </div>

        <h1 className="onb__h">
          매일 다른 나,
          <br />
          오늘의 모드로 읽기
        </h1>
        <p className="onb__sub">
          기록은 사실만 남기고,
          <br />
          패턴 해석은 MODE가 도와줘요.
        </p>

        <div className="onb__friends">
          {FRIENDS.map((f) => (
            <div className="onb__friend" key={f.label}>
              <Mascot mood={f.mood} size={48} delay={f.delay} />
              <span className="onb__friend-label">{f.label}</span>
            </div>
          ))}
        </div>

        <ul className="onb__points">
          {POINTS.map((p) => (
            <li className="onb__point" key={p}>
              <span className="onb__point-dot" />
              {p}
            </li>
          ))}
        </ul>

        <button className="btn-primary onb__btn" onClick={start}>
          시작하기
        </button>
        <p className="onb__foot">기록은 하루 30초 · 진단이 아니라 기록 기반 해석이에요</p>
      </div>
    </AppShell>
  )
}

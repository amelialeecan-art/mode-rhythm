import { useNavigate } from 'react-router-dom'
import { AppShell, Mascot } from '../../design'
import './onboarding.css'

const FRIENDS: { mood: 'teary' | 'hungry' | 'sleepy' | 'focus' | 'confused'; label: string; delay: string }[] = [
  { mood: 'teary', label: '감정', delay: '.1s' },
  { mood: 'hungry', label: '식욕', delay: '.5s' },
  { mood: 'sleepy', label: '회복', delay: '.9s' },
  { mood: 'focus', label: '집중', delay: '.3s' },
  { mood: 'confused', label: '미제', delay: '.7s' },
]

/** 온보딩: 첫인상 + 모드 친구들 소개. */
export function OnboardingScreen() {
  const navigate = useNavigate()
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
            size={144}
            gradient="linear-gradient(150deg,#CDA8F2 0%, #F0A6CE 52%, #FFBC9E 100%)"
          />
        </div>

        <h1 className="onb__h">
          매일 다른 나,
          <br />
          오늘의 모드로 읽기
        </h1>
        <p className="onb__sub">
          기분 따라 매일 모드가 바뀌어
          <br />
          오늘의 모드 친구가 마중 나와요
        </p>

        <div className="onb__friends">
          {FRIENDS.map((f) => (
            <div className="onb__friend" key={f.label}>
              <Mascot mood={f.mood} size={52} delay={f.delay} />
              <span className="onb__friend-label">{f.label}</span>
            </div>
          ))}
        </div>

        <button className="btn-primary onb__btn" onClick={() => navigate('/')}>
          시작하기
        </button>
        <p className="onb__foot">기록은 하루 30초</p>
      </div>
    </AppShell>
  )
}

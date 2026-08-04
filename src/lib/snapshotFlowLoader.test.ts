import { describe, expect, it, vi } from 'vitest'
import { createSnapshotFlowLoader } from './snapshotFlowLoader'

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createSnapshotFlowLoader', () => {
  it('(16/18) load()마다 fetch 1회', async () => {
    const fetchSnapshot = vi.fn(async () => 0)
    const loader = createSnapshotFlowLoader(fetchSnapshot, () => {})
    await loader.load()
    await loader.load()
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
  })

  it('(19) 오래된 응답이 최신 결과를 덮지 않는다', async () => {
    const d1 = deferred<number>()
    const d2 = deferred<number>()
    const queue = [d1.promise, d2.promise]
    const applied: number[] = []
    const loader = createSnapshotFlowLoader(() => queue.shift()!, (v) => applied.push(v))
    void loader.load()
    void loader.load()
    d2.resolve(2)
    await flush()
    d1.resolve(1)
    await flush()
    expect(applied).toEqual([2]) // 최신(req2)만 반영
  })

  it('(20) dispose 후에는 apply하지 않는다', async () => {
    const d = deferred<number>()
    const apply = vi.fn()
    const loader = createSnapshotFlowLoader(() => d.promise, apply)
    void loader.load()
    loader.dispose()
    d.resolve(1)
    await flush()
    expect(apply).not.toHaveBeenCalled()
  })

  it('(21) 실패 시 apply하지 않아 기존 값을 유지한다', async () => {
    const apply = vi.fn()
    const onError = vi.fn()
    const loader = createSnapshotFlowLoader(async () => { throw new Error('boom') }, apply, onError)
    await loader.load()
    expect(apply).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})

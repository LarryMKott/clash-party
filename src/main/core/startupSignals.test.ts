import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  initialProviderTimeout,
  isCoreApiReadyLine,
  isInitialProviderLine,
  waitForInitialProvider
} from './startupSignals'

afterEach(() => {
  vi.useRealTimers()
})

describe('isCoreApiReadyLine', () => {
  it('matches the unix controller line', () => {
    expect(isCoreApiReadyLine('RESTful API unix listening at /tmp/x.sock', 'linux')).toBe(true)
    expect(isCoreApiReadyLine('RESTful API pipe listening at \\\\.\\pipe\\x', 'linux')).toBe(false)
  })

  it('matches the windows named pipe line', () => {
    expect(isCoreApiReadyLine('RESTful API pipe listening at \\\\.\\pipe\\x', 'win32')).toBe(true)
    expect(isCoreApiReadyLine('RESTful API unix listening at /tmp/x.sock', 'win32')).toBe(false)
  })
})

describe('isInitialProviderLine', () => {
  it('matches regardless of log level prefix and case', () => {
    expect(
      isInitialProviderLine(
        'time="2026-10-17T10:00:00Z" level=info msg="Start initial compatible provider default"'
      )
    ).toBe(true)
    expect(isInitialProviderLine('START INITIAL COMPATIBLE PROVIDER DEFAULT')).toBe(true)
    expect(isInitialProviderLine('Start initial provider ProviderA')).toBe(false)
  })
})

describe('waitForInitialProvider', () => {
  it('resolves observed and detaches its listeners', async () => {
    const stream = new PassThrough()
    const waiting = waitForInitialProvider(stream)

    stream.write('Start initial compatible provider default')

    await expect(waiting).resolves.toBe('observed')
    expect(stream.listenerCount('data')).toBe(0)
    expect(stream.listenerCount('close')).toBe(0)
  })

  it('resolves closed when the core exits before the log line', async () => {
    const stream = new PassThrough()
    const waiting = waitForInitialProvider(stream)

    stream.end()

    await expect(waiting).resolves.toBe('closed')
    expect(stream.listenerCount('data')).toBe(0)
  })

  it('gives up after the timeout instead of hanging startup', async () => {
    vi.useFakeTimers()
    const stream = new PassThrough()
    const waiting = waitForInitialProvider(stream)

    await vi.advanceTimersByTimeAsync(initialProviderTimeout)

    await expect(waiting).resolves.toBe('timeout')
    expect(stream.listenerCount('data')).toBe(0)
  })

  it('returns closed for a detached core without stdout', async () => {
    await expect(waitForInitialProvider(null)).resolves.toBe('closed')
  })
})

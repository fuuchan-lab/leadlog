import { useState } from 'react'
import { authorLabel, getDeviceId } from '../device.ts'
import { listDevices, MAX_DEVICES, unregisterDevice, type DeviceInfo } from '../devices.ts'
import { formatDateTime } from '../format.ts'
import { useI18n } from '../i18n/useI18n.ts'

type State = { status: 'idle' | 'loading' | 'error' } | { status: 'done'; devices: DeviceInfo[] }

/** 共有アカウントに登録済みの端末（最大10台）の一覧と、解除 */
export function DevicesCard({ loggedIn }: { loggedIn: boolean }) {
  const { t, lang } = useI18n()
  const [state, setState] = useState<State>({ status: 'idle' })
  const me = getDeviceId()

  const load = async () => {
    setState({ status: 'loading' })
    try {
      setState({ status: 'done', devices: await listDevices() })
    } catch (e) {
      console.error('[devices]', e)
      setState({ status: 'error' })
    }
  }

  return (
    <section className="card">
      <h2>{t('devices.title', { max: MAX_DEVICES })}</h2>
      <p className="muted small">{t('devices.help')}</p>
      {!loggedIn ? (
        <p className="muted small">{t('devices.needLogin')}</p>
      ) : state.status === 'done' ? (
        <>
          <p className="muted">{t('devices.count', { n: state.devices.filter((d) => d.active).length, max: MAX_DEVICES })}</p>
          <ul className="history">
            {state.devices.map((d) => {
              const name = d.member || d.device ? authorLabel(d) : `#${d.deviceId}`
              return (
                <li key={d.fileId} className="row">
                  <span>
                    👤 {name}
                    {d.deviceId === me && <span className="tag tag-muted">{t('devices.this')}</span>}
                    {!d.active && <span className="tag tag-warn">{t('devices.over')}</span>}
                    <br />
                    <span className="muted small">
                      #{d.deviceId} · {t('devices.registered', { time: formatDateTime(d.registeredAt, lang) })}
                    </span>
                  </span>
                  {d.deviceId !== me && (
                    <button
                      className="link danger"
                      onClick={async () => {
                        if (!confirm(t('devices.confirmRemove', { name }))) return
                        try {
                          await unregisterDevice(d.fileId)
                        } finally {
                          void load()
                        }
                      }}
                    >
                      {t('devices.remove')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <button className="secondary" disabled={state.status === 'loading'} onClick={() => void load()}>
          {state.status === 'loading' ? t('devices.loading') : t('devices.load')}
        </button>
      )}
      {state.status === 'error' && <p className="error">{t('devices.failed')}</p>}
    </section>
  )
}

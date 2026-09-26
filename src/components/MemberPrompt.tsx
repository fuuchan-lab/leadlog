import { useState } from 'react'
import { useI18n } from '../i18n/useI18n.ts'
import type { Category } from '../settings.ts'

interface Props {
  /** 登録者一覧（設定の「登録者管理」）。あれば、この中から選べる */
  members: Category[]
  /** 一覧の中から選んだ時 */
  onPick: (name: string) => void
  /** 一覧に無い名前を入力した時（一覧にも追加する） */
  onCreate: (name: string) => void
}

/** 登録者がまだ決まっていない端末で、最初に、登録者を選ぶ（一覧に無ければ名前を入力する） */
export function MemberPrompt({ members, onPick, onCreate }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    // 入力した名前が、一覧にすでにあれば、一覧から選んだのと同じにする
    if (members.some((m) => m.label === trimmed)) onPick(trimmed)
    else onCreate(trimmed)
  }
  return (
    <section className="card member-card">
      <h2>👤 {t('member.title')}</h2>
      <p className="muted small">{t('member.help')}</p>
      {members.length > 0 && (
        <div className="member-choices" role="group" aria-label={t('member.choose')}>
          {members.map((m) => (
            <button key={m.id} className="secondary" onClick={() => onPick(m.label)}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      {members.length > 0 && <p className="muted small">{t('member.orNew')}</p>}
      <div className="two">
        <input
          type="text"
          className="grow"
          placeholder={t('member.placeholder')}
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
        />
        <button className="primary" disabled={!name.trim()} onClick={submit}>
          {t('member.save')}
        </button>
      </div>
    </section>
  )
}

import { useState } from 'react'
import { useI18n } from '../i18n/useI18n.ts'

/** 登録者名がまだ無い端末で、最初に名前を入れてもらう */
export function MemberPrompt({ onSave }: { onSave: (name: string) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const submit = () => {
    if (name.trim()) onSave(name.trim())
  }
  return (
    <section className="card member-card">
      <h2>👤 {t('member.title')}</h2>
      <p className="muted small">{t('member.help')}</p>
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

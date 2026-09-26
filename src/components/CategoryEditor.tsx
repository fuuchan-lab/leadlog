import { useState } from 'react'
import { useI18n } from '../i18n/useI18n.ts'
import { CATEGORY_COLORS, type Category } from '../settings.ts'

/** cancelled: 確認でやめた（編集の画面はそのまま、エラーは出さない） */
type Reason = 'empty' | 'duplicate' | 'cancelled' | null

interface Props {
  title: string
  help: string
  items: Category[]
  onAdd: (label: string) => Reason
  onUpdate: (id: string, label: string, color: string) => Reason
  onRemove: (id: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  /** 別のカードの中に入れて表示する（見出しを小さくし、枠は付けない） */
  embedded?: boolean
  /** いま選んでいる項目の名前。一覧の中で「この端末」の印を付ける */
  selected?: string
  /** 一覧の項目を選んだ時（「この端末で使う」を押した時） */
  onSelect?: (label: string) => void
}

/** 重要度・顧客の種類などのリストの編集（追加・名前と色の変更・並べ替え・削除） */
export function CategoryEditor({ title, help, items, onAdd, onUpdate, onRemove, onMove, embedded, selected, onSelect }: Props) {
  const { t } = useI18n()
  const [label, setLabel] = useState('')
  const [error, setError] = useState<Reason>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const submit = () => {
    const reason = onAdd(label)
    setError(reason)
    if (!reason) setLabel('')
  }

  const Wrapper = embedded ? 'div' : 'section'
  const Heading = embedded ? 'h3' : 'h2'

  return (
    <Wrapper className={embedded ? 'category-embedded' : 'card'}>
      <Heading>{title}</Heading>
      <p className="muted small">{help}</p>
      <ul className="history">
        {items.map((c, index) =>
          editingId === c.id ? (
            <li key={c.id}>
              <ItemEditor item={c} onSave={(l, color) => onUpdate(c.id, l, color)} onClose={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={c.id} className="row">
              <span className="med-name">
                <span className="tag" style={{ background: c.color }}>
                  {c.label}
                </span>
                {selected !== undefined && c.label === selected && <span className="this-device">✓ {t('device.thisDevice')}</span>}
              </span>
              <span className="med-actions">
                {onSelect && c.label !== selected && (
                  <button className="link" onClick={() => onSelect(c.label)}>
                    {t('device.useHere')}
                  </button>
                )}
                <button
                  className="link move-button"
                  disabled={index === 0}
                  onClick={() => onMove(c.id, -1)}
                  aria-label={t('category.moveUp', { name: c.label })}
                  title={t('category.moveUp', { name: c.label })}
                >
                  ▲
                </button>
                <button
                  className="link move-button"
                  disabled={index === items.length - 1}
                  onClick={() => onMove(c.id, 1)}
                  aria-label={t('category.moveDown', { name: c.label })}
                  title={t('category.moveDown', { name: c.label })}
                >
                  ▼
                </button>
                <button className="link" onClick={() => setEditingId(c.id)}>
                  {t('common.edit')}
                </button>
                <button
                  className="link danger"
                  onClick={() => {
                    if (confirm(t('category.confirmRemove', { name: c.label }))) onRemove(c.id)
                  }}
                >
                  {t('common.delete')}
                </button>
              </span>
            </li>
          ),
        )}
        {items.length === 0 && <li className="muted">{t('category.none')}</li>}
      </ul>
      <div className="two">
        <input
          type="text"
          className="grow"
          placeholder={t('category.addPlaceholder')}
          value={label}
          maxLength={30}
          onChange={(e) => {
            setLabel(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
        />
        <button className="primary" onClick={submit}>
          {t('common.add')}
        </button>
      </div>
      {error && error !== 'cancelled' && (
        <p className="error">{t(error === 'duplicate' ? 'category.errDup' : 'category.errEmpty')}</p>
      )}
    </Wrapper>
  )
}

function ItemEditor({ item, onSave, onClose }: { item: Category; onSave: (label: string, color: string) => Reason; onClose: () => void }) {
  const { t } = useI18n()
  const [label, setLabel] = useState(item.label)
  const [color, setColor] = useState(item.color)
  const [error, setError] = useState<Reason>(null)
  const colors = [...new Set([item.color, ...CATEGORY_COLORS])]

  const submit = () => {
    const reason = onSave(label, color)
    if (reason) setError(reason)
    else onClose()
  }

  return (
    <div className="editor">
      <label className="field">
        {t('category.nameLabel')}
        <div className="name-row">
          <span className="tag" style={{ background: color }}>
            {label || '…'}
          </span>
          <input
            type="text"
            value={label}
            maxLength={30}
            onChange={(e) => {
              setLabel(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
            }}
          />
        </div>
      </label>
      <div className="field" role="radiogroup" aria-label={t('category.colorLabel')}>
        {t('category.colorLabel')}
        <div className="swatches">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={c}
              className="swatch-btn"
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      {error && error !== 'cancelled' && (
        <p className="error">{t(error === 'duplicate' ? 'category.errDup' : 'category.errEmpty')}</p>
      )}
      <div className="row">
        <button className="link" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="primary" onClick={submit}>
          {t('common.save')}
        </button>
      </div>
    </div>
  )
}

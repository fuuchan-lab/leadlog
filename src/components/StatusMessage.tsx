import { useI18n } from '../i18n/useI18n.ts'

interface Props {
  kind: 'ok' | 'error'
  text: string
  /** 失敗の詳しい理由（小さく添える） */
  detail?: string
}

/** 処理の結果の知らせ（成功・失敗）。失敗の時は、詳しい理由を下に小さく添える */
export function StatusMessage({ kind, text, detail }: Props) {
  const { t } = useI18n()
  return (
    <p className={kind} role={kind === 'ok' ? 'status' : 'alert'}>
      {text}
      {detail && (
        <>
          <br />
          <span className="small muted">
            {t('err.detail')}: {detail}
          </span>
        </>
      )}
    </p>
  )
}

/** だれが（どの端末から）登録・更新したか */
export interface Author {
  /** 端末ごとに自動で作る ID（この端末のブラウザに保存）。同じ Google アカウントを共有しても端末を区別できる */
  deviceId: string
  /** 設定で入力した登録者名（例: 田中） */
  member: string
  /** 端末の種類（例: Android · Chrome）。自動で判定する */
  device: string
}

/** 次のアクション（紙の Fair Meeting Note の Next Steps: To Do / Who / When） */
export interface NextStep {
  /** アクションの種類の ID（設定の「次のアクション」リスト） */
  action: string
  /** 担当 */
  who: string
  /** 期日（YYYY-MM-DD。未定は ''） */
  when: string
}

/** 展示会で会った方（リード）1件 */
export interface Lead {
  id: string
  name: string
  company: string
  department: string
  /** 役職 */
  title: string
  /** 所在地の都道府県名 */
  prefecture: string
  /** 所在地の市区町村名 */
  city: string
  phone: string
  email: string
  /** 重要度の ID（設定の重要度リスト）。未選択は '' */
  importance: string
  /** 顧客の種類の ID（設定の顧客の種類リスト）。未選択は '' */
  customerType: string
  /** 興味のある分野の ID（設定の興味のある分野リスト。複数選べる） */
  interests: string[]
  note: string
  /** 次のアクション */
  nextSteps: NextStep[]
  /** 来場日時（会った日時, epoch ms）。登録した時刻が自動で入り、あとで直せる */
  metAt: number
  /** 対応した担当者（紙の Written by・Excel の「受付」）。登録者名が自動で入り、あとで直せる */
  staff: string
  /** 補正した名刺・バッジの画像。手入力の場合は null */
  photoId: string | null
  /** OCR で読み取った文字（あとで確認・修正するため残す） */
  ocrText: string
  /** 登録した時の展示会名 */
  exhibition: string
  /** 登録日時 (epoch ms)。変わらない */
  createdAt: number
  createdBy: Author
  /** 最終更新日時 (epoch ms)。端末間で新しい方を採用するために使う */
  updatedAt: number
  updatedBy: Author
  /** 削除済み。他の端末へ削除を伝えるため、記録自体は残す */
  deleted?: boolean
  /** Google ドライブへ保存済みか（端末ごとの状態） */
  synced: boolean
}

/** 入力フォームで扱う項目 */
export type LeadFields = Pick<
  Lead,
  | 'name'
  | 'company'
  | 'department'
  | 'title'
  | 'prefecture'
  | 'city'
  | 'phone'
  | 'email'
  | 'importance'
  | 'customerType'
  | 'interests'
  | 'note'
  | 'nextSteps'
  | 'metAt'
  | 'staff'
>

export const EMPTY_FIELDS: LeadFields = {
  name: '',
  company: '',
  department: '',
  title: '',
  prefecture: '',
  city: '',
  phone: '',
  email: '',
  importance: '',
  customerType: '',
  interests: [],
  note: '',
  nextSteps: [],
  /** 0 は「保存した時刻」 */
  metAt: 0,
  /** '' は「登録者名」 */
  staff: '',
}

export interface PhotoRecord {
  id: string
  blob: Blob
  synced: boolean
}

/** 保存できる内容か（連絡先として使える項目が1つはある） */
export function hasContent(f: LeadFields): boolean {
  return [f.name, f.company, f.email, f.phone].some((v) => v.trim() !== '')
}

/**
 * 設定の画面の「保存していない変更」をまとめる。「戻る」を押した時に、
 * 「変更を保存しますか？（はい）（いいえ）」を出すかどうかと、「はい」の時の保存に使う。
 * 設定の画面は1つだけなので、画面の部品ごとの登録を、モジュールの中に持つ
 */
import { useEffect, useRef } from 'react'

interface Entry {
  dirty: boolean
  save: () => void
}

const entries = new Map<string, Entry>()

/** 部品の、保存していない変更の有無と保存のしかたを登録する（画面を離れると外れる） */
export function useLeaveGuard(key: string, dirty: boolean, save: () => void) {
  // 保存の関数は描画のたびに変わるので、最新のものを参照する
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    entries.set(key, { dirty, save: () => saveRef.current() })
  }, [key, dirty])
  useEffect(() => () => void entries.delete(key), [key])
}

export function hasUnsavedChanges(): boolean {
  return [...entries.values()].some((e) => e.dirty)
}

/** 保存していない変更をすべて保存する */
export function saveAllChanges() {
  for (const e of entries.values()) if (e.dirty) e.save()
}

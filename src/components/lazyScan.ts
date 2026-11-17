import { lazy } from 'react'

/** カメラの画面と、範囲を合わせる画面。名刺を読み取る時だけ読み込む */
export const CameraModal = lazy(() => import('./CameraModal.tsx').then((m) => ({ default: m.CameraModal })))
export const ScanModal = lazy(() => import('./ScanModal.tsx').then((m) => ({ default: m.ScanModal })))

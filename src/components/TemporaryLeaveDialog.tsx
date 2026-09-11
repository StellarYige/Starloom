import { Modal } from './Modal'

export function TemporaryLeaveDialog({ onDecision }: { onDecision: (discard: boolean) => void }) {
  return (
    <Modal title="放弃临时作品？" onClose={() => onDecision(false)}>
      <p className="modal-intro">
        这份临时作品无法保存。离开后，照片和编辑内容将被放弃，无法恢复。请先下载需要的成品；已下载的
        PNG 不受影响。
      </p>
      <div className="confirm-actions">
        <button className="secondary-button" autoFocus onClick={() => onDecision(false)}>
          继续制作
        </button>
        <button className="primary-button danger-button" onClick={() => onDecision(true)}>
          放弃并离开
        </button>
      </div>
    </Modal>
  )
}

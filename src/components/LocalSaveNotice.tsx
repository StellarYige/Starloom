import { useEffect, useState } from 'react'
import { CircleAlert, ShieldCheck } from 'lucide-react'

export function LocalSaveNotice({
  status,
  savedAt,
  detail,
  temporary,
  retry,
}: {
  status: string
  savedAt: number | null
  detail: string
  temporary: boolean
  retry: () => void
}) {
  const [persistence, setPersistence] = useState<
    'unknown' | 'available' | 'granted' | 'denied' | 'unsupported'
  >('unknown')
  const [requesting, setRequesting] = useState(false)
  useEffect(() => {
    let alive = true
    if (!navigator.storage?.persisted || !navigator.storage?.persist) setPersistence('unsupported')
    else
      void navigator.storage
        .persisted()
        .then((value) => {
          if (alive) setPersistence(value ? 'granted' : 'available')
        })
        .catch(() => {
          if (alive) setPersistence('unsupported')
        })
    return () => {
      alive = false
    }
  }, [])
  const failed = status.includes('失败') || temporary
  return (
    <div className="local-save-notice">
      <div className="workspace-status">
        <span role="status" className={failed ? 'save-warning' : ''}>
          {failed ? <CircleAlert size={14} /> : <ShieldCheck size={14} />}
          {status}
          {savedAt && status === '已保存到本机' && (
            <time dateTime={new Date(savedAt).toISOString()}>
              {new Intl.DateTimeFormat('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              }).format(savedAt)}
            </time>
          )}
        </span>
        {!temporary && (
          <button className="text-button" onClick={retry}>
            {failed ? '重试保存' : '立即保存'}
          </button>
        )}
      </div>
      {detail && (
        <p className="save-detail" role="alert">
          {detail}
        </p>
      )}
      <details className="storage-details">
        <summary>仅存于此浏览器 · 保存与恢复说明</summary>
        <p>
          看到「已保存到本机」后再关闭浏览器。再次打开时，请使用同一浏览器、同一资料和相同站点地址（含协议、主机与端口）。
        </p>
        <p>
          无痕窗口结束、清理网站数据或浏览器回收存储都可能丢失作品；尚未保存时强制退出也可能丢失最后的修改。请及时下载重要成品，PNG
          不包含可继续编辑的工程和撤销记录。
        </p>
        <p>作品不会跨浏览器、设备或站点同步。请避免在多个标签页同时修改同一作品。</p>
        {!temporary && (
          <div className="persistence-control">
            <span>
              {persistence === 'granted'
                ? '浏览器已允许持久存储，可降低自动回收风险；主动清理仍会删除作品。'
                : persistence === 'denied'
                  ? '浏览器未允许持久存储，仍按普通本地存储保存。'
                  : persistence === 'unsupported'
                    ? '此浏览器不支持申请持久存储，仍按普通本地存储保存。'
                    : '可申请持久存储，降低浏览器自动回收的风险。'}
            </span>
            {['available', 'denied'].includes(persistence) && (
              <button
                className="text-button"
                disabled={requesting}
                onClick={async () => {
                  setRequesting(true)
                  try {
                    setPersistence((await navigator.storage.persist()) ? 'granted' : 'denied')
                  } catch {
                    setPersistence('unsupported')
                  } finally {
                    setRequesting(false)
                  }
                }}
              >
                {requesting ? '正在申请…' : '申请持久存储'}
              </button>
            )}
          </div>
        )}
      </details>
    </div>
  )
}

import { useEffect, useState } from 'react'

const validHex = (value: string) => /^#[\da-f]{6}$/i.test(value)

/** Shared by both editors; continuous picker changes form one undo step. */
export function CustomColorPicker({
  id,
  color,
  onChange,
  onSeal,
}: {
  id: string
  color: string
  onChange: (color: string, group: string) => void
  onSeal: () => void
}) {
  const [hex, setHex] = useState(color.toUpperCase())
  useEffect(() => setHex(color.toUpperCase()), [color])
  return (
    <div className="form-field">
      <label htmlFor={id}>自定义颜色</label>
      <div className="custom-color">
        <label className="color-picker" title="打开颜色选择器">
          <input
            type="color"
            aria-label="自定义应援色"
            value={color}
            onChange={(event) => onChange(event.target.value, 'color-picker')}
            onBlur={onSeal}
          />
        </label>
        <input
          id={id}
          type="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          value={hex}
          aria-invalid={!validHex(hex)}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            const value = event.target.value
            setHex(value)
            if (validHex(value)) onChange(value, 'color-hex')
          }}
          onBlur={() => {
            if (!validHex(hex)) setHex(color.toUpperCase())
            onSeal()
          }}
        />
        <span>HEX</span>
      </div>
      <p className="field-hint" id={`${id}-hint`}>
        点击色块选色，或输入 # 加六位色值，例如 #75866B。
      </p>
    </div>
  )
}

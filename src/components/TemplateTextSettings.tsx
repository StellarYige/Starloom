import { countCharacters } from '../core/project'
import { templateTextFields, updateTemplateText } from '../core/template-text'
import type { ProjectState } from '../core/types'

export function TemplateTextSettings({
  project,
  change,
  seal,
}: {
  project: ProjectState
  change: (update: (previous: ProjectState) => ProjectState, group?: string) => void
  seal: () => void
}) {
  return (
    <details className="template-text-settings">
      <summary>模板装饰文案</summary>
      <p className="field-hint">
        可修改或隐藏，位置与字体沿用模板。每条最多 80 字，过长时请根据预览缩短。
      </p>
      {templateTextFields(project).map((field) => {
        const override = project.templateTexts?.[project.templateId]?.[field.id]
        const value = override ?? { text: field.literal, hidden: false }
        const inputId = `template-text-${project.templateId}-${field.id}`
        return (
          <div className="template-text-field" key={inputId}>
            <div className="field-heading">
              <label htmlFor={inputId}>{field.label}</label>
              <label className="template-text-visible">
                <input
                  type="checkbox"
                  checked={!value.hidden}
                  aria-label={`显示${field.label}`}
                  onChange={(event) =>
                    change((previous) =>
                      updateTemplateText(previous, field.id, {
                        ...value,
                        hidden: !event.target.checked,
                      }),
                    )
                  }
                />
                显示
              </label>
            </div>
            <textarea
              id={inputId}
              rows={field.literal.includes('\n') ? 2 : 1}
              value={value.text}
              disabled={value.hidden}
              aria-invalid={!value.hidden && countCharacters(value.text) > 80}
              onChange={(event) =>
                change(
                  (previous) =>
                    updateTemplateText(previous, field.id, { ...value, text: event.target.value }),
                  inputId,
                )
              }
              onBlur={seal}
            />
            <div className="template-text-actions">
              <span>
                {countCharacters(value.text)} / 80{field.decoration ? ' · 随星芒开关显示' : ''}
              </span>
              <button
                type="button"
                className="text-button"
                disabled={!override}
                aria-label={`恢复${field.label}默认`}
                onClick={() => change((previous) => updateTemplateText(previous, field.id, null))}
              >
                恢复默认
              </button>
            </div>
          </div>
        )
      })}
    </details>
  )
}

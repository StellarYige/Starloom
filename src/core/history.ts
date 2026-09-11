export interface History<T> {
  past: T[]
  present: T
  future: T[]
  group: string | null
  timestamp: number
}
export type HistoryAction<T> =
  | { type: 'change'; value: T; group?: string; now?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'seal' }
  | { type: 'reset'; value: T }
export const initialHistory = <T>(value: T): History<T> => ({
  past: [],
  present: value,
  future: [],
  group: null,
  timestamp: 0,
})
export function historyReducer<T>(state: History<T>, action: HistoryAction<T>): History<T> {
  if (action.type === 'reset') return initialHistory(action.value)
  if (action.type === 'seal') return { ...state, group: null }
  if (action.type === 'undo') {
    if (!state.past.length) return state
    return {
      ...state,
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1],
      future: [state.present, ...state.future],
      group: null,
    }
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state
    return {
      ...state,
      past: [...state.past, state.present].slice(-50),
      present: state.future[0],
      future: state.future.slice(1),
      group: null,
    }
  }
  if (JSON.stringify(state.present) === JSON.stringify(action.value)) return state
  const now = action.now ?? Date.now()
  const merge =
    action.group &&
    action.group === state.group &&
    now - state.timestamp < 900 &&
    !state.future.length
  return {
    past: merge ? state.past : [...state.past, state.present].slice(-50),
    present: action.value,
    future: [],
    group: action.group ?? null,
    timestamp: now,
  }
}

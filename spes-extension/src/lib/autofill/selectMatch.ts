export interface SelectOption {
  value: string
  text: string
  disabled?: boolean
}

const SELECT_PROMPT =
  /^(?:[-–—.\s]*)(?:please\s+)?(?:select|choose|pick)(?:\s+\w+){0,6}(?:[-–—.\s…:]*)?$/i
const BLANK_PROMPT = /^(?:-+|–+|—+|n\/?a)$/i

export function isPlaceholderOption(option: SelectOption): boolean {
  if (option.disabled) {
    return true
  }
  const text = option.text.trim()
  const value = option.value.trim()
  if (!text && !value) {
    return true
  }
  if (SELECT_PROMPT.test(text) || BLANK_PROMPT.test(text)) {
    return true
  }
  if (!value && /select|choose|pick/i.test(text)) {
    return true
  }
  return false
}

export function matchSelectOption(
  wanted: string,
  options: SelectOption[],
): SelectOption | null {
  const needle = wanted.trim()
  if (!needle) {
    return null
  }
  const usable = options.filter((option) => !isPlaceholderOption(option))
  if (usable.length === 0) {
    return null
  }

  const foldedNeedle = fold(needle)

  const exactText = usable.filter((option) => option.text.trim() === needle)
  if (exactText.length === 1) {
    return exactText[0]
  }

  const exactValue = usable.filter((option) => option.value.trim() === needle)
  if (exactValue.length === 1) {
    return exactValue[0]
  }

  const foldedText = usable.filter(
    (option) => fold(option.text) === foldedNeedle,
  )
  if (foldedText.length === 1) {
    return foldedText[0]
  }

  const foldedValue = usable.filter(
    (option) => fold(option.value) === foldedNeedle,
  )
  if (foldedValue.length === 1) {
    return foldedValue[0]
  }

  const containing = usable.filter((option) => {
    const text = fold(option.text)
    const value = fold(option.value)
    if (!text && !value) {
      return false
    }
    return (
      text.includes(foldedNeedle) ||
      value.includes(foldedNeedle) ||
      (foldedNeedle.length >= 3 &&
        (foldedNeedle.includes(text) || foldedNeedle.includes(value)))
    )
  })
  if (containing.length === 1) {
    return containing[0]
  }
  if (containing.length > 1) {
    const prefix = containing.filter((option) => {
      const text = fold(option.text)
      return text === foldedNeedle || text.startsWith(`${foldedNeedle} `)
    })
    if (prefix.length === 1) {
      return prefix[0]
    }
    const shortest = [...containing].sort(
      (left, right) => fold(left.text).length - fold(right.text).length,
    )
    if (
      fold(shortest[0].text).length + 8 <
      fold(shortest[1].text).length
    ) {
      return shortest[0]
    }
  }

  return null
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

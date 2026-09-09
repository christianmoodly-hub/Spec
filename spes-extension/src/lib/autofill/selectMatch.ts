export interface SelectOption {
  value: string
  text: string
  disabled?: boolean
}

const PLACEHOLDER =
  /^(select(?:\s+(?:one|an?\s+option))?|choose(?:\s+(?:one|an?\s+option))?|please\s+select|--+|n\/?a)[\s.…:-]*$/i

export function isPlaceholderOption(option: SelectOption): boolean {
  if (option.disabled) {
    return true
  }
  const text = option.text.trim()
  const value = option.value.trim()
  if (!text && !value) {
    return true
  }
  return PLACEHOLDER.test(text)
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

  const exactText = usable.filter((option) => option.text.trim() === needle)
  if (exactText.length === 1) {
    return exactText[0]
  }

  const exactValue = usable.filter((option) => option.value.trim() === needle)
  if (exactValue.length === 1) {
    return exactValue[0]
  }

  const lower = needle.toLowerCase()
  const ciText = usable.filter(
    (option) => option.text.trim().toLowerCase() === lower,
  )
  if (ciText.length === 1) {
    return ciText[0]
  }

  const ciValue = usable.filter(
    (option) => option.value.trim().toLowerCase() === lower,
  )
  if (ciValue.length === 1) {
    return ciValue[0]
  }

  const substring = usable.filter((option) => {
    const text = option.text.trim().toLowerCase()
    if (!text) {
      return false
    }
    return text.includes(lower) || (text.length >= 3 && lower.includes(text))
  })
  if (substring.length === 1) {
    return substring[0]
  }

  return null
}

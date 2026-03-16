// Lightweight validation utilities — no external dependencies

type ValidationResult = { valid: true } | { valid: false; errors: string[] }

type Validator<T> = (value: T) => ValidationResult

export function validate<T>(value: T, ...validators: Validator<T>[]): ValidationResult {
  const errors: string[] = []
  for (const validator of validators) {
    const result = validator(value)
    if (!result.valid) errors.push(...result.errors)
  }
  return errors.length > 0 ? { valid: false, errors } : { valid: true }
}

export function required(field: string): Validator<Record<string, unknown>> {
  return (obj) => {
    const value = obj[field]
    if (value === undefined || value === null || value === '') {
      return { valid: false, errors: [`${field} is required`] }
    }
    return { valid: true }
  }
}

export function minLength(field: string, min: number): Validator<Record<string, unknown>> {
  return (obj) => {
    const value = obj[field]
    if (typeof value === 'string' && value.length < min) {
      return { valid: false, errors: [`${field} must be at least ${min} characters`] }
    }
    return { valid: true }
  }
}

export function maxLength(field: string, max: number): Validator<Record<string, unknown>> {
  return (obj) => {
    const value = obj[field]
    if (typeof value === 'string' && value.length > max) {
      return { valid: false, errors: [`${field} must be at most ${max} characters`] }
    }
    return { valid: true }
  }
}

export function isEmail(field: string): Validator<Record<string, unknown>> {
  return (obj) => {
    const value = obj[field]
    if (typeof value !== 'string') return { valid: true }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return { valid: false, errors: [`${field} must be a valid email address`] }
    }
    return { valid: true }
  }
}

export function isIn(field: string, allowed: string[]): Validator<Record<string, unknown>> {
  return (obj) => {
    const value = obj[field]
    if (value !== undefined && !allowed.includes(String(value))) {
      return { valid: false, errors: [`${field} must be one of: ${allowed.join(', ')}`] }
    }
    return { valid: true }
  }
}

export function isPositive(field: string): Validator<Record<string, unknown>> {
  return (obj) => {
    const value = obj[field]
    if (typeof value === 'number' && value <= 0) {
      return { valid: false, errors: [`${field} must be positive`] }
    }
    return { valid: true }
  }
}

export function isArray(field: string): Validator<Record<string, unknown>> {
  return (obj) => {
    const value = obj[field]
    if (value !== undefined && !Array.isArray(value)) {
      return { valid: false, errors: [`${field} must be an array`] }
    }
    return { valid: true }
  }
}

export function isUUID(field: string): Validator<Record<string, unknown>> {
  return (obj) => {
    const value = obj[field]
    if (typeof value !== 'string') return { valid: true }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(value)) {
      return { valid: false, errors: [`${field} must be a valid UUID`] }
    }
    return { valid: true }
  }
}

export function isDate(field: string): Validator<Record<string, unknown>> {
  return (obj) => {
    const value = obj[field]
    if (value === undefined || value === null) return { valid: true }
    const date = new Date(value as string | number)
    if (isNaN(date.getTime())) {
      return { valid: false, errors: [`${field} must be a valid date`] }
    }
    return { valid: true }
  }
}

export function matches(field: string, pattern: RegExp, message: string): Validator<Record<string, unknown>> {
  return (obj) => {
    const value = obj[field]
    if (typeof value === 'string' && !pattern.test(value)) {
      return { valid: false, errors: [message] }
    }
    return { valid: true }
  }
}

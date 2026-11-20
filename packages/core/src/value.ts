/** Copy and freeze plain data without freezing values owned by a codec or its caller. */
export function frozenCopy<TValue>(value: TValue, copies?: Map<object, object>): TValue {
  if (value instanceof Date) {
    return new Date(value) as TValue;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  const array = Array.isArray(value);
  if (!array && prototype && prototype !== Object.prototype) {
    return value;
  }
  copies ??= new Map<object, object>();
  const existing = copies.get(value);
  if (existing) {
    return existing as TValue;
  }
  const copy: object = array
    ? (value as readonly unknown[]).slice()
    : (Object.create(prototype) as object);
  copies.set(value, copy);
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(copy, key, {
      value: frozenCopy(item, copies),
      enumerable: true,
    });
  }
  return Object.freeze(copy) as TValue;
}
/** Read a state field without treating an inherited member as a query value. */
export function ownValue(source: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(source, key) ? source[key] : undefined;
}

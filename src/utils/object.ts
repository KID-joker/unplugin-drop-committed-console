const hasOwnProperty = Object.prototype.hasOwnProperty
export function hasOwn(val: object, key: string | symbol): key is keyof typeof val {
  return hasOwnProperty.call(val, key)
}

export function assertWalletOnlineForWrite(isOnline: boolean = typeof navigator === 'undefined' ? true : navigator.onLine !== false) {
  if (!isOnline) {
    throw new Error('Conecte-se à internet para salvar alterações na Minha Carteira.');
  }
}

export function guardWalletWrites<T extends Record<string, unknown>>(
  impl: T,
  readOnlyMethods: ReadonlySet<keyof T>,
  checkOnline: () => boolean = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
): T {
  return Object.fromEntries(
    (Object.keys(impl) as Array<keyof T>).map(key => {
      const member = impl[key];
      if (typeof member !== 'function' || readOnlyMethods.has(key)) {
        return [key, member];
      }
      return [
        key,
        (...args: unknown[]) => {
          assertWalletOnlineForWrite(checkOnline());
          return (member as (...params: unknown[]) => unknown).apply(impl, args);
        },
      ];
    }),
  ) as T;
}


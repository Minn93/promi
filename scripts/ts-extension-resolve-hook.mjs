const HAS_EXTENSION = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|json|node)$/;

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (!isRelative || HAS_EXTENSION.test(specifier)) {
    return nextResolve(specifier, context);
  }
  try {
    return await nextResolve(`${specifier}.ts`, context);
  } catch {
    return nextResolve(specifier, context);
  }
}

// Reading React's own tree from a MAIN-world bridge, the only place a page's React internals are visible.
// Every shape read here is Unqork's, unversioned, so callers check what they find and leave the page alone
// when it does not match.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Fiber = any;

export const fiberOf = (element: Element): Fiber => {
  const key = Object.keys(element).find(name => name.startsWith('__reactFiber$'));
  return key ? (element as unknown as Record<string, Fiber>)[key] : null;
};

// The element's fiber and its ancestors, nearest first, at most `depth` of them.
export function* ancestors(element: Element, depth: number): Generator<Fiber> {
  let fiber = fiberOf(element);
  for (let level = 0; fiber && level < depth; level++, fiber = fiber.return) yield fiber;
}

const indexOf = (parent: Fiber, a: Fiber, b: Fiber) => {
  for (let child = parent.child; child; child = child.sibling) {
    if (child === a) return 'a';
    if (child === b) return 'b';
  }
  return '';
};
// React keeps two versions of each fiber, and a memoized subtree keeps return pointers to
// stale ancestors. This mirrors React's findCurrentFiberUsingSlowPath: pair the two
// versions' ancestors up to the root, which knows its current version.
export function currentFiber(fiber: Fiber): Fiber {
  const alternate = fiber.alternate;
  if (!alternate) return fiber;
  let a = fiber;
  let b = alternate;
  for (let depth = 0; depth < 2000; depth++) {
    const parentA = a.return;
    if (!parentA) break;
    const parentB = parentA.alternate;
    if (!parentB) {
      if (!parentA.return) break;
      a = b = parentA.return;
      continue;
    }
    if (parentA.child === parentB.child) {
      const found = indexOf(parentA, a, b);
      return found === 'a' ? fiber : found === 'b' ? alternate : null;
    }
    if (a.return !== b.return) {
      a = parentA;
      b = parentB;
      continue;
    }
    const inA = indexOf(parentA, a, b);
    const inB = inA ? '' : indexOf(parentB, a, b);
    if (inA === 'a' || inB === 'b') { a = parentA; b = parentB; }
    else if (inA === 'b' || inB === 'a') { a = parentB; b = parentA; }
    else return null;
  }
  // a is now the root fiber, whose container records the current version.
  if (a.tag !== 3 || !a.stateNode) return null;
  return a.stateNode.current === a ? fiber : alternate;
}

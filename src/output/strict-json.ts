/**
 * Strict JSON parsing for custody artifacts (M6, 0.5.0).
 *
 * `JSON.parse` resolves duplicate object keys last-wins and says nothing.
 * For a custody manifest that is a hole: one document can mean one thing
 * to this verifier and another to a different reader (Proof-of-Control
 * C7.7.5 — "a parser rejects duplicate object keys rather than resolving
 * them last-wins, so that one evidence artifact cannot mean different
 * things to different readers"). This module is a minimal recursive-descent
 * JSON reader whose only extra behaviour is: a duplicate key inside any
 * object is a `DuplicateKeyError` naming the key and its path.
 *
 * Everything else follows RFC 8259: the same grammar `JSON.parse` accepts.
 * It is deliberately small so the normative behaviour is readable in one
 * place; it is not a performance path (manifests are kilobytes).
 */

export class DuplicateKeyError extends Error {
  constructor(
    public readonly key: string,
    public readonly path: string
  ) {
    super(`duplicate object key "${key}" at ${path}`);
    this.name = "DuplicateKeyError";
  }
}

export class StrictJsonSyntaxError extends Error {
  constructor(message: string, public readonly offset: number) {
    super(`${message} at offset ${offset}`);
    this.name = "StrictJsonSyntaxError";
  }
}

const WS = new Set([" ", "\t", "\n", "\r"]);

export function parseJsonStrict(text: string): unknown {
  let i = 0;
  const n = text.length;

  const fail = (msg: string): never => {
    throw new StrictJsonSyntaxError(msg, i);
  };
  const skipWs = (): void => {
    while (i < n && WS.has(text[i]!)) i++;
  };
  const expect = (ch: string): void => {
    if (text[i] !== ch) fail(`expected "${ch}"`);
    i++;
  };

  const parseString = (): string => {
    expect('"');
    let out = "";
    while (i < n) {
      const c = text[i]!;
      if (c === '"') {
        i++;
        return out;
      }
      if (c === "\\") {
        const e = text[i + 1];
        i += 2;
        switch (e) {
          case '"': out += '"'; break;
          case "\\": out += "\\"; break;
          case "/": out += "/"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "n": out += "\n"; break;
          case "r": out += "\r"; break;
          case "t": out += "\t"; break;
          case "u": {
            const hex = text.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("bad \\u escape");
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            fail("bad escape");
        }
        continue;
      }
      if (c < " ") fail("control character in string");
      out += c;
      i++;
    }
    return fail("unterminated string");
  };

  const parseNumber = (): number => {
    const start = i;
    if (text[i] === "-") i++;
    if (text[i] === "0") {
      i++;
    } else if (text[i]! >= "1" && text[i]! <= "9") {
      while (i < n && text[i]! >= "0" && text[i]! <= "9") i++;
    } else {
      fail("bad number");
    }
    if (text[i] === ".") {
      i++;
      if (!(text[i]! >= "0" && text[i]! <= "9")) fail("bad fraction");
      while (i < n && text[i]! >= "0" && text[i]! <= "9") i++;
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      if (!(text[i]! >= "0" && text[i]! <= "9")) fail("bad exponent");
      while (i < n && text[i]! >= "0" && text[i]! <= "9") i++;
    }
    return Number(text.slice(start, i));
  };

  const parseValue = (path: string): unknown => {
    skipWs();
    const c = text[i];
    if (c === undefined) return fail("unexpected end of input");
    if (c === "{") {
      i++;
      const obj: Record<string, unknown> = {};
      const seen = new Set<string>();
      skipWs();
      if (text[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        skipWs();
        const key = parseString();
        if (seen.has(key)) throw new DuplicateKeyError(key, path);
        seen.add(key);
        skipWs();
        expect(":");
        obj[key] = parseValue(`${path}.${key}`);
        skipWs();
        if (text[i] === ",") {
          i++;
          continue;
        }
        expect("}");
        return obj;
      }
    }
    if (c === "[") {
      i++;
      const arr: unknown[] = [];
      skipWs();
      if (text[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(parseValue(`${path}[${arr.length}]`));
        skipWs();
        if (text[i] === ",") {
          i++;
          continue;
        }
        expect("]");
        return arr;
      }
    }
    if (c === '"') return parseString();
    if (c === "t") { if (text.startsWith("true", i)) { i += 4; return true; } fail("bad literal"); }
    if (c === "f") { if (text.startsWith("false", i)) { i += 5; return false; } fail("bad literal"); }
    if (c === "n") { if (text.startsWith("null", i)) { i += 4; return null; } fail("bad literal"); }
    if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
    return fail(`unexpected character "${c}"`);
  };

  const value = parseValue("$");
  skipWs();
  if (i !== n) fail("trailing characters after JSON value");
  return value;
}

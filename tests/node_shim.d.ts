// Minimal typings for the two Node modules the art tests read files with (avoids adding @types/node).
declare module 'node:fs' {
  export function readFileSync(path: string): { toString(enc?: string, start?: number, end?: number): string; readUIntLE(offset: number, len: number): number };
  export function readFileSync(path: string, enc: string): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { size: number };
}
declare module 'node:path' {
  export function join(...p: string[]): string;
}

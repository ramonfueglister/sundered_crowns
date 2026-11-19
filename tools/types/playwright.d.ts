// The part of Playwright the tools use. Playwright is the cloud's own, installed with its browser, and not a dependency
// of the game (tools/lookprobe/shot.mjs finds it the same way), so its own types are not in node_modules.
declare module 'playwright' {
  export interface Page {
    goto(url: string): Promise<unknown>;
    evaluate<R>(fn: () => R | Promise<R>): Promise<R>;
    evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
    waitForTimeout(ms: number): Promise<void>;
    screenshot(options?: { path?: string; omitBackground?: boolean }): Promise<Buffer>;
  }
  export interface Browser {
    newPage(options?: { viewport?: { width: number; height: number } }): Promise<Page>;
    close(): Promise<void>;
  }
  export const chromium: { launch(options?: { executablePath?: string; args?: string[] }): Promise<Browser> };
}

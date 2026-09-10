// Renderer menuju adapter sistem di main process (desktop only).

export interface AllowEntry {
  command: string
  args: string[]
}

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

interface SysBridge {
  readFile: (filePath: string) => Promise<{ content: string; truncated: boolean }>
  allowlist: () => Promise<AllowEntry[]>
  addAllow: (command: string, args: string[]) => Promise<AllowEntry[]>
  removeAllow: (index: number) => Promise<AllowEntry[]>
  run: (command: string, args: string[]) => Promise<RunResult>
}

const bridge = (): SysBridge | undefined =>
  (window as unknown as { elion?: { sys?: SysBridge } }).elion?.sys

export const isSysDesktop = () => bridge() !== undefined

export const SYS_DESKTOP_ONLY = 'System access needs the desktop app.'

export async function sysReadFile(filePath: string): Promise<{ content: string; truncated: boolean }> {
  const sys = bridge()
  if (!sys) throw new Error(SYS_DESKTOP_ONLY)
  return sys.readFile(filePath)
}

export async function sysAllowlist(): Promise<AllowEntry[]> {
  const sys = bridge()
  if (!sys) throw new Error(SYS_DESKTOP_ONLY)
  return sys.allowlist()
}

export async function sysAllowAdd(command: string, args: string[]): Promise<AllowEntry[]> {
  const sys = bridge()
  if (!sys) throw new Error(SYS_DESKTOP_ONLY)
  return sys.addAllow(command, args)
}

export async function sysAllowRemove(index: number): Promise<AllowEntry[]> {
  const sys = bridge()
  if (!sys) throw new Error(SYS_DESKTOP_ONLY)
  return sys.removeAllow(index)
}

export async function sysRun(command: string, args: string[]): Promise<RunResult> {
  const sys = bridge()
  if (!sys) throw new Error(SYS_DESKTOP_ONLY)
  return sys.run(command, args)
}

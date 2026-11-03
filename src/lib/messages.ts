import { api, type Stored } from './api';
import type { AccessKind } from './access';
import type { Group, EnvironmentSettings } from './environment';
import type { QuickRequest, QuickResult } from './quick-actions';

// The messages the background answers, with what each sends and what a successful reply adds to `ok`.
// Senders and the background both type against this list, so the two sides cannot drift apart.

// What the prompt window can be opened for by a popup; Debug tools open theirs through debug.permission.
export const promptKinds = ['devOverlay', 'sseDebugger', 'badges', 'import'] as const;
export type PromptKind = typeof promptKinds[number];

export interface EnvironmentRequest {
  group?: Group | null;
  deleteId?: string;
  preferences?: Partial<Pick<EnvironmentSettings, 'badge' | 'blockProduction' | 'autoDiscover'>>;
  replace?: EnvironmentSettings;
}
interface EnvironmentReply { config: Stored; missingOrigins?: string[] }
interface PromptRequest { kind: AccessKind; tab?: string }
interface OverlayRequest { option?: 'debugger' }

export interface Messages {
  'prompt.open': { request: { kind: PromptKind }; reply: { granted: boolean } };
  'prompt.describe': { request: PromptRequest; reply: { origins: string[]; host?: string } };
  'prompt.granted': { request: PromptRequest; reply: object };
  'devOverlay.state': { request: OverlayRequest; reply: { on: boolean } };
  'devOverlay.set': { request: OverlayRequest & { on: boolean }; reply: { on: boolean; needsAccess?: boolean } };
  'sse.open': { request: { width?: number; height?: number; left?: number; top?: number }; reply: object };
  'floating.open': { request: object; reply: object };
  'floating.target': { request: object; reply: { tab: { id: number; url: string } } };
  'debug.access': { request: object; reply: { granted: boolean } };
  'debug.permission': { request: object; reply: { granted: boolean } };
  'debug.execute': { request: { request: QuickRequest }; reply: { result?: QuickResult } };
  'environment.observe': { request: object; reply: { config: Stored } };
  'environment.read': { request: EnvironmentRequest; reply: EnvironmentReply };
  'environment.save': { request: EnvironmentRequest; reply: EnvironmentReply };
  'environment.sync': { request: EnvironmentRequest; reply: EnvironmentReply };
}
export type MessageType = keyof Messages;
export type Message<Type extends MessageType = MessageType> = { type: Type } & Messages[Type]['request'];
export type Success<Type extends MessageType> = { ok: true } & Messages[Type]['reply'];
// A refused request gets no reply at all, so a sender reads that as a failure too.
export type Reply<Type extends MessageType> = Success<Type> | { ok: false; error?: string };

// Sends a message and returns the successful reply, or throws the background's error, else `fallback`.
export async function send<Type extends MessageType>(message: Message<Type>, fallback: string): Promise<Success<Type>> {
  const result = await api.runtime.sendMessage(message) as Reply<Type> | undefined;
  if (!result?.ok) throw new Error(result?.error || fallback);
  return result;
}

// Answers a message from the background's listener once `task` settles. Returns true, which keeps the
// channel open for the asynchronous reply.
export function reply<Type extends MessageType>(respond: (reply: Reply<Type>) => void, task: Promise<Reply<Type>>): true {
  task.then(respond, (error: Error | undefined) => respond({ ok:false, error:error?.message }));
  return true;
}

import type { NoviAPI, Result } from '../../../shared/types';
declare global { interface Window { novi: NoviAPI } }
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

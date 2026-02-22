import { devLog } from '../utils/devLog';

type InputHandler = (button: string) => void;

const stack: InputHandler[] = [];

export function pushInputLayer(handler: InputHandler): void {
  stack.push(handler);
  devLog('input', `Modal stack push (depth: ${stack.length})`);
}

export function popInputLayer(): void {
  stack.pop();
  devLog('input', `Modal stack pop (depth: ${stack.length})`);
}

export function getTopInputLayer(): InputHandler | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/**
 * Unit tests for the widget event emitter.
 */
import { describe, it, expect, vi } from 'vitest';
import { createEventEmitter } from './event-emitter';

interface TestEvents {
  'foo': string;
  'bar': number;
  'empty': void;
}

describe('createEventEmitter', () => {
  it('calls handler when event is emitted', () => {
    const ee = createEventEmitter<TestEvents>();
    const handler = vi.fn();
    ee.on('foo', handler);
    ee.emit('foo', 'hello');
    expect(handler).toHaveBeenCalledWith('hello');
  });

  it('supports multiple handlers for the same event', () => {
    const ee = createEventEmitter<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    ee.on('foo', h1);
    ee.on('foo', h2);
    ee.emit('foo', 'test');
    expect(h1).toHaveBeenCalledWith('test');
    expect(h2).toHaveBeenCalledWith('test');
  });

  it('on() returns an unsubscribe function', () => {
    const ee = createEventEmitter<TestEvents>();
    const handler = vi.fn();
    const off = ee.on('foo', handler);
    off();
    ee.emit('foo', 'should not receive');
    expect(handler).not.toHaveBeenCalled();
  });

  it('off() removes a specific handler', () => {
    const ee = createEventEmitter<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    ee.on('foo', h1);
    ee.on('foo', h2);
    ee.off('foo', h1);
    ee.emit('foo', 'only h2');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledWith('only h2');
  });

  it('clear() removes all handlers', () => {
    const ee = createEventEmitter<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    ee.on('foo', h1);
    ee.on('bar', h2);
    ee.clear();
    ee.emit('foo', 'nope');
    ee.emit('bar', 42);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('does not throw when emitting with no handlers', () => {
    const ee = createEventEmitter<TestEvents>();
    expect(() => ee.emit('foo', 'no listeners')).not.toThrow();
  });

  it('catches handler errors without stopping other handlers', () => {
    const ee = createEventEmitter<TestEvents>();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwingHandler = () => { throw new Error('boom'); };
    const normalHandler = vi.fn();
    ee.on('foo', throwingHandler);
    ee.on('foo', normalHandler);
    ee.emit('foo', 'test');
    expect(normalHandler).toHaveBeenCalledWith('test');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('handles different event types independently', () => {
    const ee = createEventEmitter<TestEvents>();
    const fooHandler = vi.fn();
    const barHandler = vi.fn();
    ee.on('foo', fooHandler);
    ee.on('bar', barHandler);
    ee.emit('foo', 'hello');
    expect(fooHandler).toHaveBeenCalledWith('hello');
    expect(barHandler).not.toHaveBeenCalled();
  });

  it('off() is idempotent (does not throw for already-removed handler)', () => {
    const ee = createEventEmitter<TestEvents>();
    const handler = vi.fn();
    ee.on('foo', handler);
    ee.off('foo', handler);
    expect(() => ee.off('foo', handler)).not.toThrow();
  });
});

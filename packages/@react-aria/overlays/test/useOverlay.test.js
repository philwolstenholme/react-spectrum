/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import {fireEvent, installMouseEvent, installPointerEvent, render} from '@react-spectrum/test-utils-internal';
import {mergeProps} from '@react-aria/utils';
import React, {useRef} from 'react';
import {useOverlay} from '../';

function Example(props) {
  let ref = useRef();
  let {overlayProps, underlayProps} = useOverlay(props, ref);
  return (
    <div {...mergeProps(underlayProps, props.underlayProps || {})}>
      <div ref={ref} {...overlayProps} data-testid={props['data-testid'] || 'test'}>
        {props.children}
      </div>
    </div>
  );
}

describe('useOverlay', function () {
  describe.each`
    type                | prepare               | actions
    ${'Mouse Events'}   | ${installMouseEvent}  | ${[
      (el) => fireEvent.mouseDown(el, {button: 0}),
      (el) => fireEvent.mouseUp(el, {button: 0})
    ]}
    ${'Pointer Events'} | ${installPointerEvent}| ${[
      (el) => fireEvent.pointerDown(el, {button: 0, pointerId: 1}),
      (el) => fireEvent.pointerUp(el, {button: 0, pointerId: 1})
    ]}
    ${'Touch Events'}   | ${() => {}}           | ${[
      (el) => fireEvent.touchStart(el, {changedTouches: [{identifier: 1}]}),
      (el) => fireEvent.touchEnd(el, {changedTouches: [{identifier: 1}]})
    ]}
  `('$type', ({actions: [pressStart, pressEnd], prepare}) => {
    prepare();

    it('should not focus the overlay if a child is focused', function () {
      let res = render(
        <Example isOpen>
          <input autoFocus data-testid="input" />
        </Example>
      );

      let input = res.getByTestId('input');
      expect(document.activeElement).toBe(input);
    });

    it('should hide the overlay when clicking outside if isDismissble is true', function () {
      let onClose = jest.fn();
      render(<Example isOpen onClose={onClose} isDismissable />);
      pressStart(document.body);
      pressEnd(document.body);
      fireEvent.click(document.body);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should hide the overlay when clicking outside if shouldCloseOnInteractOutside returns true', function () {
      let onClose = jest.fn();
      render(<Example isOpen onClose={onClose} isDismissable shouldCloseOnInteractOutside={target => target === document.body} />);
      pressStart(document.body);
      pressEnd(document.body);
      fireEvent.click(document.body);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not hide the overlay when clicking outside if shouldCloseOnInteractOutside returns false', function () {
      let onClose = jest.fn();
      render(<Example isOpen onClose={onClose} isDismissable shouldCloseOnInteractOutside={target => target !== document.body} />);
      pressStart(document.body);
      pressEnd(document.body);
      fireEvent.click(document.body);
      expect(onClose).toHaveBeenCalledTimes(0);
    });

    it('should not hide the overlay when clicking outside if isDismissable is false', function () {
      let onClose = jest.fn();
      render(<Example isOpen onClose={onClose} isDismissable={false} />);
      pressStart(document.body);
      pressEnd(document.body);
      fireEvent.click(document.body);
      expect(onClose).toHaveBeenCalledTimes(0);
    });

    it('should only hide the top-most overlay', function () {
      let onCloseFirst = jest.fn();
      let onCloseSecond = jest.fn();
      render(<Example isOpen onClose={onCloseFirst} isDismissable />);
      let second = render(<Example isOpen onClose={onCloseSecond} isDismissable />);

      pressStart(document.body);
      pressEnd(document.body);
      fireEvent.click(document.body);
      expect(onCloseSecond).toHaveBeenCalledTimes(1);
      expect(onCloseFirst).not.toHaveBeenCalled();

      second.unmount();

      pressStart(document.body);
      pressEnd(document.body);
      fireEvent.click(document.body);
      expect(onCloseFirst).toHaveBeenCalledTimes(1);
    });
  });

  it('should hide the overlay when pressing the escape key', function () {
    let onClose = jest.fn();
    let res = render(<Example isOpen onClose={onClose} />);
    let el = res.getByTestId('test');
    fireEvent.keyDown(el, {key: 'Escape'});
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should still hide the overlay when pressing the escape key if isDismissable is false', function () {
    let onClose = jest.fn();
    let res = render(<Example isOpen onClose={onClose} isDismissable={false} />);
    let el = res.getByTestId('test');
    fireEvent.keyDown(el, {key: 'Escape'});
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('firefox bug', () => {
    installPointerEvent();
    it('should prevent default on pointer down on the underlay', function () {
      let underlayRef = React.createRef();
      render(<Example isOpen isDismissable underlayProps={{ref: underlayRef}} />);
      let isPrevented = fireEvent.pointerDown(underlayRef.current, {button: 0, pointerId: 1});
      fireEvent.pointerUp(document.body);
      expect(isPrevented).toBeFalsy(); // meaning the event had preventDefault called
    });
  });

  describe('CloseWatcher', () => {
    let mockCloseWatchers = [];
    let originalCloseWatcher;

    class MockCloseWatcher {
      constructor() {
        this.listeners = {};
        this.destroyed = false;
        mockCloseWatchers.push(this);
      }

      addEventListener(event, callback) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
      }

      removeEventListener(event, callback) {
        if (this.listeners[event]) {
          this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
      }

      destroy() {
        this.destroyed = true;
        this.listeners = {};
      }

      // Test helper to trigger close event
      triggerClose() {
        if (this.listeners.close) {
          this.listeners.close.forEach(cb => cb());
        }
      }
    }

    beforeAll(() => {
      originalCloseWatcher = window.CloseWatcher;
      window.CloseWatcher = MockCloseWatcher;
    });

    afterAll(() => {
      if (originalCloseWatcher) {
        window.CloseWatcher = originalCloseWatcher;
      } else {
        delete window.CloseWatcher;
      }
    });

    beforeEach(() => {
      mockCloseWatchers.forEach(w => w.destroy());
      mockCloseWatchers = [];
    });

    afterEach(() => {
      mockCloseWatchers.forEach(w => w.destroy());
      mockCloseWatchers = [];
    });

    it('should use CloseWatcher when available', function () {
      let onClose = jest.fn();
      render(<Example isOpen onClose={onClose} />);

      expect(mockCloseWatchers.length).toBe(1);
      expect(mockCloseWatchers[0].destroyed).toBe(false);
    });

    it('should hide the overlay when CloseWatcher close event fires', function () {
      let onClose = jest.fn();
      render(<Example isOpen onClose={onClose} />);

      expect(mockCloseWatchers.length).toBe(1);
      mockCloseWatchers[0].triggerClose();

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should destroy CloseWatcher when overlay unmounts', function () {
      let onClose = jest.fn();
      let {unmount} = render(<Example isOpen onClose={onClose} />);

      expect(mockCloseWatchers.length).toBe(1);
      let watcher = mockCloseWatchers[0];
      expect(watcher.destroyed).toBe(false);

      unmount();

      expect(watcher.destroyed).toBe(true);
    });

    it('should not create CloseWatcher when isKeyboardDismissDisabled is true', function () {
      let onClose = jest.fn();
      render(<Example isOpen onClose={onClose} isKeyboardDismissDisabled />);

      expect(mockCloseWatchers.length).toBe(0);
    });

    it('should create one CloseWatcher per overlay (stacking is handled by browser)', function () {
      let onCloseFirst = jest.fn();
      let onCloseSecond = jest.fn();
      render(<Example isOpen onClose={onCloseFirst} />);
      let second = render(<Example isOpen onClose={onCloseSecond} />);

      // Each overlay creates its own CloseWatcher
      // Browser handles stacking - only topmost watcher fires
      expect(mockCloseWatchers.length).toBe(2);
      expect(mockCloseWatchers[0].destroyed).toBe(false);
      expect(mockCloseWatchers[1].destroyed).toBe(false);

      // Simulate browser behavior: only topmost watcher fires
      mockCloseWatchers[1].triggerClose();
      expect(onCloseSecond).toHaveBeenCalledTimes(1);
      expect(onCloseFirst).not.toHaveBeenCalled();

      second.unmount();

      // Second watcher should be destroyed
      expect(mockCloseWatchers[1].destroyed).toBe(true);
      expect(mockCloseWatchers[0].destroyed).toBe(false);

      // First watcher is now topmost, can fire
      mockCloseWatchers[0].triggerClose();
      expect(onCloseFirst).toHaveBeenCalledTimes(1);
    });

    it('should not use keyboard handler when CloseWatcher is available', function () {
      let onClose = jest.fn();
      let res = render(<Example isOpen onClose={onClose} />);
      let el = res.getByTestId('test');

      expect(mockCloseWatchers.length).toBe(1);

      // Keyboard handler should be bypassed when CloseWatcher is available
      fireEvent.keyDown(el, {key: 'Escape'});

      // onClose should not be called from keyDown since CloseWatcher handles it
      expect(onClose).toHaveBeenCalledTimes(0);

      // But CloseWatcher close event should still work
      mockCloseWatchers[0].triggerClose();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should destroy CloseWatcher when overlay closes', function () {
      let onClose = jest.fn();
      let {rerender} = render(<Example isOpen onClose={onClose} />);

      expect(mockCloseWatchers.length).toBe(1);
      let watcher = mockCloseWatchers[0];
      expect(watcher.destroyed).toBe(false);

      rerender(<Example isOpen={false} onClose={onClose} />);

      expect(watcher.destroyed).toBe(true);
    });
  });
});
